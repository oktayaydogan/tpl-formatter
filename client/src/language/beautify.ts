import { FormattingOptions } from 'vscode';
import { FormattingLiterals, FormattingTags } from "../interfaces";
import { CONFIG } from "../configuration";

const beautify = require("../js-beautify").html;

export class BeautifySmarty {

	private literals: FormattingLiterals = {
		strings: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/,
		smartyComment: /{\*[\s\S]*?\*}/,
		htmlComment: /<!--[\s\S]*?-->/,
		cssComment: /\/\*[\s\S]*?\*\//,
		scriptTemplate: /<script .*?type=['"]text\/template['"].*?>[\s\S]*?<\/script>/
	};

	private tags: FormattingTags = {
		start: new Set(["block", "capture", "for", "foreach", "function", "if", "literal", "section", "setfilter", "strip", "while"]),
		middle: new Set(["else", "elseif", "foreachelse", "sectionelse"]),
		end: new Set(["block", "capture", "for", "foreach", "function", "if", "literal", "section", "setfilter", "strip", "while"])
	};

	private wrapTags: Set<string> = new Set(["component", "include", "include_scoped", "assign"]);
	private logicTags: Set<string> = new Set(["if", "elseif", "while"]);
	
	// Store processed tags for restoration
	private smartyTags: string[] = [];
    private currentConfig: any = {};

	public beautify(docText: String, options: FormattingOptions): string {
		// preprocess smarty tags to pseudo-HTML
		let processed = this.preprocess(docText as string);

		// format using js-beautify
		const beautifyConfig = this.beautifyConfig(options);
        this.currentConfig = beautifyConfig;
		let beautified = beautify(processed, beautifyConfig);

		// postprocess back to smarty
		let postProcessed = this.postprocess(beautified);

		// split into lines for final pass
		const literalPattern: string = Object.values(this.literals).map(r => r.source).join("|");
		const linkPattern: RegExp = new RegExp(`${literalPattern}|(?<linebreak>\r?\n)|(?<end>$)`, "gm");

		let start: number = 0;
		let lines: string[] = [];
		let match: any;
		while (match = linkPattern.exec(postProcessed)) {
			if (match.index === linkPattern.lastIndex) linkPattern.lastIndex++;
			if (match.groups.linebreak !== undefined) {
				lines.push(postProcessed.substring(start, match.index));
				start = match.index + match.groups.linebreak.length;
			} else if (match.groups.end !== undefined) {
				lines.push(postProcessed.substring(start, postProcessed.length));
				break;
			}
		}

		const indent_char = beautifyConfig.indent_with_tabs ? "\t" : " ".repeat(beautifyConfig.indent_size);
		
		// Wrap long tags
		lines = this.wrapLongTags(lines, indent_char);

		// Final pass to fix internal indentation and wrapping of tags
		let finalLines: string[] = [];
		let insideMultilineTag = false;
		let lastTagIndent = "";
		let insideScriptOrStyle = false;
		let insideHtmlTagAttributes = false;
        let attrIndentLevel = 0;


		let indentStack: string[] = [];
		for (let line of lines) {
			let trimmed = line.trim();
			let indentMatch = line.match(/^([ \t]*)/);
			let currentIndent = indentMatch ? indentMatch[0] : "";

			// Check for script/style tag boundaries
			if (trimmed.match(/^<(script|style)/i) && !trimmed.match(/<\/(script|style)>/i)) {
				insideScriptOrStyle = true;
			} else if (trimmed.match(/<\/(script|style)>/i)) {
				insideScriptOrStyle = false;
			}

            // Check for HTML tag boundaries (to detect if we are inside attributes area)
            // e.g. <div class="..."
            // We want to detect if we are inside < ... > but NOT inside content.
            // This is tricky with regex but heuristic: 
            // - Starts with <tag (and not </tag) and DOES NOT end with > or /> 
            // - OR we are already inside and it ends with > or />
            
            // Note: insideScriptOrStyle takes precedence.
            if (!insideScriptOrStyle) {
                if (!insideHtmlTagAttributes && trimmed.match(/^<[a-zA-Z0-9:-]+/) && !trimmed.match(/^<\//) && !trimmed.match(/>$/) && !trimmed.match(/\/>$/)) {
                    insideHtmlTagAttributes = true;
                    attrIndentLevel = 0; // Reset level when entering new tag
                } else if (insideHtmlTagAttributes) {
                    // Check if tag closes on this line. 
                    // Be careful about attribute values containing >.
                    // Simple heuristic: if line ends with > or />
                    if (trimmed.match(/>$/) || trimmed.match(/\/>$/)) {
                       insideHtmlTagAttributes = false;
                       attrIndentLevel = 0; // Reset level when leaving tag
                    }
                }
            }

			// If inside script/style, skip Smarty specific logic but keep the line as is (from js-beautify)
			if (insideScriptOrStyle) {
				// ... (script/style logic remains same)
				if (indentStack.length > 0) {
					const baseIndent = indentStack[indentStack.length - 1];
					const minIndent = baseIndent + indent_char;
					if (!currentIndent.startsWith(minIndent) && !currentIndent.startsWith(baseIndent)) {
						if (!currentIndent.startsWith(baseIndent)) {
							currentIndent = baseIndent + indent_char + currentIndent; // Add base indent
							line = currentIndent + trimmed;
						}
					}
				}
				finalLines.push(line);
				continue;
			}


			// 2. Detect if this line CLOSES a structural block (starts with it)
			const endTagMatch = trimmed.match(/^{{?\s*\/(\w+)/);
			if (endTagMatch && this.tags.end.has(endTagMatch[1])) {
                if (insideHtmlTagAttributes) {
                    if (attrIndentLevel > 0) attrIndentLevel--;
                } else {
				    indentStack.pop();
                }
			}

			// 3. Apply relative indentation from the stack
			if (insideHtmlTagAttributes) {
                // Attribute Logic: Relative indentation based on level
                if (attrIndentLevel > 0) {
                     // Add extra indentation on top of current (js-beautify) indentation
                     // But do NOT touch closing tags > or />
                     if (trimmed !== '>' && trimmed !== '/>') {
                         line = currentIndent + indent_char.repeat(attrIndentLevel) + trimmed;
                     }
                }
            } else {
                // Regular Logic: Absolute indentation based on stack
                if (indentStack.length > 0) {
                    // GUARD: If this line is just the closing of an HTML tag (> or />), 
                    // do NOT apply the stack indentation. Let it align with the start tag (handled by js-beautify).
                    if (trimmed !== '>' && trimmed !== '/>') {
                        const baseIndent = indentStack[indentStack.length - 1];
                        const minIndent = baseIndent + indent_char;
                        if (!currentIndent.startsWith(minIndent)) {
                            if (currentIndent.startsWith(baseIndent)) {
                                currentIndent = baseIndent + indent_char + currentIndent.substring(baseIndent.length);
                            } else {
                                currentIndent = minIndent + currentIndent.trim();
                            }
                            line = currentIndent + trimmed;
                        }
                    }
                }
			}

			// 4. Out-dent middle tags (else, elseif, etc.)
			if (this.isMiddleTag(trimmed)) {
                if (insideHtmlTagAttributes) {
                    // For attributes, we just want to dedent one level relative to the content
                    if (attrIndentLevel > 0) {
                         // Remove one indent char if possible
                         line = line.replace(indent_char, "");
                    }
                } else {
                    if (currentIndent.startsWith(indent_char)) {
                        currentIndent = currentIndent.substring(indent_char.length);
                        line = currentIndent + trimmed;
                    }
                }
			}

			// 5. Handle structural tag transition and stack PUSH
			if (!insideMultilineTag && (trimmed.startsWith('{') || trimmed.startsWith('{{')) && !trimmed.includes('}') && !trimmed.includes('}}')) {
				insideMultilineTag = true;
				lastTagIndent = currentIndent;
				
				const startTagMatch = trimmed.match(/^{{?\s*(\w+)/);
				if (startTagMatch && this.tags.start.has(startTagMatch[1])) {
                    if (insideHtmlTagAttributes) {
                        attrIndentLevel++;
                    } else {
					    indentStack.push(currentIndent);
                    }
				}
				finalLines.push(line);
			} else if (insideMultilineTag && (trimmed === '}' || trimmed === '}}' || (trimmed.endsWith('}') && !trimmed.includes('{')) || (trimmed.startsWith('{/') || trimmed.startsWith('{{/')))) {
				insideMultilineTag = false;
				finalLines.push(lastTagIndent + trimmed);
			} else {
				// Special case: check if we just pushed a structural START tag that was NOT multiline
				if (!insideMultilineTag && (trimmed.startsWith('{') || trimmed.startsWith('{{'))) {
					const startTagMatch = trimmed.match(/^{{?\s*(\w+)/);
					if (startTagMatch && this.tags.start.has(startTagMatch[1])) {
						// Only push to stack if it's NOT a self-closing/inline tag on one line
						if (!trimmed.endsWith('}') && !trimmed.endsWith('}}')) {
							// Already handled by multiline logic above
						} else {
							// Check if it's a structural tag like {if ...} on one line
                            // CRITICAL FIX: Ensure we don't push if the tag is closed on the same line!
                            // e.g. {if $cond}val{/if}
                            const tagName = startTagMatch[1];
                            const closingRegex = new RegExp(`{{?\\s*\\/${tagName}\\s*}}?$`);
                            const isClosedOnSameLine = trimmed.match(closingRegex);

                            if (!isClosedOnSameLine) {
                                if (insideHtmlTagAttributes) {
                                    attrIndentLevel++;
                                } else {
                                    indentStack.push(currentIndent);
                                }
                            }
						}
					}
				}
				finalLines.push(line);
			}
		}


		let formatted = finalLines.join("\n").replace(/^[ \t]+$/gm, "");

		return formatted;
	}

	private beautifyConfig(options: FormattingOptions) {
		const config = {
			indent_size: options.tabSize,
			indent_with_tabs: !options.insertSpaces,
			indent_handlebars: false,
			indent_inner_html: CONFIG.indentInnerHtml,
			max_preserve_newlines: CONFIG.maxPreserveNewLines,
			preserve_newlines: CONFIG.preserveNewLines,
			wrap_line_length: 0, // Disable js-beautify wrapping for HTML/JS
			wrap_attributes: CONFIG.wrapAttributes,
			brace_style: "collapse,preserve-inline",
			jslint_happy: false,
			indent_empty_lines: true,
			html: {
				end_with_newline: CONFIG.endWithNewline,
				js: { end_with_newline: false },
				css: { end_with_newline: false },
			},
			templating: ["none"]
		};

		return config;
	}

	private wrapLongTags(lines: string[], indent_char: string): string[] {
		const wrapLineLength = CONFIG.wrapLineLength || 80;
		const newLines: string[] = [];
		let insideScriptOrStyle = false;

		for (let line of lines) {
			const trimmed = line.trim();
			
			// Check for script/style tag boundaries
			if (trimmed.match(/^<(script|style)/i) && !trimmed.match(/<\/(script|style)>/i)) {
				insideScriptOrStyle = true;
			} else if (trimmed.match(/<\/(script|style)>/i)) {
				insideScriptOrStyle = false;
			}

			if (insideScriptOrStyle) {
				newLines.push(line);
				continue;
			}

			const indentMatch = line.match(/^([ \t]*)/);
			const indent = indentMatch ? indentMatch[0] : "";
			const tagMatch = trimmed.match(/^({+)\s*(\w+)\s+(.*)(}+)$/);
			if (tagMatch) {
				const [_, leftBraces, tagName, content, rightBraces] = tagMatch;
				// Determine if we should treat this as an attribute-based tag
                // If it is in wrapTags OR it contains an array definition and is NOT a logic tag
                const hasArray = content.includes('[') && content.includes(']');
                const isAttributeTag = this.wrapTags.has(tagName) || (hasArray && !this.logicTags.has(tagName) && tagName !== 'literal');

				if (isAttributeTag) {
					const attrs = this.parseAttributes(content);
                   
                   // Check if forced wrap due to array or length
                   const arrayAttrs = attrs.filter(a => a.match(/=\s*\[/));
				   if (line.length > wrapLineLength || attrs.length > 3 || arrayAttrs.length > 0) {
						newLines.push(`${indent}${leftBraces}${tagName}`);
						for (const attr of attrs) {
                            // Use new formatter for potential arrays
                            const formattedLines = this.formatAttributeValue(attr, indent + indent_char, indent_char);
                            newLines.push(...formattedLines);
						}
						newLines.push(`${indent}${rightBraces}`);
						continue;
					}
				} else if (this.logicTags.has(tagName) && line.length > wrapLineLength) {
					const parts = this.splitLogicExpression(content);
					if (parts.length > 1) {
						newLines.push(`${indent}${leftBraces}${tagName} ${parts[0]}`);
						for (let j = 1; j < parts.length; j++) {
							newLines.push(`${indent}${indent_char}${parts[j]}`);
						}
						newLines.push(`${indent}${rightBraces}`);
						continue;
					}
				}
			}
			newLines.push(line);
		}
		return newLines;
	}

	private splitLogicExpression(content: string): string[] {
		const parts: string[] = [];
		let currentPart = "";
		let i = 0;
		let bracketDepth = 0;
		let parenDepth = 0;
		let quote = null;

		while (i < content.length) {
			const char = content[i];
			if (quote) {
				if (char === quote && content[i - 1] !== '\\') quote = null;
				currentPart += char;
			} else {
				if (char === '"' || char === "'") quote = char;
				else if (char === '[') bracketDepth++;
				else if (char === ']') bracketDepth--;
				else if (char === '(') parenDepth++;
				else if (char === ')') parenDepth--;
				else if (bracketDepth === 0 && parenDepth === 0) {
					const remaining = content.substring(i);
					const opMatch = remaining.match(/^\s*(&&|\|\||and|or)\s+/);
					if (opMatch) {
						if (currentPart.trim()) parts.push(currentPart.trim());
						currentPart = opMatch[1] + " ";
						i += opMatch[0].length;
						continue;
					}
				}
				currentPart += char;
			}
			i++;
		}
		if (currentPart.trim()) parts.push(currentPart.trim());
		return parts;
	}

	private isMiddleTag(trimmed: string): boolean {
		const m = trimmed.match(/^{{?\s*(\w+)/);
		return m !== null && this.tags.middle.has(m[1]);
	}

	private splitSmartyArray(content: string): string[] {
		const parts: string[] = [];
		let currentPart = "";
		let i = 0;
		let bracketDepth = 0;
		let parenDepth = 0;
        let braceDepth = 0;
		let quote = null;

		while (i < content.length) {
			const char = content[i];
			if (quote) {
				if (char === quote && content[i - 1] !== '\\') quote = null;
				currentPart += char;
			} else {
				if (char === '"' || char === "'") quote = char;
				else if (char === '[') bracketDepth++;
				else if (char === ']') bracketDepth--;
				else if (char === '(') parenDepth++;
				else if (char === ')') parenDepth--;
                else if (char === '{') braceDepth++;
                else if (char === '}') braceDepth--;
				
				if (char === ',' && bracketDepth === 0 && parenDepth === 0 && braceDepth === 0) {
					parts.push(currentPart.trim());
					currentPart = "";
				} else {
					currentPart += char;
				}
			}
			i++;
		}
		if (currentPart.trim()) parts.push(currentPart.trim());
		return parts;
	}

    private formatAttributeValue(attr: string, indent: string, indent_char: string): string[] {
        // Check if attribute is an array: key=[...] or just [...]
        // Regex to verify it ends with ] and has = followed by [
        const match = attr.match(/^([^=]+=\s*)\[([\s\S]*)\]$/);
        
        if (!match) {
            return [`${indent}${attr}`];
        }

        const prefix = match[1]; // key=
        const content = match[2]; // inner content
        
        const elements = this.splitSmartyArray(content);
        if (elements.length === 0) return [`${indent}${attr}`];

        const lines: string[] = [];
        lines.push(`${indent}${prefix}[`);
        
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            const isLast = i === elements.length - 1;
            // Add comma if not last? Smarty arrays need commas between elements.
            // splitSmartyArray consumes the comma.
            const suffix = isLast ? "" : ",";
            lines.push(`${indent}${indent_char}${el}${suffix}`);
        }
        
        lines.push(`${indent}]`);
        return lines;
    }

	private parseAttributes(content: string): string[] {
		const attrs: string[] = [];
		let i = 0;
		while (i < content.length) {
			// skip whitespace and commas
			while (i < content.length && /[\s,]/.test(content[i])) i++;
			if (i >= content.length) break;

			let start = i;
			// match key (any non-whitespace, non-comma, non-equals, non-brace)
			while (i < content.length && /[^\s,={}]/.test(content[i])) i++;
			let key = content.substring(start, i);

			// skip whitespace
			while (i < content.length && /\s/.test(content[i])) i++;
			
			if (i >= content.length || content[i] !== '=') {
				if (key) attrs.push(key);
				// If we didn't match a key and weren't at an '=', we must advance to avoid infinite loop
				if (start === i && i < content.length) i++;
				continue;
			}
			i++; // skip '='

			// skip whitespace
			while (i < content.length && /\s/.test(content[i])) i++;
			
			// match value (can be quoted string, array [], or just words)
			let valueStart = i;
			let bracketDepth = 0;
			let parenDepth = 0;
            let braceDepth = 0; // Smarty { } depth
			let quote = null;
			while (i < content.length) {
				const char = content[i];
				if (quote) {
                    if (char === '{') braceDepth++; // Track braces even inside quotes for Smarty safety
                    else if (char === '}') {
                        if (braceDepth > 0) braceDepth--;
                    }
                    
                    // Only close quote if we are not inside a Smarty block { ... } and not escaped
					if (char === quote && content[i-1] !== '\\' && braceDepth === 0) quote = null;
				} else {
					if (char === '"' || char === "'") quote = char;
					else if (char === '[') bracketDepth++;
					else if (char === ']') bracketDepth--;
					else if (char === '(') parenDepth++;
					else if (char === ')') parenDepth--;
                    else if (char === '{') braceDepth++;
                    else if (char === '}') { if (braceDepth > 0) braceDepth--; }
					else if (/[\s,]/.test(char) && bracketDepth === 0 && parenDepth === 0 && braceDepth === 0) break;
					// Note: we don't break on '}' if braceDepth is 0 because usually '}' ends the tag, handled by caller?
                    // Actually caller passes 'content' which is inside the tag { tag content }.
                    // So '}' should not be present in content usually, or only as part of logic.
				}
				i++;
			}
			let value = content.substring(valueStart, i);
			attrs.push(`${key}=${value}`);
		}
		return attrs;
	}

	private preprocess(text: string): string {
		this.smartyTags = [];
		let result = '';
		let i = 0;
		let pos = 0;
		let inScriptOrStyle = false; // Track context for correct comment type

		// Phase 1: Tokenize smarty tags.
        // Also convert {literal} tags to transparent comments so content parses as code.
		while (pos < text.length) {
			const char = text[pos];
            
            // Check for Script/Style start/end to determine context
            if (char === '<') {
                const remaining = text.substring(pos);
                if (remaining.match(/^<(script|style)/i)) {
                    inScriptOrStyle = true;
                } else if (remaining.match(/^<\/(script|style)/i)) {
                    inScriptOrStyle = false;
                }
            }
			
			// Check for start of Smarty tag
			if (char === '{') {
				const braceStart = pos;
				let braceCount = 0;
				let inQuote = null;
				let tagEnd = -1;
				
				// Count opening braces
				while (pos < text.length && text[pos] === '{') {
					braceCount++;
					pos++;
				}
				
				// Check if this looks like a Smarty tag
				const afterBraces = text.substring(pos).match(/^(\/?\w+)/);
				if (!afterBraces) {
					// Not a Smarty tag, just output the braces
					result += text.substring(braceStart, pos);
					continue;
				}

                const tagName = afterBraces[1];

                // HANDLING FOR LITERAL TAGS (Transparent Strategy)
                if (tagName === 'literal' || tagName === '/literal') {
                    // Find matching closing braces for this specific tag
                    // Need to advance pos to scan for closing '}'
                     let depth = braceCount;
                     let tempPos = pos;
                     let foundEnd = false;
                     // Simple scan for closing braces since literal tags don't have nested complex attrs usually
                     while (tempPos < text.length) {
                         if (text[tempPos] === '}') {
                             depth--;
                             if (depth === 0) {
                                  // Found end of tag
                                  let closeBraceCount = 1;
                                  while (tempPos + closeBraceCount < text.length && text[tempPos + closeBraceCount] === '}') {
                                      closeBraceCount++;
                                  }
                                  tagEnd = tempPos + closeBraceCount;
                                  foundEnd = true;
                                  break;
                             }
                         } else if (text[tempPos] === '{') {
                             depth++;
                         }
                         tempPos++;
                     }

                     if (foundEnd) {
                         // We found the full {literal} or {/literal} tag.
                         // Convert to comment based on context.
                         const isStart = tagName === 'literal';
                         const commentContent = isStart ? '___VSC_SMARTY_LITERAL_START___' : '___VSC_SMARTY_LITERAL_END___';
                         
                         let commentToken = "";
                         if (inScriptOrStyle) {
                             commentToken = `/* ${commentContent} */`;
                         } else {
                             commentToken = `<!-- ${commentContent} -->`;
                         }
                         
                         result += commentToken;
                         pos = tagEnd;
                         continue;
                     }
                }
				
				// Find matching closing braces
				let depth = braceCount; // Reset depth var name collision if sticking to previous logic
                // Actually we reuse the logic below for normal tags
				// ... (continuing standard logic)
                
                // Refactor: We need to run standard brace matching for non-literal tags
                // Since I can't easily jump to "continue standard logic" in this tool block without rewriting large chunk:
                
                // Let's implement standard brace matching here for non-literal
                 depth = braceCount;
				while (pos < text.length && depth > 0) {
					const c = text[pos];
					
					if (inQuote) {
						if (c === inQuote && text[pos - 1] !== '\\') {
							inQuote = null;
						}
					} else {
						if (c === '"' || c === "'") {
							inQuote = c;
						} else if (c === '{') {
							depth++;
						} else if (c === '}') {
							depth--;
							if (depth === 0) {
								// Count consecutive closing braces
								let closeBraceCount = 1;
								while (pos + closeBraceCount < text.length && text[pos + closeBraceCount] === '}') {
									closeBraceCount++;
								}
								tagEnd = pos + closeBraceCount;
								break;
							}
						}
					}
					pos++;
				}
				
				if (tagEnd > 0) {
					const match = text.substring(braceStart, tagEnd);
					const id = `___VSC_SMARTY_ID_${i}___`;
					this.smartyTags.push(match);
					i++;
					result += id;
					pos = tagEnd;
				} else {
					// Couldn't find closing braces, treat as literal
					result += text.substring(braceStart, pos);
				}
			} else {
				result += char;
				pos++;
			}
		}
		
		const tokenizedText = result;

		// Phase 2: Identify HTML tag regions in the tokenized text
		const htmlTagRegions: [number, number][] = [];
		const htmlTagRegex = /<[^>]*?>/g;
		let htmlMatch;
		while ((htmlMatch = htmlTagRegex.exec(tokenizedText)) !== null) {
			htmlTagRegions.push([htmlMatch.index, htmlMatch.index + htmlMatch[0].length]);
		}

		// Phase 3 & 4: Replace IDs with appropriate placeholders based on context
		return tokenizedText.replace(/___VSC_SMARTY_ID_(\d+)___/g, (match, idStr, offset) => {
			const index = parseInt(idStr);
			const originalTag = this.smartyTags[index];
			const isInsideHtml = htmlTagRegions.some(([start, end]) => offset >= start && offset < end);

			if (isInsideHtml) {
				return `___VSC_SMARTY_TOKEN_INDEX_${index}___`;
			}

			const tagMatch = originalTag.match(/^({+)(\/?)(\w+)([\s\S]*?)(}+)$/);
			if (tagMatch) {
				const [_, open, close, tag, content, end] = tagMatch;
                
                // CRITICAL: Prevent js-beautify from mangling literal tags by keeping them as tokens
                if (tag === 'literal') {
                    return `___VSC_SMARTY_TOKEN_INDEX_${index}___`;
                }

				if (this.tags.start.has(tag) || this.tags.end.has(tag)) {
					if (close) {
						return `</vsc-smarty-${tag}>`;
					} else {
						return `<vsc-smarty-${tag} data-smarty-open="${encodeURIComponent(open)}" data-smarty-close="${encodeURIComponent(end)}" data-smarty-content="${encodeURIComponent(content)}">`;
					}
				}
			}
			return `___VSC_SMARTY_TOKEN_INDEX_${index}___`;
		});
	}

	private postprocess(text: string): string {
        // Determine indent char from config
        const indent_size = this.currentConfig.indent_size || 4;
        const indent_char = this.currentConfig.indent_with_tabs ? "\t" : " ".repeat(indent_size);

        // Restore transparent literal comments back to tags with EXTRA INDENTATION
        // Capture block: START comment ... content ... END comment
        // Regex allows for HTML (<!--) or JS (/*) style comments
        const literalBlockRegex = /(?:<!--|\/\*)\s*___VSC_SMARTY_LITERAL_START___\s*(?:-->|\*\/)([\s\S]*?)(?:<!--|\/\*)\s*___VSC_SMARTY_LITERAL_END___\s*(?:-->|\*\/)/g;
        
        text = text.replace(literalBlockRegex, (match, innerContent) => {
            if (!innerContent) return "{literal}{/literal}";
            
            // Add one level of indentation to the inner content
            // innerContent contains lines largely indented by js-beautify.
            // We just add indent_char to the start of each valid line.
            
            const lines = innerContent.split('\n');
            const indentedLines = lines.map(line => {
                // If the line is empty or just whitespace, don't necessarily indent it? 
                // Usually editors handle empty lines by removing whitespace, but adding indent is safer for structure.
                if (!line.trim()) return line; 
                return indent_char + line;
            });
            
            let newContent = indentedLines.join('\n');
            
            // Return reconstruction
            return `{literal}${newContent}{/literal}`;
        });

		// Phase 5: Clean tokens from beautifier-introduced whitespace
		// Note: We don't un-wrap vsc-smarty pseudo-tags anymore to respect 
		// the beautifier's wrapping decisions (force-expand-multiline).
		text = text.replace(/(___VSC_SMARTY_TOKEN_[\s\S]*?___)/g, (match) => {
			return match.replace(/\r?\n\s*/g, '');
		});

		const braceStack: { open: string, close: string }[] = [];

		return text.replace(/___VSC_SMARTY_TOKEN_INDEX_(\d+)___/g, (match, indexStr) => {
			const index = parseInt(indexStr);
			let original = this.smartyTags[index] || match;
            
            // Flatten wrapTags so they can be re-wrapped correctly by wrapLongTags
            const tagNameMatch = original.match(/^{{?\s*(\w+)/);
            if (tagNameMatch && (this.wrapTags.has(tagNameMatch[1]) || this.logicTags.has(tagNameMatch[1]))) {
                 if (original.includes('\n')) {
                     original = original.replace(/\s+/g, ' ');
                 }
            }
            return original;
		}).replace(/<\s*vsc-smarty-(?!tag)([\w-]+)([\s\S]*?)>/g, (match, tag, attrs) => {
			const openMatch = attrs.match(/data-smarty-open="([^"]*)"/);
			const closeMatch = attrs.match(/data-smarty-close="([^"]*)"/);
			const contentMatch = attrs.match(/data-smarty-content="([^"]*)"/);
			const open = openMatch ? decodeURIComponent(openMatch[1]) : "{";
			const close = closeMatch ? decodeURIComponent(closeMatch[1]) : "}";
			const content = contentMatch ? decodeURIComponent(contentMatch[1]) : "";
			
			braceStack.push({ open, close });
			return `${open}${tag}${content}${close}`;
		}).replace(/<\s*\/vsc-smarty-(?!tag)([\w-]+)\s*>/g, (match, tag) => {
			const braces = braceStack.pop() || { open: "{", close: "}" };
			return `${braces.open}/${tag}${braces.close}`;
		});
	}
}
