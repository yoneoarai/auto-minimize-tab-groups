/**
 * Cross-browser API wrapper to handle differences between Chrome and Firefox
 */

// Type definitions for cross-browser compatibility
declare global {
  interface Window {
    browser?: typeof chrome;
  }
}

// Detect the browser environment and use the appropriate API namespace
const browserAPI = (() => {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    return chrome;
  } else if (typeof window !== 'undefined' && (window as any).browser) {
    return (window as any).browser;
  } else if (typeof (global as any) !== 'undefined' && (global as any).browser) {
    return (global as any).browser;
  } else {
    throw new Error('No browser extension API available');
  }
})();

/**
 * Cross-browser wrapper for extension APIs
 */
export class BrowserAPI {
  // Storage API
  static get storage() {
    return browserAPI.storage;
  }

  // Tab Groups API
  static get tabGroups() {
    return browserAPI.tabGroups;
  }

  // Tabs API
  static get tabs() {
    return browserAPI.tabs;
  }

  // Windows API
  static get windows() {
    return browserAPI.windows;
  }

  // Runtime API
  static get runtime() {
    return browserAPI.runtime;
  }

  /**
   * Cross-browser error handling
   */
  static getLastError(): chrome.runtime.LastError | undefined {
    return browserAPI.runtime.lastError;
  }

  /**
   * Cross-browser promise/callback handling for storage
   */
  static storageGet(keys: string[]): Promise<{[key: string]: any}> {
    return new Promise((resolve, reject) => {
      browserAPI.storage.sync.get(keys, (result: {[key: string]: any}) => {
        if (this.getLastError()) {
          reject(this.getLastError());
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Cross-browser promise/callback handling for storage set
   */
  static storageSet(items: {[key: string]: any}): Promise<void> {
    return new Promise((resolve, reject) => {
      browserAPI.storage.sync.set(items, () => {
        if (this.getLastError()) {
          reject(this.getLastError());
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Cross-browser promise/callback handling for tab queries
   */
  static tabsQuery(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    return new Promise((resolve, reject) => {
      browserAPI.tabs.query(queryInfo, (tabs: chrome.tabs.Tab[]) => {
        if (this.getLastError()) {
          reject(this.getLastError());
        } else {
          resolve(tabs);
        }
      });
    });
  }

  /**
   * Cross-browser promise/callback handling for getting a single tab
   */
  static tabsGet(tabId: number): Promise<chrome.tabs.Tab> {
    return new Promise((resolve, reject) => {
      browserAPI.tabs.get(tabId, (tab: chrome.tabs.Tab) => {
        if (this.getLastError()) {
          reject(this.getLastError());
        } else {
          resolve(tab);
        }
      });
    });
  }

  /**
   * Cross-browser promise/callback handling for tab groups query
   */
  static tabGroupsQuery(queryInfo: chrome.tabGroups.QueryInfo): Promise<chrome.tabGroups.TabGroup[]> {
    return new Promise((resolve, reject) => {
      browserAPI.tabGroups.query(queryInfo, (groups: chrome.tabGroups.TabGroup[]) => {
        if (this.getLastError()) {
          reject(this.getLastError());
        } else {
          resolve(groups);
        }
      });
    });
  }

  /**
   * Cross-browser promise/callback handling for getting a single tab group
   */
  static tabGroupsGet(groupId: number): Promise<chrome.tabGroups.TabGroup> {
    return new Promise((resolve, reject) => {
      browserAPI.tabGroups.get(groupId, (group: chrome.tabGroups.TabGroup) => {
        if (this.getLastError()) {
          reject(this.getLastError());
        } else {
          resolve(group);
        }
      });
    });
  }

  /**
   * Cross-browser promise/callback handling for windows.getAll
   */
  static windowsGetAll(getInfo?: {populate?: boolean}): Promise<chrome.windows.Window[]> {
    return new Promise((resolve, reject) => {
      browserAPI.windows.getAll(getInfo || {}, (windows: chrome.windows.Window[]) => {
        if (this.getLastError()) {
          reject(this.getLastError());
        } else {
          resolve(windows);
        }
      });
    });
  }
}
