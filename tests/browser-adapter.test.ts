import { BrowserAdapter } from '../src/adapters/browser-adapter';

describe('BrowserAdapter unit tests and edge cases', () => {
  describe('ensureApi error throwing', () => {
    it('throws descriptive error when namespace is missing', () => {
      const adapter = new BrowserAdapter({});
      expect(() => adapter.getTab(1)).rejects.toThrow('Extension API "tabs" is not available');
    });

    it('throws descriptive error when tabGroups namespace is missing', () => {
      const adapter = new BrowserAdapter({ tabs: {} });
      expect(() => adapter.getTabGroup(1)).rejects.toThrow('Extension API "tabGroups" is not available');
    });

    it('throws descriptive error when storage namespace is missing', () => {
      const adapter = new BrowserAdapter({});
      expect(() => adapter.getStorage(['foo'])).rejects.toThrow('Extension API "storage" is not available');
    });
  });

  describe('Callback-only API fallback paths', () => {
    it('getTab falls back to callback when promise is not returned', async () => {
      const mockTab = { id: 10, windowId: 1, active: true };
      const customApi = {
        tabs: {
          get: (tabId: number, callback?: (tab: any) => void) => {
            if (callback) callback(mockTab);
            return undefined; // Not a thenable
          },
        },
      };

      const adapter = new BrowserAdapter(customApi);
      const tab = await adapter.getTab(10);
      expect(tab).toEqual(mockTab);
    });

    it('getTab rejects with runtime.lastError message in callback fallback', async () => {
      const customApi = {
        runtime: { lastError: { message: 'Tab does not exist' } },
        tabs: {
          get: (tabId: number, callback?: (tab: any) => void) => {
            if (callback) callback(null);
            return undefined;
          },
        },
      };

      const adapter = new BrowserAdapter(customApi);
      await expect(adapter.getTab(99)).rejects.toThrow('Tab does not exist');
    });

    it('queryTabs falls back to callback', async () => {
      const mockTabs = [{ id: 1 }, { id: 2 }];
      const customApi = {
        tabs: {
          query: (queryInfo: any, callback?: (tabs: any) => void) => {
            if (callback) callback(mockTabs);
            return undefined;
          },
        },
      };

      const adapter = new BrowserAdapter(customApi);
      const res = await adapter.queryTabs({ active: true });
      expect(res).toEqual(mockTabs);
    });

    it('groupTabs and ungroupTabs fall back to callbacks', async () => {
      const customApi = {
        tabs: {
          group: (options: any, callback?: (groupId: number) => void) => {
            if (callback) callback(77);
            return undefined;
          },
          ungroup: (tabIds: number[], callback?: () => void) => {
            if (callback) callback();
            return undefined;
          },
        },
      };

      const adapter = new BrowserAdapter(customApi);
      const groupId = await adapter.groupTabs!({ tabIds: [1, 2] });
      expect(groupId).toBe(77);

      await expect(adapter.ungroupTabs!([1, 2])).resolves.toBeUndefined();
    });

    it('getTabGroup, queryTabGroups, updateTabGroup, moveTabGroup fall back to callbacks', async () => {
      const mockGroup = { id: 50, collapsed: false, title: 'Dev' };
      const customApi = {
        tabGroups: {
          get: (groupId: number, callback?: (group: any) => void) => {
            if (callback) callback(mockGroup);
            return undefined;
          },
          query: (queryInfo: any, callback?: (groups: any) => void) => {
            if (callback) callback([mockGroup]);
            return undefined;
          },
          update: (groupId: number, updateProps: any, callback?: (group: any) => void) => {
            if (callback) callback({ ...mockGroup, ...updateProps });
            return undefined;
          },
          move: (groupId: number, moveProps: any, callback?: (group: any) => void) => {
            if (callback) callback(mockGroup);
            return undefined;
          },
        },
      };

      const adapter = new BrowserAdapter(customApi);
      expect(await adapter.getTabGroup(50)).toEqual(mockGroup);
      expect(await adapter.queryTabGroups({})).toEqual([mockGroup]);
      expect(await adapter.updateTabGroup(50, { collapsed: true })).toEqual({ ...mockGroup, collapsed: true });
      await expect(adapter.moveTabGroup!(50, { index: -1 })).resolves.toBeUndefined();
    });

    it('getStorage and setStorage fall back to callback and use sync if available', async () => {
      const store: Record<string, any> = { key1: 'value1' };
      const customApi = {
        storage: {
          sync: {
            get: (keys: string[], callback?: (res: any) => void) => {
              if (callback) callback({ key1: store.key1 });
              return undefined;
            },
            set: (items: any, callback?: () => void) => {
              Object.assign(store, items);
              if (callback) callback();
              return undefined;
            },
          },
        },
      };

      const adapter = new BrowserAdapter(customApi);
      const res = await adapter.getStorage(['key1']);
      expect(res).toEqual({ key1: 'value1' });

      await adapter.setStorage({ key2: 'value2' });
      expect(store.key2).toBe('value2');
    });

    it('permissions request and check fall back to callback', async () => {
      const customApi = {
        permissions: {
          request: (details: any, callback?: (granted: boolean) => void) => {
            if (callback) callback(true);
            return undefined;
          },
          contains: (details: any, callback?: (has: boolean) => void) => {
            if (callback) callback(true);
            return undefined;
          },
        },
      };

      const adapter = new BrowserAdapter(customApi);
      expect(await adapter.requestPermission!(['tabs'])).toBe(true);
      expect(await adapter.hasPermission!(['tabs'])).toBe(true);
    });

    it('getAllWindows falls back to callback', async () => {
      const mockWindows = [{ id: 1, focused: true }];
      const customApi = {
        windows: {
          getAll: (getInfo: any, callback?: (windows: any) => void) => {
            if (callback) callback(mockWindows);
            return undefined;
          },
        },
      };

      const adapter = new BrowserAdapter(customApi);
      const res = await adapter.getAllWindows();
      expect(res).toEqual(mockWindows);
    });
  });

  describe('Action badge, commands, and openOptionsPage', () => {
    it('setBadgeText and setBadgeBackgroundColor call action API', async () => {
      let setBadgeTextArgs: any;
      let setBadgeColorArgs: any;

      const customApi = {
        action: {
          setBadgeText: (details: any) => {
            setBadgeTextArgs = details;
            return Promise.resolve();
          },
          setBadgeBackgroundColor: (details: any) => {
            setBadgeColorArgs = details;
            return Promise.resolve();
          },
        },
      };

      const adapter = new BrowserAdapter(customApi);
      await adapter.setBadgeText!({ text: 'PAUSE' });
      expect(setBadgeTextArgs).toEqual({ text: 'PAUSE' });

      await adapter.setBadgeBackgroundColor!({ color: '#f9ab00' });
      expect(setBadgeColorArgs).toEqual({ color: '#f9ab00' });
    });

    it('onCommand registers listener on commands.onCommand', () => {
      let registeredListener: any;
      const customApi = {
        commands: {
          onCommand: {
            addListener: (cb: any) => {
              registeredListener = cb;
            },
          },
        },
      };

      const adapter = new BrowserAdapter(customApi);
      const listener = jest.fn();
      adapter.onCommand!(listener);

      expect(registeredListener).toBeDefined();
      registeredListener('toggle-pause');
      expect(listener).toHaveBeenCalledWith('toggle-pause');
    });

    it('openOptionsPage calls runtime.openOptionsPage', async () => {
      let called = false;
      const customApi = {
        runtime: {
          openOptionsPage: () => {
            called = true;
            return Promise.resolve();
          },
        },
      };

      const adapter = new BrowserAdapter(customApi);
      await adapter.openOptionsPage!();
      expect(called).toBe(true);
    });
  });
});
