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

function resolveApi(): any {
  if (typeof globalThis !== 'undefined') {
    if ((globalThis as any).browser?.runtime?.id) {
      return (globalThis as any).browser;
    }
    if ((globalThis as any).chrome?.runtime?.id) {
      return (globalThis as any).chrome;
    }
    if ((globalThis as any).browser) {
      return (globalThis as any).browser;
    }
    if ((globalThis as any).chrome) {
      return (globalThis as any).chrome;
    }
  }
  if (typeof window !== 'undefined') {
    if ((window as any).browser) return (window as any).browser;
    if ((window as any).chrome) return (window as any).chrome;
  }
  return null;
}

export class BrowserAdapter implements IBrowserAdapter {
  private api: any;
  public readonly WINDOW_ID_NONE: number;

  constructor(customApi?: any) {
    this.api = customApi ?? resolveApi();
    this.WINDOW_ID_NONE = this.api?.windows?.WINDOW_ID_NONE ?? -1;
  }

  private ensureApi(namespace: string): any {
    if (!this.api || !this.api[namespace]) {
      throw new Error(`Extension API "${namespace}" is not available in the current environment.`);
    }
    return this.api[namespace];
  }

  // ==========================================================================
  // Tabs API
  // ==========================================================================

  public async getTab(tabId: number): Promise<BrowserTab> {
    const tabsApi = this.ensureApi('tabs');
    const res = tabsApi.get(tabId);
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      tabsApi.get(tabId, (tab: BrowserTab) => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve(tab);
        }
      });
    });
  }

  public async queryTabs(queryInfo: { windowId?: number; groupId?: number; active?: boolean }): Promise<BrowserTab[]> {
    const tabsApi = this.ensureApi('tabs');
    const res = tabsApi.query(queryInfo);
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      tabsApi.query(queryInfo, (tabs: BrowserTab[]) => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve(tabs || []);
        }
      });
    });
  }

  public async groupTabs(options: {
    tabIds: number[];
    groupId?: number;
    createProperties?: { windowId?: number };
  }): Promise<number> {
    const tabsApi = this.ensureApi('tabs');
    const res = tabsApi.group(options);
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      tabsApi.group(options, (groupId: number) => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve(groupId);
        }
      });
    });
  }

  public async ungroupTabs(tabIds: number[]): Promise<void> {
    const tabsApi = this.ensureApi('tabs');
    const res = tabsApi.ungroup(tabIds);
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      tabsApi.ungroup(tabIds, () => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  // ==========================================================================
  // Tab Groups API
  // ==========================================================================

  public async getTabGroup(groupId: number): Promise<BrowserTabGroup> {
    const groupsApi = this.ensureApi('tabGroups');
    const res = groupsApi.get(groupId);
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      groupsApi.get(groupId, (group: BrowserTabGroup) => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve(group);
        }
      });
    });
  }

  public async queryTabGroups(queryInfo: { windowId?: number }): Promise<BrowserTabGroup[]> {
    const groupsApi = this.ensureApi('tabGroups');
    const res = groupsApi.query(queryInfo);
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      groupsApi.query(queryInfo, (groups: BrowserTabGroup[]) => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve(groups || []);
        }
      });
    });
  }

  public async updateTabGroup(
    groupId: number,
    updateProperties: { collapsed?: boolean; title?: string; color?: string }
  ): Promise<BrowserTabGroup> {
    const groupsApi = this.ensureApi('tabGroups');
    const res = groupsApi.update(groupId, updateProperties);
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      groupsApi.update(groupId, updateProperties, (group: BrowserTabGroup) => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve(group);
        }
      });
    });
  }

  public async moveTabGroup(groupId: number, moveProperties: { index: number }): Promise<void> {
    const groupsApi = this.ensureApi('tabGroups');
    const res = groupsApi.move(groupId, moveProperties);
    if (res && typeof res.then === 'function') {
      await res;
      return;
    }
    return new Promise((resolve, reject) => {
      groupsApi.move(groupId, moveProperties, () => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  // ==========================================================================
  // Permissions API
  // ==========================================================================

  public async requestPermission(permissions: string[]): Promise<boolean> {
    const permApi = this.ensureApi('permissions');
    const res = permApi.request({ permissions });
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      permApi.request({ permissions }, (granted: boolean) => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve(Boolean(granted));
        }
      });
    });
  }

  public async hasPermission(permissions: string[]): Promise<boolean> {
    const permApi = this.ensureApi('permissions');
    const res = permApi.contains({ permissions });
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      permApi.contains({ permissions }, (hasPerm: boolean) => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve(Boolean(hasPerm));
        }
      });
    });
  }

  // ==========================================================================
  // Windows API
  // ==========================================================================

  public async getAllWindows(getInfo?: { populate?: boolean }): Promise<BrowserWindow[]> {
    const windowsApi = this.ensureApi('windows');
    const res = windowsApi.getAll(getInfo ?? {});
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      windowsApi.getAll(getInfo ?? {}, (windows: BrowserWindow[]) => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve(windows || []);
        }
      });
    });
  }

  // ==========================================================================
  // Storage API
  // ==========================================================================

  public async getStorage(keys: string[]): Promise<Record<string, any>> {
    const storageApi = this.ensureApi('storage');
    const syncOrLocal = storageApi.sync ?? storageApi.local;
    const res = syncOrLocal.get(keys);
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      syncOrLocal.get(keys, (items: Record<string, any>) => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve(items || {});
        }
      });
    });
  }

  public async setStorage(items: Record<string, any>): Promise<void> {
    const storageApi = this.ensureApi('storage');
    const syncOrLocal = storageApi.sync ?? storageApi.local;
    const res = syncOrLocal.set(items);
    if (res && typeof res.then === 'function') {
      return await res;
    }
    return new Promise((resolve, reject) => {
      syncOrLocal.set(items, () => {
        if (this.api.runtime?.lastError) {
          reject(new Error(this.api.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  public onStorageChanged(callback: (changes: Record<string, StorageChange>) => void): void {
    const storageApi = this.ensureApi('storage');
    storageApi.onChanged.addListener(callback);
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================

  public onTabActivated(callback: (activeInfo: TabActiveInfo) => void): void {
    const tabsApi = this.ensureApi('tabs');
    tabsApi.onActivated.addListener(callback);
  }

  public onTabCreated(callback: (tab: BrowserTab) => void): void {
    const tabsApi = this.ensureApi('tabs');
    tabsApi.onCreated.addListener(callback);
  }

  public onTabUpdated(callback: (tabId: number, changeInfo: TabChangeInfo, tab: BrowserTab) => void): void {
    const tabsApi = this.ensureApi('tabs');
    tabsApi.onUpdated.addListener(callback);
  }

  public onTabRemoved(callback: (tabId: number, removeInfo: TabRemoveInfo) => void): void {
    const tabsApi = this.ensureApi('tabs');
    tabsApi.onRemoved.addListener(callback);
  }

  public onTabGroupUpdated(callback: (group: BrowserTabGroup) => void): void {
    const groupsApi = this.ensureApi('tabGroups');
    groupsApi.onUpdated.addListener(callback);
  }

  public onWindowFocusChanged(callback: (windowId: number) => void): void {
    const windowsApi = this.ensureApi('windows');
    windowsApi.onFocusChanged.addListener(callback);
  }

  public onStartup(callback: () => void): void {
    const runtimeApi = this.ensureApi('runtime');
    runtimeApi.onStartup.addListener(callback);
  }

  public onInstalled(callback: (details: InstalledDetails) => void): void {
    const runtimeApi = this.ensureApi('runtime');
    runtimeApi.onInstalled.addListener(callback);
  }

  // ==========================================================================
  // Action Badge & Commands
  // ==========================================================================

  public async setBadgeText(details: { text: string }): Promise<void> {
    const actionApi = this.api?.action ?? this.api?.browserAction;
    if (actionApi?.setBadgeText) {
      const res = actionApi.setBadgeText(details);
      if (res && typeof res.then === 'function') {
        return await res;
      }
    }
  }

  public async setBadgeBackgroundColor(details: { color: string }): Promise<void> {
    const actionApi = this.api?.action ?? this.api?.browserAction;
    if (actionApi?.setBadgeBackgroundColor) {
      const res = actionApi.setBadgeBackgroundColor(details);
      if (res && typeof res.then === 'function') {
        return await res;
      }
    }
  }

  public onCommand(callback: (command: string) => void): void {
    if (this.api?.commands?.onCommand?.addListener) {
      this.api.commands.onCommand.addListener(callback);
    }
  }

  public async openOptionsPage(): Promise<void> {
    if (this.api?.runtime?.openOptionsPage) {
      const res = this.api.runtime.openOptionsPage();
      if (res && typeof res.then === 'function') {
        return await res;
      }
    }
  }
}
