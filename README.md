# Auto Minimize Tab Groups

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)
![Firefox Extension](https://img.shields.io/badge/Firefox-Extension-orange)
![Cross Browser](https://img.shields.io/badge/Cross--Browser-Compatible-blue)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-4.x-blue)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-☕-yellow.svg)](https://coff.ee/yoneo)

A cross-browser extension that automatically minimizes (collapses) tab groups after a configurable period of inactivity to help keep your browser organized and reduce visual clutter.

**🎉 Now supports both Chrome and Firefox!**

## ✨ Features

- 🔄 **Smart Auto-Minimization**: Automatically collapses inactive tab groups after a customizable timeout
- 🎯 **Active Tab Protection**: Groups containing active tabs are never minimized
- 🖥️ **Multi-Window Support**: Works seamlessly across multiple browser windows
- ⚙️ **Configurable Timeout**: Set custom delay from 1 second to 1 hour via popup interface
- 🌐 **Cross-Browser Compatible**: Works on both Chrome and Firefox with identical functionality
- ✨ **Modern Architecture**: Built with TypeScript and cross-browser API abstractions

## 🚀 Installation

### For End Users

**Chrome:**
- Install from [Chrome Web Store](https://chromewebstore.google.com/detail/auto-minimize-tab-groups/imjkoaaioakpbcgllmffjdolddjaohdi)

**Firefox:**
- Install from Firefox Add-ons (coming soon!)

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

## ⚙️ Configuration

Access the extension settings instantly through:
- **Click the extension icon** in your Chrome toolbar
- Modern popup interface opens immediately - no separate tabs needed!

### Settings

- **Timeout Duration**: Set how long to wait (1-3600 seconds) before minimizing inactive tab groups
- **Status Display**: See current timeout and active tab group count
- **Quick Actions**: Save settings or reset to default with one click
- **Instant Apply**: Changes take effect immediately without browser restart


## 🏗️ Architecture

- **Background Service Worker**: Handles tab group monitoring and minimization logic
- **Popup Interface**: Modern, compact settings UI accessible via extension icon
- **Chrome APIs Used**:
  - `tabGroups`: For querying and updating tab group states
  - `tabs`: For monitoring tab activity and creation
  - `storage`: For persisting user preferences
  - `windows`: For multi-window support
  - `action`: For popup interface integration

## 🛠️ Development

### Prerequisites

- Node.js 16+
- npm or yarn
- Chrome browser (for testing)

### Build Commands

```bash
# Install dependencies
npm ci

# Development build (TypeScript compilation)
npm run build-local

# Production build (webpack with optimization)
npm run build

# Create distribution package
npm run package

# Run tests (when implemented)
npm test
```

### Project Structure

```
src/
├── background.ts    # Main service worker logic
├── popup.ts         # Popup interface functionality
└── popup.html       # Popup interface UI

dist/               # Build output
manifest.json       # Extension manifest
package.json        # Node.js dependencies
webpack.config.js   # Build configuration
tsconfig.json       # TypeScript configuration
```

## 📋 Recent Improvements (v0.1.0)

### 🐛 Critical Fixes
- **Fixed duplicate event listeners** that caused performance issues
- **Eliminated memory leaks** with proper state cleanup
- **Added comprehensive error handling** for all Chrome API calls

### 🚀 Performance Enhancements  
- **Multi-window support** - properly handles multiple Chrome windows
- **Optimized querying** - more efficient tab and group detection
- **Set-based state management** - improved performance for group tracking
- **Smart cleanup functions** - automatic removal of stale group references

### 🎨 User Experience Revolution
- **✨ NEW: Popup Interface** - Replaced separate options page with instant popup access
- **Modern UI Design** - Clean, Google-style interface with intuitive controls
- **Real-time Status** - See current timeout and active tab group count instantly
- **Input validation** - Real-time validation with helpful error messages
- **Quick Actions** - Save settings or reset to default with one click
- **Accessibility improvements** - Proper ARIA labels and keyboard support
- **Enhanced styling** - Modern, responsive design with visual feedback
- **Better error messaging** - Clear feedback for configuration issues

## 🔍 Troubleshooting

### Extension Not Working
1. Check that the extension is enabled in `chrome://extensions/`
2. Verify you have tab groups created (extension only works with grouped tabs)
3. Check the browser console for error messages

### Tab Groups Not Minimizing
1. Ensure the timeout period has elapsed
2. Verify the group doesn't contain active tabs
3. Check extension options for correct timeout value
4. Look for error messages in the extension console

### Options Page Issues
1. Try refreshing the options page
2. Check that timeout values are within valid range (1-3600 seconds)
3. Clear extension data and reconfigure if needed

## ☕ Support This Project

If you find this extension helpful and want to support its development:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-☕-yellow.svg)](https://coff.ee/yoneo)

Your support helps keep this project maintained and enables new features! 🙏

## 🤝 Contributing

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
