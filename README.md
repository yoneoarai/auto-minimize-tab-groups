# Auto Minimize Tab Groups

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)
![Firefox Extension](https://img.shields.io/badge/Firefox-Extension-orange)
![Cross Browser](https://img.shields.io/badge/Cross--Browser-Compatible-blue)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-4.x-blue)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-☕-yellow.svg)](https://coff.ee/yoneo)

A cross-browser extension that automatically minimizes (collapses) tab groups after a configurable period of inactivity to help keep your browser organized and reduce visual clutter.

**Now supports both Chrome and Firefox!**

## Features

- **Smart Auto-Minimization**: Automatically collapses inactive tab groups after a customizable timeout
- **Active Tab Protection**: Groups containing active tabs are never minimized
- **Multi-Window Support**: Works seamlessly across multiple browser windows
- **Configurable Timeout**: Set custom delay from 1 second to 1 hour via popup interface
- **Cross-Browser Compatible**: Works on both Chrome and Firefox with identical functionality

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
   npm ci
   ```

3. **Build the extension**
   ```bash
   # Build for both browsers (recommended)
   npm run build
   
   # Build for specific browser
   npm run build:chrome    # Chrome only
   npm run build:firefox   # Firefox only
   
   # Development builds with source maps
   npm run build:dev       # Both browsers
   npm run build:dev:chrome
   npm run build:dev:firefox
   ```

4. **Load in browser**

   **Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select `dist/chrome/`

   **Firefox:**
   - Open `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select `dist/firefox/manifest.json`

5. **Package for distribution**
   ```bash
   npm run package  # Creates both chrome-extension.zip and firefox-extension.zip
   
   # Or package individually
   npm run package:chrome
   npm run package:firefox
   ```

## Configuration

Access the extension settings instantly through:
- **Click the extension icon** in your Chrome toolbar
- Modern popup interface opens immediately - no separate tabs needed!

## Development

### Prerequisites

- Node.js 16+
- npm or yarn
- Chrome browser (for testing)

### Build Commands

```bash
# Install dependencies locally in ./node_modules
npm install

# Typecheck TypeScript
npm run typecheck

# Run unit test suite
npm test

# Production build for both Chrome and Firefox
npm run build

# Build for specific browser
npm run build:chrome
npm run build:firefox

# Development builds with source maps
npm run build:dev
npm run build:dev:chrome
npm run build:dev:firefox

# Watch mode
npm run watch:chrome
npm run watch:firefox

# Create distribution packages (.zip)
npm run package
npm run package:chrome
npm run package:firefox
```

### Project Structure

```
src/
├── adapters/          # Browser API implementations and mock adapters
│   ├── browser-adapter.ts
│   └── mock-adapter.ts
├── background/        # Background service worker entry point
│   └── index.ts
├── common/            # Shared timing and storage constants
│   └── constants.ts
├── core/              # Core business logic decoupled from browser APIs
│   ├── config-manager.ts
│   └── group-manager.ts
├── popup/             # Extension settings popup UI and controller
│   ├── popup.html
│   └── popup.ts
└── types/             # TypeScript domain and browser interfaces
    ├── browser.ts
    └── config.ts

tests/                 # Jest unit tests with mock browser environment
dist/                  # Build output (dist/chrome, dist/firefox)
scripts/               # Packaging and build automation scripts
manifest-chrome.json   # Chrome Manifest V3 configuration
manifest-firefox.json  # Firefox Manifest V3 configuration
package.json           # Node.js dependencies and scripts
tsconfig.json          # TypeScript configuration
webpack.config.js      # Webpack configuration
```


## ☕ Support This Project

If you find this extension helpful and want to support its development:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-☕-yellow.svg)](https://coff.ee/yoneo)

Your support helps keep this project maintained and enables new features! 🙏

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes with proper error handling and validation
4. Test thoroughly across different scenarios
5. Commit with clear messages: `git commit -m 'Add amazing feature'`
6. Push to your branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

ISC License - see LICENSE file for details

## 🔗 Links

- [GitHub Repository](https://github.com/yoneoarai/auto-minimize-tab-groups)
- [Chrome Web Store](https://chromewebstore.google.com/detail/auto-minimize-tab-groups/imjkoaaioakpbcgllmffjdolddjaohdi)
- [Issues & Bug Reports](https://github.com/yoneoarai/auto-minimize-tab-groups/issues)

---

**Made with ❤️ by [Yoneo Arai](mailto:yoneoarai@gmail.com)**
