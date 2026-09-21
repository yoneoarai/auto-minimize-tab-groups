import { BrowserAdapter } from '../adapters/browser-adapter';
import { ConfigManager } from '../core/config-manager';
import { GroupManager } from '../core/group-manager';
import { TabOrganizer } from '../core/tab-organizer';
import { RuleEngine } from '../core/rule-engine';
import { STARTUP_DELAY_MS, INSTALL_DELAY_MS } from '../common/constants';

// Instantiate core layers
const browserAdapter = new BrowserAdapter();
const configManager = new ConfigManager(browserAdapter);
const groupManager = new GroupManager(browserAdapter, configManager);
const tabOrganizer = new TabOrganizer(browserAdapter, configManager, RuleEngine);

let initialized = false;

/**
 * Updates toolbar action icon and badge to reflect paused/disabled states.
 */
async function updateActionBadge(config = configManager.getConfig()): Promise<void> {
  try {
    if (!config.enabled) {
      await browserAdapter.setIcon?.({
        path: {
          16: 'icons/icon-16.png',
          32: 'icons/icon-32.png',
          48: 'icons/icon-48.png',
          128: 'icons/icon-128.png',
        },
      });
      await browserAdapter.setBadgeText?.({ text: 'OFF' });
      await browserAdapter.setBadgeBackgroundColor?.({ color: '#5f6368' });
    } else if (config.collapsePaused) {
      // Swap to red paused icon and clear text badge
      await browserAdapter.setIcon?.({
        path: {
          16: 'icons/icon-paused-16.png',
          32: 'icons/icon-paused-32.png',
          48: 'icons/icon-paused-48.png',
          128: 'icons/icon-paused-128.png',
        },
      });
      await browserAdapter.setBadgeText?.({ text: '' });
    } else {
      // Restore standard icon and clear badge
      await browserAdapter.setIcon?.({
        path: {
          16: 'icons/icon-16.png',
          32: 'icons/icon-32.png',
          48: 'icons/icon-48.png',
          128: 'icons/icon-128.png',
        },
      });
      await browserAdapter.setBadgeText?.({ text: '' });
    }
  } catch {
    // Non-fatal if badge or icon cannot be updated
  }
}

/**
 * Initializes the extension state by loading settings, organizing tabs, and setting up initial timers.
 */
async function initialize(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const config = await configManager.loadConfig();
    await updateActionBadge(config);
    if (config.enabled) {
      await tabOrganizer.organizeAllTabs();
    }
    await groupManager.refreshGroupTimers();
  } catch (error) {
    console.error('Failed to initialize Tabbi:', error);
  }
}

// React to config updates
configManager.onConfigChanged((config) => {
  updateActionBadge(config).catch(() => {});
  if (config.enabled) {
    if (config.reorganizeOnRuleChange) {
      tabOrganizer.organizeAllTabs().catch((err) => {
        console.warn('Error organizing tabs on config change:', err);
      });
    }
    groupManager.refreshGroupTimers().catch((err) => {
      console.warn('Error refreshing timers on config change:', err);
    });
  }
});

// Handle keyboard commands
browserAdapter.onCommand?.(async (command) => {
  if (command === 'toggle-pause') {
    const isPaused = configManager.isCollapsePaused();
    await configManager.setCollapsePaused(!isPaused);
  }
});

// Attach event listeners
browserAdapter.onTabActivated(async (activeInfo) => {
  await groupManager.handleTabActivated(activeInfo);
});

browserAdapter.onTabCreated(async (tab) => {
  await tabOrganizer.handleTabCreated(tab);
  await groupManager.handleTabCreated(tab);
});

browserAdapter.onTabUpdated(async (tabId, changeInfo, tab) => {
  await tabOrganizer.handleTabUpdated(tabId, changeInfo, tab);
  await groupManager.handleTabUpdated(tabId, changeInfo, tab);
});

browserAdapter.onTabRemoved((tabId, removeInfo) => {
  tabOrganizer.handleTabRemoved(tabId);
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
  if (details.reason === 'install') {
    browserAdapter.openOptionsPage?.().catch(() => {});
  }
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
