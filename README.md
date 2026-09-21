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

- **Automated URL Grouping**: Define rules to automatically sort tabs into named, colored groups based on URL patterns.
- **Per-Group Collapse Settings**: Customize collapse timeout per group or completely disable auto-minimization for specific groups (e.g. keep GitHub always open, collapse social media after 5s).
- **Active Tab Protection**: Groups containing the currently active tab are never minimized.
- **Manual Move Respect**: If you manually drag a tab to a different group, Tabbi respects your override until the tab navigates to a new URL.
- **Unmatched Tabs Handling**: Choose to leave unmatched tabs as-is or gather them into a customizable "General" catch-all group.
- **Configurable Group Ordering**: Arrange tab groups in your tab strip manually (drag-and-drop order in settings) or alphabetically.
- **Full Settings UI & Pattern Tester**: Interactive options page with live pattern testing, rule reordering, and JSON import/export.
- **Quick-Access Popup**: Toggle Tabbi on/off, inspect active group stats, and jump to full settings.
- **Multi-Window Support**: Seamlessly manages tab groups across multiple browser windows.

---

## Pattern Matching Guide

Tabbi's pattern matching engine supports flexible wildcards:

| Pattern | Matches | Does Not Match |
| :--- | :--- | :--- |
| `google.com` | `https://google.com`, `https://www.google.com/search`, `http://google.com/maps` | `notgoogle.com` |
| `*.google.com` | `https://mail.google.com`, `https://docs.google.com/doc/123` | `https://google.com` (apex domain) |
| `github.com/myorg/*` | `https://github.com/myorg/repo1`, `https://github.com/myorg/repo2/issues` | `https://github.com/other/repo` |
| `*://*/settings` | `https://any.site/settings`, `http://foo.com/settings` | `https://foo.com/settings/advanced` |
| `192.168.1.*` | `http://192.168.1.1:8080/page`, `http://192.168.1.100` | `http://192.168.2.1` |

- **Protocol Agnostic**: Protocols (`http://` and `https://`) are handled automatically unless explicitly specified.
- **WWW Normalization**: `domain.com` automatically matches `www.domain.com`.
- **First Match Wins**: Rules are evaluated in the order configured in settings. Drag to reorder.

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

## Configuration

- **Toolbar Popup**: Click the Tabbi cat icon in your toolbar for a quick enable/disable toggle and live stats, or to click "Open Full Settings".
- **Options Page**: Right click the extension icon and select "Options", or open from the popup to manage rules, group colors, collapse timeouts, ordering, and JSON import/export.

---

## Architecture

The project follows a clean decoupled Ports & Adapters architecture:
- `src/types/`: Domain models (`BrowserTab`, `BrowserTabGroup`, `GroupRule`, `ExtensionConfig`).
- `src/adapters/`: Browser runtime adapter (`BrowserAdapter`) with native Promise/callback fallback, and `MockBrowserAdapter` for unit testing.
- `src/core/`:
  - `ConfigManager`: v2 configuration schema, rules CRUD, and transparent v1-to-v2 migration.
  - `RuleEngine`: URL pattern compiler and first-match rule evaluator.
  - `TabOrganizer`: Tab grouping, group creation, ordering, and manual override tracking.
  - `GroupManager`: Tab group collapse timers, active tab protection, and per-group collapse customization.
- `src/popup/` & `src/options/`: User interfaces.
- `src/background/`: Service worker / background event wiring.

---

## Development & Testing

```bash
# Run unit tests
npm test

# Run TypeScript typecheck
npm run typecheck

# Watch mode for development
npm run watch:chrome
npm run watch:firefox
```

---

## License

ISC License. Contributions are welcome!
