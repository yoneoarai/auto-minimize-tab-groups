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
    try {
      const res = tabsApi.get(tabId);
      if (res && typeof res.then === 'function') {
        return await res;
      }
    } catch {
      // Fallback to callback if promise not returned
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
    try {
      const res = tabsApi.query(queryInfo);
      if (res && typeof res.then === 'function') {
        return await res;
      }
    } catch {
      // Fallback
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

  // ==========================================================================
  // Tab Groups API
  // ==========================================================================

  public async getTabGroup(groupId: number): Promise<BrowserTabGroup> {
    const groupsApi = this.ensureApi('tabGroups');
    try {
      const res = groupsApi.get(groupId);
      if (res && typeof res.then === 'function') {
        return await res;
      }
    } catch {
      // Fallback
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
    try {
      const res = groupsApi.query(queryInfo);
      if (res && typeof res.then === 'function') {
        return await res;
      }
    } catch {
      // Fallback
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
    updateProperties: { collapsed?: boolean; title?: string }
  ): Promise<BrowserTabGroup> {
    const groupsApi = this.ensureApi('tabGroups');
    try {
      const res = groupsApi.update(groupId, updateProperties);
      if (res && typeof res.then === 'function') {
        return await res;
      }
    } catch {
      // Fallback
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

  // ==========================================================================
  // Windows API
  // ==========================================================================

  public async getAllWindows(getInfo?: { populate?: boolean }): Promise<BrowserWindow[]> {
    const windowsApi = this.ensureApi('windows');
    try {
      const res = windowsApi.getAll(getInfo ?? {});
      if (res && typeof res.then === 'function') {
        return await res;
      }
    } catch {
      // Fallback
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
    try {
      const res = syncOrLocal.get(keys);
      if (res && typeof res.then === 'function') {
        return await res;
      }
    } catch {
      // Fallback
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
    try {
      const res = syncOrLocal.set(items);
      if (res && typeof res.then === 'function') {
        return await res;
      }
    } catch {
      // Fallback
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
    storageApi.onChanged.addListener((changes: Record<string, StorageChange>) => {
      callback(changes);
    });
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
}
