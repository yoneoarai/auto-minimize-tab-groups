# Tabbi — Tab Group Manager

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)
![Firefox Extension](https://img.shields.io/badge/Firefox-Extension-orange)
![Cross Browser](https://img.shields.io/badge/Cross--Browser-Compatible-blue)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-☕-yellow.svg)](https://coff.ee/yoneo)

A powerful cross-browser extension that automatically organizes your tabs into named, colored tab groups using URL pattern rules, and intelligently minimizes (collapses) inactive tab groups with per-group customization.

**Supports both Google Chrome and Mozilla Firefox (138+)!**

---

## Features

- **Automated URL Grouping**: Define priority-ordered rules to automatically sort tabs into named, colored groups based on URL patterns.
- **Per-Group Collapse Settings**: Customize collapse timeout per group or completely disable auto-minimization for specific groups (e.g. keep GitHub always open, collapse social media after 5s).
- **Pause Auto-Collapse**: Temporarily pause auto-collapsing across all groups with a single click or keyboard shortcut (`Alt+Shift+P`), keeping all groups open while you work across them. Timers are suspended with zero idle CPU overhead.
- **Toolbar Badges & Status Indicators**: Extension icon dynamically swaps to a dedicated paused icon when auto-collapse is paused or displays an `OFF` badge (grey) when disabled.
- **Active Tab Protection**: Groups containing the currently active tab in the focused window are never minimized.
- **Service Worker Resilience**: Bulletproof state recovery across Chrome MV3 service worker suspensions and wake-ups.
- **Native Dark Mode**: Popup and settings interfaces seamlessly adapt to system/browser dark mode (`prefers-color-scheme: dark`).
- **Manual Move Respect**: If you manually drag a tab to a different group, Tabbi respects your override until the tab navigates to a new URL.
- **Catch-All Fallback Group**: Choose to leave unmatched tabs as-is or gather them into a customizable fallback group integrated directly into your rules list with full reordering and priority controls.
- **Configurable Group Ordering**: Arrange tab groups in your tab strip manually (drag-and-drop order in settings) or alphabetically via an in-card toggle on the rules list. Newly created groups are instantly placed in their proper position.
- **Forward-Compatible & Persistent**: Settings, rules, and customizations persist seamlessly across extension updates without risk of data loss.
- **Full Settings UI & Pattern Tester**: Interactive options page with live pattern testing, drag-and-drop rule reordering, and schema-validated JSON import/export.
- **Quick-Access Popup**: Toggle Tabbi on/off, pause collapsing, inspect live group stats, and jump to full settings.
- **Multi-Window Support**: Seamlessly manages tab groups across multiple browser windows.

---

## Pattern Matching Guide

Tabbi's pattern matching engine supports flexible domain, subdomain, wildcard, and path rules with built-in phishing/lookalike protection:

| Pattern | Matches | Does Not Match |
| :--- | :--- | :--- |
| `google.com` | `https://google.com`, `https://www.google.com/search`, `https://mail.google.com`, `http://google.com:8080` | `notgoogle.com`, `evil-google.com`, `google.com.phishing.com` |
| `*.google.com` | `https://mail.google.com`, `https://docs.google.com/doc/123`, `https://google.com` | `notgoogle.com` |
| `mail.google.com` | `https://mail.google.com`, `https://sub.mail.google.com` | `https://google.com`, `https://docs.google.com` |
| `*.com` | `https://google.com`, `https://github.com`, `https://anything.com` | `https://example.org`, `https://site.net` |
| `google.co.uk` | `https://google.co.uk`, `https://www.google.co.uk`, `https://maps.google.co.uk` | `https://google.com`, `https://google.ca` |
| `github.com/myorg/*` | `https://github.com/myorg/repo1`, `https://github.com/myorg/repo2/issues` | `https://github.com/other/repo` |
| `*://*/settings` | `https://any.site/settings`, `http://foo.com/settings` | `https://foo.com/settings/advanced` |
| `192.168.1.*` | `http://192.168.1.1:8080/page`, `http://192.168.1.100` | `http://192.168.2.1` |
| `localhost:3000` | `http://localhost:3000/app` | `http://localhost:8080` |

- **Protocol Agnostic**: Protocols (`http://` and `https://`) are handled automatically unless explicitly specified.
- **WWW & Subdomain Normalization**: `domain.com` automatically matches `www.domain.com` and its subdomains.
- **Security Boundaries**: Exact domain boundaries are enforced to prevent lookalike domains (e.g. `google.com.attacker.com` will never match `google.com`).
- **First Match Wins**: Rules are evaluated according to each rule's numeric Priority (1 = highest precedence). Tab strip positions can be arranged independently via drag-and-drop reordering.

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Alt+Shift+P` (Windows/Linux)<br>`Ctrl+Shift+P` (macOS) | Toggle "Pause auto-collapse" without opening the popup |

*Shortcuts can be customized anytime via `chrome://extensions/shortcuts` or `about:addons`.*

---

## Installation

### For End Users

**Chrome:**
- Install from [Chrome Web Store](https://chromewebstore.google.com/detail/auto-minimize-tab-groups/imjkoaaioakpbcgllmffjdolddjaohdi)

**Firefox:**
- Install from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/auto-minimize-tab-groups/)

### From Source (Development)

1. **Clone the repository**
   ```bash
   git clone https://github.com/yoneoarai/auto-minimize-tab-groups.git
   cd auto-minimize-tab-groups
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   # Build for both browsers
   npm run build
   
   # Or build for specific browser
   npm run build:chrome    # Chrome only (outputs to dist/chrome/)
   npm run build:firefox   # Firefox only (outputs to dist/firefox/)
   ```

4. **Load in browser**

   **Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the `dist/chrome/` folder

   **Firefox:**
   - Open `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select `dist/firefox/manifest.json`

5. **Package for distribution**
   ```bash
   npm run package  # Creates chrome-extension.zip and firefox-extension.zip
   ```

---

## Configuration & Usage

- **Toolbar Popup**: Click the Tabbi icon in your toolbar to:
  - Toggle Tabbi on/off
  - Toggle "Pause auto-collapse"
  - View live counters (active rules, active groups, collapse timeout)
  - Quick-jump to full settings
- **Options Page**: Right click the extension icon and select "Options", or open from the popup to manage rules, group colors, collapse timeouts, ordering, priority indicators, and schema-validated JSON import/export.

---

## Architecture

The project follows a clean decoupled Ports & Adapters architecture:
- `src/types/`: Domain models (`BrowserTab`, `BrowserTabGroup`, `GroupRule`, `ExtensionConfig`).
- `src/adapters/`: Browser runtime adapter (`BrowserAdapter`) with native Promise/callback fallback, action badge APIs, commands, and `MockBrowserAdapter` for testing.
- `src/core/`:
  - `ConfigManager`: v2 configuration schema, rules CRUD, schema validation, and transparent v1-to-v2 migration.
  - `RuleEngine`: URL pattern compiler, regex compilation with LRU cache, and first-match rule evaluator.
  - `TabOrganizer`: Tab grouping, group creation, ordering, and manual override tracking.
  - `GroupManager`: Tab group collapse timers, active tab protection, service worker restart recovery, and per-group collapse customization.
- `src/popup/` & `src/options/`: Vector SVG-branded, dark-mode-ready HTML/CSS/TypeScript interfaces.
- `src/background/`: Service worker / background event wiring, lifecycle management, badge updates, and command shortcuts.

---

## Development & Testing

Tabbi includes a comprehensive 146-test suite with over 85% line coverage and a cross-browser parity verification suite ensuring 100% markup, functional, and manifest parity between Chrome and Firefox:

```bash
# Run all unit and parity tests
npm test

# Run tests with coverage report
npm test -- --coverage

# Run TypeScript typecheck
npm run typecheck

# Watch mode for development
npm run watch:chrome
npm run watch:firefox
```

---

## License

ISC License. Contributions are welcome!
