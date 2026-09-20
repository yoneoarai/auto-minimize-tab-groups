import { ConfigManager } from '../src/core/config-manager';
import { MockBrowserAdapter } from '../src/adapters/mock-adapter';
import { DEFAULT_TIMEOUT_MS, STORAGE_KEYS, CONFIG_VERSION } from '../src/common/constants';
import { GroupRule } from '../src/types/rules';

describe('ConfigManager', () => {
  let mockAdapter: MockBrowserAdapter;
  let configManager: ConfigManager;

  beforeEach(() => {
    mockAdapter = new MockBrowserAdapter();
    configManager = new ConfigManager(mockAdapter);
  });

  describe('validateTimeoutSeconds', () => {
    it('rejects empty input', () => {
      const result = ConfigManager.validateTimeoutSeconds('   ');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/enter a timeout value/i);
    });

    it('rejects non-numeric input', () => {
      const result = ConfigManager.validateTimeoutSeconds('abc');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/valid number/i);
    });

    it('rejects values below minimum (< 1s)', () => {
      const result = ConfigManager.validateTimeoutSeconds('0');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/at least 1 second/i);

      const negativeResult = ConfigManager.validateTimeoutSeconds('-10');
      expect(negativeResult.isValid).toBe(false);
    });

    it('rejects values above maximum (> 3600s)', () => {
      const result = ConfigManager.validateTimeoutSeconds('3601');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/cannot exceed 3600/i);
    });

    it('accepts valid boundary and middle values', () => {
      expect(ConfigManager.validateTimeoutSeconds('1').isValid).toBe(true);
      expect(ConfigManager.validateTimeoutSeconds('30').isValid).toBe(true);
      expect(ConfigManager.validateTimeoutSeconds('3600').isValid).toBe(true);
    });
  });

  describe('validateRule', () => {
    it('accepts valid rule', () => {
      const result = ConfigManager.validateRule({
        name: 'Work',
        color: 'blue',
        patterns: ['github.com', '*.slack.com'],
        collapse: { enabled: true, timeoutMs: 15000 },
      });
      expect(result.isValid).toBe(true);
    });

    it('rejects rule with empty name', () => {
      const result = ConfigManager.validateRule({
        name: '   ',
        color: 'blue',
        patterns: ['github.com'],
      });
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/name cannot be empty/i);
    });

    it('rejects rule with invalid color', () => {
      const result = ConfigManager.validateRule({
        name: 'Work',
        color: 'rainbow' as any,
        patterns: ['github.com'],
      });
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/invalid group color/i);
    });

    it('rejects rule without patterns', () => {
      const result = ConfigManager.validateRule({
        name: 'Work',
        color: 'green',
        patterns: [],
      });
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/at least one url pattern/i);
    });

    it('rejects rule with out-of-range custom timeout', () => {
      const result = ConfigManager.validateRule({
        name: 'Work',
        color: 'green',
        patterns: ['github.com'],
        collapse: { enabled: true, timeoutMs: 500 }, // < 1s
      });
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/custom timeout must be between/i);
    });
  });

  describe('parseAndNormalizeTimeoutMs', () => {
    it('returns valid millisecond numbers directly', () => {
      expect(ConfigManager.parseAndNormalizeTimeoutMs(15000)).toBe(15000);
      expect(ConfigManager.parseAndNormalizeTimeoutMs('20000')).toBe(20000);
    });

    it('falls back to default on invalid or out-of-bounds input', () => {
      expect(ConfigManager.parseAndNormalizeTimeoutMs(null)).toBe(DEFAULT_TIMEOUT_MS);
      expect(ConfigManager.parseAndNormalizeTimeoutMs(undefined)).toBe(DEFAULT_TIMEOUT_MS);
      expect(ConfigManager.parseAndNormalizeTimeoutMs('invalid')).toBe(DEFAULT_TIMEOUT_MS);
      expect(ConfigManager.parseAndNormalizeTimeoutMs(500)).toBe(DEFAULT_TIMEOUT_MS); // Below 1000ms
      expect(ConfigManager.parseAndNormalizeTimeoutMs(5000000)).toBe(DEFAULT_TIMEOUT_MS); // Above 3600s
    });
  });

  describe('migrateV1ToV2', () => {
    it('preserves existing timeout value while creating v2 config', () => {
      const v2Config = ConfigManager.migrateV1ToV2(45000);
      expect(v2Config.version).toBe(CONFIG_VERSION);
      expect(v2Config.defaultTimeoutMs).toBe(45000);
      expect(v2Config.enabled).toBe(true);
      expect(v2Config.rules).toEqual([]);
      expect(v2Config.unmatchedTabBehavior).toBe('leave-ungrouped');
      expect(v2Config.generalGroup!.name).toBe('General');
      expect(v2Config.groupOrdering).toBe('manual');
    });
  });

  describe('loadConfig and storage interaction', () => {
    it('loads default config when storage is empty', async () => {
      const config = await configManager.loadConfig();
      expect(config.defaultTimeoutMs).toBe(DEFAULT_TIMEOUT_MS);
      expect(config.rules).toEqual([]);
      expect(configManager.getTimeoutMs()).toBe(DEFAULT_TIMEOUT_MS);
      expect(configManager.getTimeoutSeconds()).toBe(30);
    });

    it('migrates v1 storage (timeout only) to v2 config seamlessly', async () => {
      mockAdapter.storage[STORAGE_KEYS.TIMEOUT] = 45000;
      const config = await configManager.loadConfig();

      expect(config.version).toBe(CONFIG_VERSION);
      expect(config.defaultTimeoutMs).toBe(45000);
      expect(configManager.getTimeoutSeconds()).toBe(45);
      expect(mockAdapter.storage[STORAGE_KEYS.CONFIG]).toBeDefined();
    });

    it('loads stored v2 config directly', async () => {
      mockAdapter.storage[STORAGE_KEYS.CONFIG] = {
        version: CONFIG_VERSION,
        enabled: true,
        defaultTimeoutMs: 50000,
        rules: [
          {
            id: 'rule-1',
            name: 'Search',
            color: 'blue',
            patterns: ['google.com'],
            collapse: { enabled: true, timeoutMs: null },
            order: 0,
          },
        ],
        unmatchedTabBehavior: 'general-group',
        generalGroup: {
          name: 'Misc',
          color: 'purple',
          collapse: { enabled: false, timeoutMs: null },
        },
        groupOrdering: 'alphabetical',
        reorganizeOnRuleChange: false,
      };

      const config = await configManager.loadConfig();
      expect(config.defaultTimeoutMs).toBe(50000);
      expect(config.rules?.length).toBe(1);
      expect(config.generalGroup?.name).toBe('Misc');
      expect(config.groupOrdering).toBe('alphabetical');
    });

    it('saves valid timeout and updates storage', async () => {
      await configManager.setTimeoutSeconds(60);
      expect(configManager.getTimeoutMs()).toBe(60000);
      expect(configManager.getTimeoutSeconds()).toBe(60);
      expect(mockAdapter.storage[STORAGE_KEYS.TIMEOUT]).toBe(60000);
      expect(mockAdapter.storage[STORAGE_KEYS.CONFIG].defaultTimeoutMs).toBe(60000);
    });

    it('throws error when setting invalid timeout', async () => {
      await expect(configManager.setTimeoutSeconds(-5)).rejects.toThrow();
    });

    it('resets to default successfully', async () => {
      await configManager.setTimeoutSeconds(120);
      expect(configManager.getTimeoutMs()).toBe(120000);

      await configManager.resetToDefault();
      expect(configManager.getTimeoutMs()).toBe(DEFAULT_TIMEOUT_MS);
      expect(mockAdapter.storage[STORAGE_KEYS.TIMEOUT]).toBe(DEFAULT_TIMEOUT_MS);
    });

    it('notifies listeners when config changes via setTimeoutSeconds', async () => {
      const listener = jest.fn();
      configManager.onConfigChanged(listener);

      await configManager.setTimeoutSeconds(15);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ defaultTimeoutMs: 15000 })
      );
    });

    it('synchronizes and notifies listeners when external storage changes', () => {
      const listener = jest.fn();
      configManager.onConfigChanged(listener);

      mockAdapter.triggerStorageChanged({
        [STORAGE_KEYS.TIMEOUT]: {
          oldValue: 30000,
          newValue: 50000,
        },
      });

      expect(configManager.getTimeoutMs()).toBe(50000);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ defaultTimeoutMs: 50000 })
      );
    });
  });

  describe('Rules CRUD', () => {
    it('adds a valid rule and assigns order', async () => {
      const rule = await configManager.addRule({
        name: 'Work',
        color: 'red',
        patterns: ['github.com', 'jira.com'],
        collapse: { enabled: true, timeoutMs: null },
      });

      expect(rule.id).toBeDefined();
      expect(rule.order).toBe(0);
      expect(configManager.getRules().length).toBe(1);

      const secondRule = await configManager.addRule({
        name: 'Social',
        color: 'pink',
        patterns: ['x.com'],
        collapse: { enabled: false, timeoutMs: null },
      });

      expect(secondRule.order).toBe(1);
      expect(configManager.getRules().length).toBe(2);
    });

    it('rejects adding invalid rule', async () => {
      await expect(
        configManager.addRule({
          name: '',
          color: 'blue',
          patterns: ['test.com'],
        } as any)
      ).rejects.toThrow();
    });

    it('updates an existing rule', async () => {
      const rule = await configManager.addRule({
        name: 'Dev',
        color: 'cyan',
        patterns: ['dev.to'],
        collapse: { enabled: true, timeoutMs: null },
      });

      await configManager.updateRule(rule.id, {
        name: 'Developer News',
        color: 'green',
      });

      const updated = configManager.getRuleById(rule.id);
      expect(updated?.name).toBe('Developer News');
      expect(updated?.color).toBe('green');
    });

    it('throws error when updating nonexistent rule', async () => {
      await expect(
        configManager.updateRule('nonexistent-id', { name: 'Foo' })
      ).rejects.toThrow();
    });

    it('deletes a rule and re-indexes remaining rules', async () => {
      const rule1 = await configManager.addRule({
        name: 'Rule 1',
        color: 'blue',
        patterns: ['r1.com'],
        collapse: { enabled: true, timeoutMs: null },
      });
      const rule2 = await configManager.addRule({
        name: 'Rule 2',
        color: 'red',
        patterns: ['r2.com'],
        collapse: { enabled: true, timeoutMs: null },
      });

      await configManager.deleteRule(rule1.id);

      const rules = configManager.getRules();
      expect(rules.length).toBe(1);
      expect(rules[0].id).toBe(rule2.id);
      expect(rules[0].order).toBe(0); // Re-indexed from 1 to 0
    });

    it('throws error when deleting nonexistent rule', async () => {
      await expect(configManager.deleteRule('missing-id')).rejects.toThrow();
    });

    it('reorders rules by ID array', async () => {
      const r1 = await configManager.addRule({
        name: 'R1',
        color: 'blue',
        patterns: ['1.com'],
        collapse: { enabled: true, timeoutMs: null },
      });
      const r2 = await configManager.addRule({
        name: 'R2',
        color: 'red',
        patterns: ['2.com'],
        collapse: { enabled: true, timeoutMs: null },
      });

      await configManager.reorderRules([r2.id, r1.id]);

      const sorted = configManager.getRules();
      expect(sorted[0].id).toBe(r2.id);
      expect(sorted[1].id).toBe(r1.id);
    });
  });

  describe('Extension Settings', () => {
    it('toggles extension enabled state', async () => {
      expect(configManager.getConfig().enabled).toBe(true);
      await configManager.setEnabled(false);
      expect(configManager.getConfig().enabled).toBe(false);
    });

    it('updates unmatched tab behavior', async () => {
      await configManager.setUnmatchedBehavior('general-group');
      expect(configManager.getConfig().unmatchedTabBehavior).toBe('general-group');
    });

    it('updates general group settings', async () => {
      await configManager.setGeneralGroup({
        name: 'Other',
        color: 'orange',
        collapse: { enabled: false, timeoutMs: 10000 },
      });

      const gg = configManager.getConfig().generalGroup;
      expect(gg!.name).toBe('Other');
      expect(gg!.color).toBe('orange');
      expect(gg!.collapse.enabled).toBe(false);
      expect(gg!.collapse.timeoutMs).toBe(10000);
    });

    it('updates group ordering mode', async () => {
      await configManager.setGroupOrdering('alphabetical');
      expect(configManager.getConfig().groupOrdering).toBe('alphabetical');
    });

    it('updates reorganize on rule change', async () => {
      await configManager.setReorganizeOnRuleChange(false);
      expect(configManager.getConfig().reorganizeOnRuleChange).toBe(false);
    });

    it('imports config from JSON string', async () => {
      const json = JSON.stringify({
        enabled: false,
        defaultTimeoutMs: 40000,
        unmatchedTabBehavior: 'general-group',
      });

      await configManager.importConfig(json);
      const imported = configManager.getConfig();
      expect(imported.enabled).toBe(false);
      expect(imported.defaultTimeoutMs).toBe(40000);
      expect(imported.unmatchedTabBehavior).toBe('general-group');
    });
  });
});
