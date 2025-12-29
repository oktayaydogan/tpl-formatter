# Changelog

All notable changes to the **Smarty Formatter** extension are documented in this file.

This project is a **new, independent extension** with its own versioning history.

---

## [0.1.0] – 2025-12-29

### Initial Release

This is the first public release of **Smarty Formatter** as a standalone and community-maintained extension.

### Added

* Core Smarty-aware formatting engine with tag wrapping logic
* Support for `{component}` and `{include_scoped}` snippets
* Support for `{sectionelse}` middle tag handling
* Multiline Smarty tag formatting support
* Improved detection of logic tags (`if`, `elseif`, `while`)
* Indentation preservation for nested Smarty structures

### Changed

* Initial implementation of the formatting pipeline (`beautify.ts`)
* Language configuration tuned for formatting stability
* Custom branding and extension icon

### Fixed

* Indentation issues in nested Smarty blocks
* Formatting inconsistencies in mixed HTML and Smarty templates

---

## Previous history

No previous versions exist prior to `0.1.0`.
Earlier experimentation and refactoring can be found in the Git commit history.
