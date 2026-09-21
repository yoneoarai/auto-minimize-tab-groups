import {
  IBrowserAdapter,
  BrowserTab,
  BrowserTabGroup,
  BrowserWindow,
  TabActiveInfo,
  TabChangeInfo,
  TabRemoveInfo,
  StorageChange,
  InstalledDetails,
} from '../types/browser';

export class MockBrowserAdapter implements IBrowserAdapter {
  public readonly WINDOW_ID_NONE = -1;

  public tabs: Map<number, BrowserTab> = new Map();
  public groups: Map<number, BrowserTabGroup> = new Map();
  public windows: Map<number, BrowserWindow> = new Map();
  public storage: Record<string, any> = {};
  public grantedPermissions: Set<string> = new Set();
  public badgeText = '';
  public badgeColor = '';
  public optionsPageOpened = false;
  public currentIcon: any = null;
  private nextGroupId = 100;

  private storageChangeListeners: Array<(changes: Record<string, StorageChange>) => void> = [];
  private tabActivatedListeners: Array<(activeInfo: TabActiveInfo) => void> = [];
  private tabCreatedListeners: Array<(tab: BrowserTab) => void> = [];
  private tabUpdatedListeners: Array<(tabId: number, changeInfo: TabChangeInfo, tab: BrowserTab) => void> = [];
  private tabRemovedListeners: Array<(tabId: number, removeInfo: TabRemoveInfo) => void> = [];
  private tabGroupUpdatedListeners: Array<(group: BrowserTabGroup) => void> = [];
  private windowFocusChangedListeners: Array<(windowId: number) => void> = [];
  private startupListeners: Array<() => void> = [];
  private installedListeners: Array<(details: InstalledDetails) => void> = [];
  private commandListeners: Array<(command: string) => void> = [];

  // ==========================================================================
  // Tabs API
  // ==========================================================================

  public async getTab(tabId: number): Promise<BrowserTab> {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    return { ...tab };
  }

  public async queryTabs(queryInfo: {
    windowId?: number;
    groupId?: number;
    active?: boolean;
    lastFocusedWindow?: boolean;
  }): Promise<BrowserTab[]> {
    let targetWindowId = queryInfo.windowId;
    if (queryInfo.lastFocusedWindow) {
      const focusedWindow = Array.from(this.windows.values()).find((w) => w.focused);
      if (focusedWindow) {
        targetWindowId = focusedWindow.id;
      }
    }

    return Array.from(this.tabs.values()).filter((tab) => {
      if (targetWindowId !== undefined && tab.windowId !== targetWindowId) return false;
      if (queryInfo.groupId !== undefined && tab.groupId !== queryInfo.groupId) return false;
      if (queryInfo.active !== undefined && tab.active !== queryInfo.active) return false;
      return true;
    });
  }

  public async groupTabs(options: {
    tabIds: number[];
    groupId?: number;
    createProperties?: { windowId?: number };
  }): Promise<number> {
    for (const tabId of options.tabIds) {
      const tab = this.tabs.get(tabId);
      if (tab?.pinned) {
        throw new Error('Tabs cannot be grouped while pinned.');
      }
    }

    let targetGroupId = options.groupId;
    if (targetGroupId === undefined) {
      targetGroupId = this.nextGroupId++;
      const newGroup: BrowserTabGroup = {
        id: targetGroupId,
        collapsed: false,
        windowId: options.createProperties?.windowId ?? 1,
        title: '',
        color: 'grey',
      };
      this.groups.set(targetGroupId, newGroup);
    }

    for (const tabId of options.tabIds) {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.groupId = targetGroupId;
        this.tabs.set(tabId, { ...tab });
      }
    }

    return targetGroupId;
  }

  public async ungroupTabs(tabIds: number[]): Promise<void> {
    for (const tabId of tabIds) {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.groupId = -1;
        this.tabs.set(tabId, { ...tab });
      }
    }
  }

  // ==========================================================================
  // Tab Groups API
  // ==========================================================================

  public async getTabGroup(groupId: number): Promise<BrowserTabGroup> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Tab group ${groupId} not found`);
    }
    return { ...group };
  }

  public async queryTabGroups(queryInfo: { windowId?: number }): Promise<BrowserTabGroup[]> {
    return Array.from(this.groups.values()).filter((group) => {
      if (queryInfo.windowId !== undefined && group.windowId !== queryInfo.windowId) return false;
      return true;
    });
  }

  public async updateTabGroup(
    groupId: number,
    updateProperties: { collapsed?: boolean; title?: string; color?: string }
  ): Promise<BrowserTabGroup> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Tab group ${groupId} not found`);
    }
    const updated = { ...group, ...updateProperties };
    this.groups.set(groupId, updated);
    return { ...updated };
  }

  public async moveTabGroup(groupId: number, moveProperties: { index: number }): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Tab group ${groupId} not found`);
    }
    // State is maintained in mock
  }

  // ==========================================================================
  // Permissions API
  // ==========================================================================

  public async requestPermission(permissions: string[]): Promise<boolean> {
    for (const perm of permissions) {
      this.grantedPermissions.add(perm);
    }
    return true;
  }

  public async hasPermission(permissions: string[]): Promise<boolean> {
    return permissions.every((p) => this.grantedPermissions.has(p));
  }

  // ==========================================================================
  // Windows API
  // ==========================================================================

  public async getAllWindows(_getInfo?: { populate?: boolean }): Promise<BrowserWindow[]> {
    return Array.from(this.windows.values());
  }

  // ==========================================================================
  // Storage API
  // ==========================================================================

  public async getStorage(keys: string[]): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    for (const key of keys) {
      if (key in this.storage) {
        result[key] = this.storage[key];
      }
    }
    return result;
  }

  public async setStorage(items: Record<string, any>): Promise<void> {
    const changes: Record<string, StorageChange> = {};
    for (const [key, value] of Object.entries(items)) {
      const oldValue = this.storage[key];
      this.storage[key] = value;
      changes[key] = { oldValue, newValue: value };
    }
    this.storageChangeListeners.forEach((l) => l(changes));
  }

  public onStorageChanged(callback: (changes: Record<string, StorageChange>) => void): void {
    this.storageChangeListeners.push(callback);
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================

  public onTabActivated(callback: (activeInfo: TabActiveInfo) => void): void {
    this.tabActivatedListeners.push(callback);
  }

  public onTabCreated(callback: (tab: BrowserTab) => void): void {
    this.tabCreatedListeners.push(callback);
  }

  public onTabUpdated(callback: (tabId: number, changeInfo: TabChangeInfo, tab: BrowserTab) => void): void {
    this.tabUpdatedListeners.push(callback);
  }

  public onTabRemoved(callback: (tabId: number, removeInfo: TabRemoveInfo) => void): void {
    this.tabRemovedListeners.push(callback);
  }

  public onTabGroupUpdated(callback: (group: BrowserTabGroup) => void): void {
    this.tabGroupUpdatedListeners.push(callback);
  }

  public onWindowFocusChanged(callback: (windowId: number) => void): void {
    this.windowFocusChangedListeners.push(callback);
  }

  public onStartup(callback: () => void): void {
    this.startupListeners.push(callback);
  }

  public onInstalled(callback: (details: InstalledDetails) => void): void {
    this.installedListeners.push(callback);
  }

  public async setIcon(details: { path: string | Record<number, string> }): Promise<void> {
    this.currentIcon = details.path;
  }

  public async setBadgeText(details: { text: string }): Promise<void> {
    this.badgeText = details.text;
  }

  public async setBadgeBackgroundColor(details: { color: string }): Promise<void> {
    this.badgeColor = details.color;
  }

  public onCommand(callback: (command: string) => void): void {
    this.commandListeners.push(callback);
  }

  public async openOptionsPage(): Promise<void> {
    this.optionsPageOpened = true;
  }

  // ==========================================================================
  // Test Helpers
  // ==========================================================================

  public triggerCommand(command: string): void {
    this.commandListeners.forEach((l) => l(command));
  }

  public triggerStorageChanged(changes: Record<string, StorageChange>): void {
    for (const [key, change] of Object.entries(changes)) {
      if (change.newValue !== undefined) {
        this.storage[key] = change.newValue;
      }
    }
    this.storageChangeListeners.forEach((l) => l(changes));
  }

  public triggerTabActivated(activeInfo: TabActiveInfo): void {
    this.tabActivatedListeners.forEach((l) => l(activeInfo));
  }

  public triggerTabCreated(tab: BrowserTab): void {
    if (tab.id) this.tabs.set(tab.id, tab);
    this.tabCreatedListeners.forEach((l) => l(tab));
  }

  public triggerTabUpdated(tabId: number, changeInfo: TabChangeInfo, tab: BrowserTab): void {
    this.tabs.set(tabId, tab);
    this.tabUpdatedListeners.forEach((l) => l(tabId, changeInfo, tab));
  }

  public triggerTabRemoved(tabId: number, removeInfo: TabRemoveInfo): void {
    this.tabs.delete(tabId);
    this.tabRemovedListeners.forEach((l) => l(tabId, removeInfo));
  }

  public triggerTabGroupUpdated(group: BrowserTabGroup): void {
    this.groups.set(group.id, group);
    this.tabGroupUpdatedListeners.forEach((l) => l(group));
  }

  public triggerWindowFocusChanged(windowId: number): void {
    this.windowFocusChangedListeners.forEach((l) => l(windowId));
  }

  public triggerStartup(): void {
    this.startupListeners.forEach((l) => l());
  }

  public triggerInstalled(details: InstalledDetails): void {
    this.installedListeners.forEach((l) => l(details));
  }
}
