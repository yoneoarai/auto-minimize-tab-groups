import { BrowserAdapter } from '../adapters/browser-adapter';
import { ConfigManager } from '../core/config-manager';
import { GroupManager } from '../core/group-manager';
import { STARTUP_DELAY_MS, INSTALL_DELAY_MS } from '../common/constants';

// Instantiate core layers
const browserAdapter = new BrowserAdapter();
const configManager = new ConfigManager(browserAdapter);
const groupManager = new GroupManager(browserAdapter, configManager);

/**
 * Initializes the extension state by loading settings and setting up initial timers.
 */
async function initialize(): Promise<void> {
  try {
    await configManager.loadConfig();
    await groupManager.refreshGroupTimers();
  } catch (error) {
    console.error('Failed to initialize Auto Minimize Tab Groups:', error);
  }
}

// Attach event listeners to GroupManager
browserAdapter.onTabActivated(async (activeInfo) => {
  await groupManager.handleTabActivated(activeInfo);
});

browserAdapter.onTabCreated(async (tab) => {
  await groupManager.handleTabCreated(tab);
});

browserAdapter.onTabUpdated(async (tabId, changeInfo, tab) => {
  await groupManager.handleTabUpdated(tabId, changeInfo, tab);
});

browserAdapter.onTabRemoved((tabId, removeInfo) => {
  groupManager.handleTabRemoved(tabId, removeInfo);
});

browserAdapter.onTabGroupUpdated(async (group) => {
  await groupManager.handleTabGroupUpdated(group);
});

browserAdapter.onWindowFocusChanged((windowId) => {
  groupManager.handleWindowFocusChanged(windowId);
});

browserAdapter.onStartup(() => {
  setTimeout(async () => {
    await initialize();
  }, STARTUP_DELAY_MS);
});

browserAdapter.onInstalled((details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    setTimeout(async () => {
      await initialize();
    }, INSTALL_DELAY_MS);
  }
});

// Run initialization immediately on script evaluation
initialize().catch((error) => {
  console.error('Initial startup failure:', error);
});
