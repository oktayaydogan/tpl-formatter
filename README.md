# TPL Formatter for Smarty Template Engine

![TPL Formatter for Smarty Template Engine Logo](images/logo.png)

TPL Formatter for Smarty Template Engine is a Visual Studio Code extension focused on **formatting and readability** for Smarty (`.tpl`) template files.

This project is a **community-maintained implementation** created to provide consistent formatting behavior and modern VS Code compatibility.

> ⚠️ This extension is **not affiliated with** the original “TPL Formatter for Smarty Template Engine” extension or its author.
> Branding, documentation, and maintenance are fully independent.

---

## 🎯 Scope & Purpose

TPL Formatter for Smarty Template Engine is intentionally focused on a clear and limited scope:

- Reliable document formatting
- Predictable indentation
- Safe handling of Smarty structures mixed with HTML

It does **not aim to replace full language tooling**. Instead, it focuses on making existing templates easier to read and maintain.

---

## ✨ Core Features

### ✨ Code Formatting

- Smarty-aware document formatter
- Indentation handling for nested Smarty blocks
- Safe formatting that does **not alter template logic**
- Compatible with VS Code’s built-in formatter workflow

### ✅ Supported Structures

- Block tags (`if`, `foreach`, `for`, `while`, `function`, etc.)
- Middle tags (`else`, `elseif`, `foreachelse`, `sectionelse`)
- Include and component tags
- Mixed Smarty + HTML templates

---

## 🧩 Editor Enhancements

- Basic syntax highlighting for Smarty tags and variables
- Code folding for block-level Smarty constructs
- Optional highlight decoration for better visual separation

> These features are intentionally lightweight and designed to work well alongside other VS Code extensions.

---

## 🚀 Usage

1. Open a `.tpl` file
2. Run **Format Document**

   - Windows / Linux: `Shift + Alt + F`
   - macOS: `Shift + Option + F`

3. Formatting is applied using your existing VS Code editor settings

### Respected VS Code Settings

- `editor.tabSize`
- `editor.insertSpaces`

No additional setup is required.

---

## ⚙️ Configuration

Optional highlight decoration can be configured:

```json
{
	"smarty.highlight": false,
	"smarty.highlightColor": {
		"dark": "#FFFFFF25",
		"light": "#FFFA0040"
	}
}
```

---

## 🆕 Recent Changes

### Version 0.1.0 (2025-12-29)

- Improved formatting stability for nested Smarty tags
- Better handling of multiline structures
- New snippet support for `{component}` and `{include_scoped}`
- Performance-oriented internal refactoring
- Updated extension icon

For a full history, see [CHANGELOG.md](CHANGELOG.md).

---

## 🛠 Maintenance & Contributions

This extension is actively maintained to:

- Address formatting edge cases
- Stay compatible with newer VS Code versions
- Improve performance and reliability

Contributions and feedback are welcome.

---

## 📦 Repository

[https://github.com/oktayaydogan/tpl-formatter](https://github.com/oktayaydogan/tpl-formatter)

---

## 📄 License

MIT License — see the LICENSE file for details.

---

## 👤 Author

**Oktay Aydoğan**
📧 [aydoganooktay@gmail.com](mailto:aydoganooktay@gmail.com)
