import fs from 'fs';
import path from 'path';
import { BrowserAdapter } from '../src/adapters/browser-adapter';
import { BrowserTab, BrowserTabGroup } from '../src/types/browser';

describe('Cross-Browser Parity & UX Consistency', () => {
  const rootDir = path.resolve(__dirname, '..');
  const chromeManifestPath = path.join(rootDir, 'manifest-chrome.json');
  const firefoxManifestPath = path.join(rootDir, 'manifest-firefox.json');
  const optionsHtmlPath = path.join(rootDir, 'src/options/options.html');
  const popupHtmlPath = path.join(rootDir, 'src/popup/popup.html');

  // ==========================================================================
  // 1. Manifest Parity
  // ==========================================================================
  describe('Manifest Parity (Chrome vs Firefox)', () => {
    let chromeManifest: Record<string, any>;
    let firefoxManifest: Record<string, any>;

    beforeAll(() => {
      chromeManifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf8'));
      firefoxManifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf8'));
    });

    it('has identical core metadata (name, version, author, description)', () => {
      expect(chromeManifest.name).toBe(firefoxManifest.name);
      expect(chromeManifest.version).toBe(firefoxManifest.version);
      expect(chromeManifest.author).toBe(firefoxManifest.author);
      expect(chromeManifest.description).toBe(firefoxManifest.description);
      expect(chromeManifest.homepage_url).toBe(firefoxManifest.homepage_url);
    });

    it('has identical permissions across both browsers', () => {
      const sortedChromePerms = [...(chromeManifest.permissions || [])].sort();
      const sortedFirefoxPerms = [...(firefoxManifest.permissions || [])].sort();

      expect(sortedChromePerms).toEqual(sortedFirefoxPerms);
      expect(sortedChromePerms).toContain('tabGroups');
      expect(sortedChromePerms).toContain('storage');
      expect(sortedChromePerms).toContain('tabs');
    });

    it('has identical options UI configuration', () => {
      expect(chromeManifest.options_ui).toEqual(firefoxManifest.options_ui);
      expect(chromeManifest.options_ui.page).toBe('options.html');
      expect(chromeManifest.options_ui.open_in_tab).toBe(true);
    });

    it('has identical action popup configuration and icon definitions adhering to browser standards', () => {
      expect(chromeManifest.action.default_popup).toBe(firefoxManifest.action.default_popup);
      expect(chromeManifest.action.default_title).toBe(firefoxManifest.action.default_title);
      expect(chromeManifest.action.default_icon).toEqual(firefoxManifest.action.default_icon);
      expect(chromeManifest.icons).toEqual(firefoxManifest.icons);

      // Verify all required standard icon sizes (16, 32, 48, 128) exist on disk
      const standardSizes = ['16', '32', '48', '128'];
      for (const size of standardSizes) {
        expect(chromeManifest.icons[size]).toBeDefined();
        const iconPath = path.resolve(__dirname, '..', chromeManifest.icons[size]);
        expect(fs.existsSync(iconPath)).toBe(true);
      }

      for (const size of ['16', '32', '48']) {
        expect(chromeManifest.action.default_icon[size]).toBeDefined();
        const iconPath = path.resolve(__dirname, '..', chromeManifest.action.default_icon[size]);
        expect(fs.existsSync(iconPath)).toBe(true);
      }

      // Verify paused icons exist on disk
      for (const size of ['16', '32', '48', '96', '128']) {
        const pausedIconPath = path.resolve(__dirname, '..', `icons/icon-paused-${size}.png`);
        expect(fs.existsSync(pausedIconPath)).toBe(true);
      }
    });

    it('enforces required browser-specific platform declarations', () => {
      // Chrome uses service worker in MV3
      expect(chromeManifest.background.service_worker).toBe('background.js');

      // Firefox uses background scripts and requires gecko ID
      expect(firefoxManifest.background.scripts).toEqual(['background.js']);
      expect(firefoxManifest.browser_specific_settings?.gecko?.id).toBeDefined();
      expect(firefoxManifest.browser_specific_settings.gecko.id).toContain('@');
      expect(firefoxManifest.browser_specific_settings.gecko.strict_min_version).toBeDefined();
    });

    it('has identical explicit content security policy and keyboard commands', () => {
      expect(chromeManifest.content_security_policy).toEqual(firefoxManifest.content_security_policy);
      expect(chromeManifest.content_security_policy?.extension_pages).toBe("script-src 'self'; object-src 'self'");

      expect(chromeManifest.commands).toEqual(firefoxManifest.commands);
      expect(chromeManifest.commands?.['toggle-pause']).toBeDefined();
      expect(chromeManifest.commands['toggle-pause'].suggested_key?.default).toBe('Alt+Shift+P');
    });
  });

  // ==========================================================================
  // 2. Options and Popup UX Consistency
  // ==========================================================================
  describe('UI & UX Structure Parity', () => {
    let optionsHtml: string;
    let popupHtml: string;

    beforeAll(() => {
      optionsHtml = fs.readFileSync(optionsHtmlPath, 'utf8');
      popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');
    });

    it('options.html contains all critical controls and identifiers', () => {
      const requiredIds = [
        'global-enable-toggle',
        'default-timeout-input',
        'add-rule-btn',
        'rules-container',
        'ordering-manual',
        'ordering-alphabetical',
        'catch-all-toggle',
        'reorganize-on-change',
        'export-btn',
        'import-input',
        'reset-all-btn',
        'rule-dialog',
        'rule-form',
        'rule-name-input',
        'rule-color-picker',
        'rule-priority-input',
        'rule-order-input',
        'rule-eval-last-input',
        'pattern-input',
        'add-pattern-btn',
        'toggle-test-btn',
        'tester-row',
        'tester-input',
        'tester-result',
        'patterns-tags',
        'rule-custom-timeout',
        'save-rule-btn',
        'cancel-dialog-btn',
        'close-dialog-btn',
        'toast',
      ];

      for (const id of requiredIds) {
        expect(optionsHtml).toContain(`id="${id}"`);
      }
    });

    it('options.html includes priority and fallback badge indicators', () => {
      expect(optionsHtml).toContain('priority-badge');
      expect(optionsHtml).toContain('fallback-badge');
      expect(optionsHtml).toContain('Always evaluate last (Fallback)');
      expect(optionsHtml).toContain('Priority (1 = Highest)');
      expect(optionsHtml).toContain('info-tooltip-wrapper');
      expect(optionsHtml).toContain('When enabled, tabs that don\'t match any of your specific rules');
    });

    it('popup.html contains all critical interactive controls and stats counters', () => {
      const requiredPopupIds = [
        'popup-enable-toggle',
        'popup-pause-collapse-toggle',
        'stat-rules-count',
        'stat-groups-count',
        'stat-timeout',
        'open-settings-btn',
      ];

      for (const id of requiredPopupIds) {
        expect(popupHtml).toContain(`id="${id}"`);
      }
    });

    it('options.html and popup.html render the official extension icon in their headers', () => {
      expect(optionsHtml).toContain('class="brand-icon"');
      expect(optionsHtml).toContain('src="icon-large.svg"');
      expect(popupHtml).toContain('class="header-icon"');
      expect(popupHtml).toContain('src="icon-large.svg"');
    });

    it('options.html and popup.html both support native dark mode and version footers', () => {
      expect(optionsHtml).toContain('@media (prefers-color-scheme: dark)');
      expect(popupHtml).toContain('@media (prefers-color-scheme: dark)');
      expect(optionsHtml).toContain('Tabbi — Tab Group Manager v1.1.0');
      expect(popupHtml).toContain('Tabbi v1.1.0');
    });

    it('options.html defines accurate tab group color palette and accessible toast', () => {
      expect(optionsHtml).toContain('.color-pink { background-color: #d01884; }');
      expect(optionsHtml).toContain('<div id="toast" role="status" aria-live="polite"></div>');
    });
  });

  // ==========================================================================
  // 3. BrowserAdapter Functional Parity (Chrome vs Firefox Mocks)
  // ==========================================================================
  describe('BrowserAdapter Functional Parity (Chrome vs Firefox environments)', () => {
    let originalChrome: any;
    let originalBrowser: any;

    beforeEach(() => {
      originalChrome = (globalThis as any).chrome;
      originalBrowser = (globalThis as any).browser;
    });

    afterEach(() => {
      (globalThis as any).chrome = originalChrome;
      (globalThis as any).browser = originalBrowser;
    });

    /**
     * Creates a mock Chrome API environment (supports promises or callbacks + lastError)
     */
    function createChromeMock() {
      const storageData: Record<string, any> = {};
      const groups = new Map<number, BrowserTabGroup>();
      const tabs = new Map<number, BrowserTab>();

      tabs.set(1, { id: 1, windowId: 10, url: 'https://google.com', active: true, pinned: false });
      tabs.set(2, { id: 2, windowId: 10, url: 'https://github.com', active: false, pinned: false });
      groups.set(100, { id: 100, windowId: 10, title: 'Google', color: 'blue', collapsed: false });

      return {
        runtime: { lastError: null as any },
        tabs: {
          get: jest.fn((id: number) => {
            const tab = tabs.get(id);
            if (!tab) return Promise.reject(new Error(`No tab with id: ${id}`));
            return Promise.resolve(tab);
          }),
          query: jest.fn((queryInfo: any) => {
            const list = Array.from(tabs.values()).filter((t) => {
              if (queryInfo.windowId !== undefined && t.windowId !== queryInfo.windowId) return false;
              return true;
            });
            return Promise.resolve(list);
          }),
          group: jest.fn((options: any) => {
            const groupId = options.groupId || 101;
            for (const id of options.tabIds) {
              const tab = tabs.get(id);
              if (tab) tab.groupId = groupId;
            }
            return Promise.resolve(groupId);
          }),
          ungroup: jest.fn((tabIds: number[]) => {
            for (const id of tabIds) {
              const tab = tabs.get(id);
              if (tab) delete tab.groupId;
            }
            return Promise.resolve();
          }),
          onActivated: { addListener: jest.fn() },
          onCreated: { addListener: jest.fn() },
          onUpdated: { addListener: jest.fn() },
          onRemoved: { addListener: jest.fn() },
        },
        tabGroups: {
          get: jest.fn((id: number) => {
            const group = groups.get(id);
            if (!group) return Promise.reject(new Error(`Group ${id} not found`));
            return Promise.resolve(group);
          }),
          query: jest.fn((queryInfo: any) => {
            const list = Array.from(groups.values()).filter((g) => {
              if (queryInfo.windowId !== undefined && g.windowId !== queryInfo.windowId) return false;
              return true;
            });
            return Promise.resolve(list);
          }),
          update: jest.fn((id: number, updateProps: any) => {
            let group = groups.get(id);
            if (!group) {
              group = { id, windowId: 10, title: '', color: 'grey', collapsed: false };
              groups.set(id, group);
            }
            Object.assign(group, updateProps);
            return Promise.resolve(group);
          }),
          move: jest.fn((id: number, moveProps: any) => {
            const group = groups.get(id);
            return Promise.resolve(group);
          }),
          onUpdated: { addListener: jest.fn() },
        },
        windows: {
          getAll: jest.fn(() => Promise.resolve([{ id: 10, focused: true }])),
          onFocusChanged: { addListener: jest.fn() },
        },
        storage: {
          local: {
            get: jest.fn((keys: string[]) => {
              const result: Record<string, any> = {};
              for (const k of keys) {
                if (storageData[k] !== undefined) result[k] = storageData[k];
              }
              return Promise.resolve(result);
            }),
            set: jest.fn((items: Record<string, any>) => {
              Object.assign(storageData, items);
              return Promise.resolve();
            }),
          },
          onChanged: { addListener: jest.fn() },
        },
        permissions: {
          contains: jest.fn(() => Promise.resolve(true)),
          request: jest.fn(() => Promise.resolve(true)),
        },
      };
    }

    /**
     * Creates a mock Firefox browser API environment (pure native Promises, browser.* namespace)
     */
    function createFirefoxMock() {
      // In Firefox, APIs are identical in structure to Chrome MV3 promise APIs under browser.*
      return createChromeMock();
    }

    it('performs identical tab querying and grouping under both Chrome and Firefox', async () => {
      // 1. Test Chrome
      const chromeApi = createChromeMock();
      (globalThis as any).chrome = chromeApi;
      delete (globalThis as any).browser;

      const chromeAdapter = new BrowserAdapter();
      const chromeTab = await chromeAdapter.getTab(1);
      const chromeQuery = await chromeAdapter.queryTabs({ windowId: 10 });
      const chromeNewGroup = await chromeAdapter.groupTabs({ tabIds: [1, 2], groupId: 100 });
      const chromeGroup = await chromeAdapter.getTabGroup(100);

      // 2. Test Firefox
      const firefoxApi = createFirefoxMock();
      delete (globalThis as any).chrome;
      (globalThis as any).browser = firefoxApi;

      const firefoxAdapter = new BrowserAdapter();
      const firefoxTab = await firefoxAdapter.getTab(1);
      const firefoxQuery = await firefoxAdapter.queryTabs({ windowId: 10 });
      const firefoxNewGroup = await firefoxAdapter.groupTabs({ tabIds: [1, 2], groupId: 100 });
      const firefoxGroup = await firefoxAdapter.getTabGroup(100);

      // Verify identical outputs
      expect(chromeTab).toEqual(firefoxTab);
      expect(chromeQuery).toEqual(firefoxQuery);
      expect(chromeNewGroup).toBe(firefoxNewGroup);
      expect(chromeGroup).toEqual(firefoxGroup);
    });

    it('performs identical storage operations under both Chrome and Firefox', async () => {
      // Chrome
      (globalThis as any).chrome = createChromeMock();
      delete (globalThis as any).browser;
      const chromeAdapter = new BrowserAdapter();
      await chromeAdapter.setStorage({ theme: 'dark', timeout: 30 });
      const chromeStored = await chromeAdapter.getStorage(['theme', 'timeout']);

      // Firefox
      delete (globalThis as any).chrome;
      (globalThis as any).browser = createFirefoxMock();
      const firefoxAdapter = new BrowserAdapter();
      await firefoxAdapter.setStorage({ theme: 'dark', timeout: 30 });
      const firefoxStored = await firefoxAdapter.getStorage(['theme', 'timeout']);

      expect(chromeStored).toEqual(firefoxStored);
      expect(chromeStored).toEqual({ theme: 'dark', timeout: 30 });
    });

    it('handles permission checking and requests identically across browsers', async () => {
      // Chrome
      (globalThis as any).chrome = createChromeMock();
      delete (globalThis as any).browser;
      const chromeAdapter = new BrowserAdapter();
      const chromeHasPerm = await chromeAdapter.hasPermission(['tabs']);
      const chromeReqPerm = await chromeAdapter.requestPermission(['tabs']);

      // Firefox
      delete (globalThis as any).chrome;
      (globalThis as any).browser = createFirefoxMock();
      const firefoxAdapter = new BrowserAdapter();
      const firefoxHasPerm = await firefoxAdapter.hasPermission(['tabs']);
      const firefoxReqPerm = await firefoxAdapter.requestPermission(['tabs']);

      expect(chromeHasPerm).toBe(true);
      expect(firefoxHasPerm).toBe(true);
      expect(chromeReqPerm).toBe(true);
      expect(firefoxReqPerm).toBe(true);
    });

    it('propagates errors with identical behavior when API calls reject', async () => {
      // Chrome error
      (globalThis as any).chrome = createChromeMock();
      delete (globalThis as any).browser;
      const chromeAdapter = new BrowserAdapter();

      await expect(chromeAdapter.getTab(999)).rejects.toThrow('No tab with id: 999');

      // Firefox error
      delete (globalThis as any).chrome;
      (globalThis as any).browser = createFirefoxMock();
      const firefoxAdapter = new BrowserAdapter();

      await expect(firefoxAdapter.getTab(999)).rejects.toThrow('No tab with id: 999');
    });
  });
});
