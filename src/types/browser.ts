/**
 * Abstract types for browser extension APIs, decoupling business logic from chrome/browser globals.
 */

export interface BrowserTab {
  id?: number;
  groupId?: number;
  windowId?: number;
  active: boolean;
  openerTabId?: number;
}

export interface BrowserTabGroup {
  id: number;
  collapsed: boolean;
  windowId?: number;
  title?: string;
  color?: string;
}

export interface BrowserWindow {
  id?: number;
  focused?: boolean;
}

export interface TabActiveInfo {
  tabId: number;
  windowId: number;
}

export interface TabChangeInfo {
  groupId?: number;
  status?: string;
}

export interface TabRemoveInfo {
  windowId: number;
  isWindowClosing: boolean;
}

export interface StorageChange<T = any> {
  oldValue?: T;
  newValue?: T;
}

export interface InstalledDetails {
  reason: 'install' | 'update' | 'chrome_update' | 'shared_module_update';
  previousVersion?: string;
}

export interface IBrowserAdapter {
  readonly WINDOW_ID_NONE: number;

  // Tabs
  getTab(tabId: number): Promise<BrowserTab>;
  queryTabs(queryInfo: { windowId?: number; groupId?: number; active?: boolean }): Promise<BrowserTab[]>;

  // Tab Groups
  getTabGroup(groupId: number): Promise<BrowserTabGroup>;
  queryTabGroups(queryInfo: { windowId?: number }): Promise<BrowserTabGroup[]>;
  updateTabGroup(groupId: number, updateProperties: { collapsed?: boolean; title?: string }): Promise<BrowserTabGroup>;

  // Windows
  getAllWindows(getInfo?: { populate?: boolean }): Promise<BrowserWindow[]>;

  // Storage
  getStorage(keys: string[]): Promise<Record<string, any>>;
  setStorage(items: Record<string, any>): Promise<void>;
  onStorageChanged(callback: (changes: Record<string, StorageChange>) => void): void;

  // Event Listeners
  onTabActivated(callback: (activeInfo: TabActiveInfo) => void): void;
  onTabCreated(callback: (tab: BrowserTab) => void): void;
  onTabUpdated(callback: (tabId: number, changeInfo: TabChangeInfo, tab: BrowserTab) => void): void;
  onTabRemoved(callback: (tabId: number, removeInfo: TabRemoveInfo) => void): void;
  onTabGroupUpdated(callback: (group: BrowserTabGroup) => void): void;
  onWindowFocusChanged(callback: (windowId: number) => void): void;
  onStartup(callback: () => void): void;
  onInstalled(callback: (details: InstalledDetails) => void): void;
}
