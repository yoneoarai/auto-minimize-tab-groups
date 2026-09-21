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
      expect(config.rules?.length).toBe(2);
      expect(config.rules?.find((r) => r.isFallback)?.name).toBe('Misc');
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

    it('inserts new rule at specified priority/order and shifts existing rules', async () => {
      const r1 = await configManager.addRule({
        name: 'First',
        color: 'blue',
        patterns: ['first.com'],
        collapse: { enabled: true, timeoutMs: null },
      });
      const r2 = await configManager.addRule({
        name: 'Second',
        color: 'green',
        patterns: ['second.com'],
        collapse: { enabled: true, timeoutMs: null },
      });

      // Insert at priority 1 (order 0)
      const rTop = await configManager.addRule({
        name: 'Top Priority',
        color: 'red',
        patterns: ['top.com'],
        collapse: { enabled: true, timeoutMs: null },
        order: 0,
      });

      const rules = configManager.getRules();
      expect(rules.length).toBe(3);
      expect(rules[0].id).toBe(rTop.id);
      expect(rules[0].order).toBe(0);
      expect(rules[1].id).toBe(r1.id);
      expect(rules[1].order).toBe(1);
      expect(rules[2].id).toBe(r2.id);
      expect(rules[2].order).toBe(2);
    });

    it('updates rule priority/order and maintains sequential indexing', async () => {
      const r1 = await configManager.addRule({
        name: 'A',
        color: 'blue',
        patterns: ['a.com'],
        collapse: { enabled: true, timeoutMs: null },
      });
      const r2 = await configManager.addRule({
        name: 'B',
        color: 'red',
        patterns: ['b.com'],
        collapse: { enabled: true, timeoutMs: null },
      });
      const r3 = await configManager.addRule({
        name: 'C',
        color: 'yellow',
        patterns: ['c.com'],
        collapse: { enabled: true, timeoutMs: null },
      });

      // Move C to priority 1 (order 0)
      await configManager.updateRule(r3.id, { order: 0 });

      const rules = configManager.getRules();
      expect(rules.map((r) => r.name)).toEqual(['C', 'A', 'B']);
      expect(rules.map((r) => r.order)).toEqual([0, 1, 2]);
    });

    it('moves a rule up and down with moveRule', async () => {
      const r1 = await configManager.addRule({
        name: 'First',
        color: 'blue',
        patterns: ['first.com'],
        collapse: { enabled: true, timeoutMs: null },
      });
      const r2 = await configManager.addRule({
        name: 'Second',
        color: 'green',
        patterns: ['second.com'],
        collapse: { enabled: true, timeoutMs: null },
      });
      const r3 = await configManager.addRule({
        name: 'Third',
        color: 'yellow',
        patterns: ['third.com'],
        collapse: { enabled: true, timeoutMs: null },
      });

      // Move Second up (swap with First)
      await configManager.moveRule(r2.id, 'up');
      let rules = configManager.getRules();
      expect(rules.map((r) => r.name)).toEqual(['Second', 'First', 'Third']);
      expect(rules.map((r) => r.order)).toEqual([0, 1, 2]);

      // Move Second up again (already at top -> noop)
      await configManager.moveRule(r2.id, 'up');
      rules = configManager.getRules();
      expect(rules.map((r) => r.name)).toEqual(['Second', 'First', 'Third']);

      // Move Second down twice
      await configManager.moveRule(r2.id, 'down');
      rules = configManager.getRules();
      expect(rules.map((r) => r.name)).toEqual(['First', 'Second', 'Third']);

      await configManager.moveRule(r2.id, 'down');
      rules = configManager.getRules();
      expect(rules.map((r) => r.name)).toEqual(['First', 'Third', 'Second']);

      // Move down when already at bottom -> noop
      await configManager.moveRule(r2.id, 'down');
      rules = configManager.getRules();
      expect(rules.map((r) => r.name)).toEqual(['First', 'Third', 'Second']);
    });

    it('preserves independent priority when reordering rules', async () => {
      const r1 = await configManager.addRule({
        name: 'Work',
        color: 'blue',
        patterns: ['work.com'],
        collapse: { enabled: true, timeoutMs: null },
        priority: 1,
      });
      const r2 = await configManager.addRule({
        name: 'Personal',
        color: 'green',
        patterns: ['personal.com'],
        collapse: { enabled: true, timeoutMs: null },
        priority: 5,
      });

      // Reorder in tab strip so Personal is first (order 0) and Work is second (order 1)
      await configManager.reorderRules([r2.id, r1.id]);

      const rules = configManager.getRules();
      const personal = rules.find((r) => r.id === r2.id)!;
      const work = rules.find((r) => r.id === r1.id)!;

      expect(personal.order).toBe(0);
      expect(personal.priority).toBe(5); // Priority remains 5

      expect(work.order).toBe(1);
      expect(work.priority).toBe(1); // Priority remains 1
    });

    it('allows updating priority independently from order', async () => {
      const r = await configManager.addRule({
        name: 'Docs',
        color: 'yellow',
        patterns: ['docs.google.com'],
        collapse: { enabled: true, timeoutMs: null },
        priority: 3,
        order: 0,
      });

      await configManager.updateRule(r.id, { priority: 1 });

      const updated = configManager.getRuleById(r.id)!;
      expect(updated.priority).toBe(1);
      expect(updated.order).toBe(0);
    });

    it('validates priority in validateRule', () => {
      const valid = ConfigManager.validateRule({
        name: 'Valid',
        color: 'blue',
        patterns: ['valid.com'],
        priority: 2,
      });
      expect(valid.isValid).toBe(true);

      const invalidZero = ConfigManager.validateRule({
        name: 'Invalid Zero',
        color: 'blue',
        patterns: ['valid.com'],
        priority: 0,
      });
      expect(invalidZero.isValid).toBe(false);

      const invalidFloat = ConfigManager.validateRule({
        name: 'Invalid Float',
        color: 'blue',
        patterns: ['valid.com'],
        priority: 1.5,
      });
      expect(invalidFloat.isValid).toBe(false);
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

    it('manages collapsePaused state', async () => {
      expect(configManager.isCollapsePaused()).toBe(false);

      await configManager.setCollapsePaused(true);
      expect(configManager.isCollapsePaused()).toBe(true);
      expect(configManager.getConfig().collapsePaused).toBe(true);

      await configManager.setCollapsePaused(false);
      expect(configManager.isCollapsePaused()).toBe(false);
      expect(configManager.getConfig().collapsePaused).toBe(false);
    });

    describe('Fallback Group Rule Management', () => {
      it('adds fallback rule to rules when unmatched behavior is set to general-group', async () => {
        expect(configManager.getRules().some((r) => r.isFallback)).toBe(false);

        await configManager.setUnmatchedBehavior('general-group');
        const rules = configManager.getRules();
        const fallback = rules.find((r) => r.isFallback);
        expect(fallback).toBeDefined();
        expect(fallback!.id).toBe('catch-all-fallback');
        expect(fallback!.name).toBe('General');
        expect(fallback!.evaluateLast).toBe(true);
      });

      it('prevents deleting the fallback rule', async () => {
        await configManager.setUnmatchedBehavior('general-group');
        await expect(configManager.deleteRule('catch-all-fallback')).rejects.toThrow(
          'Cannot delete the catch-all fallback group.'
        );
      });

      it('updates fallback rule and syncs changes with generalGroup config', async () => {
        await configManager.setUnmatchedBehavior('general-group');
        await configManager.updateRule('catch-all-fallback', {
          name: 'Miscellaneous',
          color: 'pink',
          collapse: { enabled: true, timeoutMs: 15000 },
          priority: 5,
          evaluateLast: false,
        });

        const updatedFallback = configManager.getRuleById('catch-all-fallback');
        expect(updatedFallback).toBeDefined();
        expect(updatedFallback!.name).toBe('Miscellaneous');
        expect(updatedFallback!.color).toBe('pink');
        expect(updatedFallback!.collapse.timeoutMs).toBe(15000);
        expect(updatedFallback!.priority).toBe(5);
        expect(updatedFallback!.evaluateLast).toBe(false);

        const generalGroup = configManager.getConfig().generalGroup;
        expect(generalGroup?.name).toBe('Miscellaneous');
        expect(generalGroup?.color).toBe('pink');
        expect(generalGroup?.collapse.timeoutMs).toBe(15000);
      });

      it('removes fallback rule when behavior is set to leave-ungrouped while preserving settings', async () => {
        await configManager.setUnmatchedBehavior('general-group');
        await configManager.updateRule('catch-all-fallback', {
          name: 'Inbox',
          color: 'yellow',
        });

        await configManager.setUnmatchedBehavior('leave-ungrouped');
        expect(configManager.getRules().some((r) => r.isFallback)).toBe(false);
        expect(configManager.getConfig().generalGroup?.name).toBe('Inbox');
        expect(configManager.getConfig().generalGroup?.color).toBe('yellow');

        // Re-enabling restores the custom settings
        await configManager.setUnmatchedBehavior('general-group');
        const restoredFallback = configManager.getRuleById('catch-all-fallback');
        expect(restoredFallback).toBeDefined();
        expect(restoredFallback!.name).toBe('Inbox');
        expect(restoredFallback!.color).toBe('yellow');
      });

      it('allows reordering rules including the fallback rule', async () => {
        const r1 = await configManager.addRule({
          name: 'Work',
          color: 'blue',
          patterns: ['github.com'],
          collapse: { enabled: true, timeoutMs: null },
        });

        await configManager.setUnmatchedBehavior('general-group');
        // Currently r1 is order 0, fallback is order 1
        let rules = configManager.getRules();
        expect(rules.map((r) => r.id)).toEqual([r1.id, 'catch-all-fallback']);

        // Reorder fallback to position 0 (first in tab strip)
        await configManager.reorderRules(['catch-all-fallback', r1.id]);
        rules = configManager.getRules();
        expect(rules[0].id).toBe('catch-all-fallback');
        expect(rules[0].order).toBe(0);
        expect(rules[1].id).toBe(r1.id);
        expect(rules[1].order).toBe(1);
      });
    });
  });

  describe('Version Update Persistence & Forward Compatibility', () => {
    it('preserves 100% of user settings across extension updates', async () => {
      // Simulate existing user configuration before an extension update
      const existingUserConfig = {
        version: CONFIG_VERSION,
        enabled: true,
        defaultTimeoutMs: 45000,
        rules: [
          {
            id: 'custom-work-rule',
            name: 'Work & Code',
            color: 'blue',
            patterns: ['github.com', 'jira.atlassian.com'],
            collapse: { enabled: true, timeoutMs: 15000 },
            order: 0,
            priority: 1,
          },
          {
            id: 'custom-media-rule',
            name: 'Media',
            color: 'red',
            patterns: ['youtube.com', 'netflix.com'],
            collapse: { enabled: false, timeoutMs: null },
            order: 1,
            priority: 2,
          },
        ],
        unmatchedTabBehavior: 'general-group',
        generalGroup: {
          name: 'Miscellaneous',
          color: 'purple',
          collapse: { enabled: true, timeoutMs: 20000 },
          order: 2,
          priority: 3,
          evaluateLast: true,
        },
        groupOrdering: 'alphabetical',
        reorganizeOnRuleChange: false,
        collapsePaused: false,
      };

      mockAdapter.storage[STORAGE_KEYS.CONFIG] = JSON.parse(JSON.stringify(existingUserConfig));
      mockAdapter.storage[STORAGE_KEYS.TIMEOUT] = 45000;

      // Simulate extension reload/update (new instance loading storage)
      const updatedConfigManager = new ConfigManager(mockAdapter);
      const loaded = await updatedConfigManager.loadConfig();

      expect(updatedConfigManager.isLoaded()).toBe(true);
      expect(loaded.defaultTimeoutMs).toBe(45000);
      expect(loaded.groupOrdering).toBe('alphabetical');
      expect(loaded.reorganizeOnRuleChange).toBe(false);

      // Verify all rules and catch-all group were preserved without data loss
      expect(loaded.rules?.length).toBe(3); // 2 standard + 1 catch-all fallback
      const workRule = loaded.rules?.find((r) => r.id === 'custom-work-rule');
      expect(workRule).toBeDefined();
      expect(workRule!.name).toBe('Work & Code');
      expect(workRule!.color).toBe('blue');
      expect(workRule!.patterns).toEqual(['github.com', 'jira.atlassian.com']);
      expect(workRule!.collapse.timeoutMs).toBe(15000);

      const mediaRule = loaded.rules?.find((r) => r.id === 'custom-media-rule');
      expect(mediaRule).toBeDefined();
      expect(mediaRule!.collapse.enabled).toBe(false);

      const fallback = loaded.rules?.find((r) => r.isFallback);
      expect(fallback).toBeDefined();
      expect(fallback!.name).toBe('Miscellaneous');
      expect(fallback!.color).toBe('purple');
      expect(fallback!.collapse.timeoutMs).toBe(20000);
    });

    it('preserves unknown future fields at root config level (forward compatibility)', async () => {
      const futureConfig = {
        version: 3,
        enabled: true,
        defaultTimeoutMs: 35000,
        rules: [
          {
            id: 'rule-future',
            name: 'Development',
            color: 'green',
            patterns: ['gitlab.com'],
            collapse: { enabled: true, timeoutMs: null },
            order: 0,
            priority: 1,
          },
        ],
        unmatchedTabBehavior: 'leave-ungrouped',
        generalGroup: {
          name: 'General',
          color: 'grey',
          collapse: { enabled: true, timeoutMs: null },
        },
        groupOrdering: 'manual',
        reorganizeOnRuleChange: true,
        collapsePaused: false,
        // Future hypothetical v3 fields:
        cloudSyncEnabled: true,
        autoArchiveIdleGroups: false,
        customWorkspaceTheme: 'dark-nord',
      };

      mockAdapter.storage[STORAGE_KEYS.CONFIG] = futureConfig;

      const loaded = await configManager.loadConfig();

      // Higher schema version is retained
      expect(loaded.version).toBe(3);
      // Future properties are preserved
      expect((loaded as any).cloudSyncEnabled).toBe(true);
      expect((loaded as any).autoArchiveIdleGroups).toBe(false);
      expect((loaded as any).customWorkspaceTheme).toBe('dark-nord');

      // Modifying a setting and saving also persists the future properties
      await configManager.setTimeoutSeconds(50);
      const savedConfig = mockAdapter.storage[STORAGE_KEYS.CONFIG];
      expect(savedConfig.version).toBe(3);
      expect(savedConfig.cloudSyncEnabled).toBe(true);
      expect(savedConfig.autoArchiveIdleGroups).toBe(false);
      expect(savedConfig.customWorkspaceTheme).toBe('dark-nord');
      expect(savedConfig.defaultTimeoutMs).toBe(50000);
    });

    it('preserves unknown future fields inside rules and collapse settings (forward compatibility)', async () => {
      const futureConfigWithRuleProps = {
        version: 2,
        enabled: true,
        defaultTimeoutMs: 30000,
        rules: [
          {
            id: 'rule-enhanced',
            name: 'Design',
            color: 'pink',
            patterns: ['figma.com'],
            collapse: {
              enabled: true,
              timeoutMs: null,
              autoCloseIdleTabsAfterMs: 600000, // Future collapse property
            },
            order: 0,
            priority: 1,
            customIcon: 'palette', // Future rule property
            pinnedPosition: 'always-first', // Future rule property
          },
        ],
        unmatchedTabBehavior: 'leave-ungrouped',
        generalGroup: {
          name: 'General',
          color: 'grey',
          collapse: { enabled: true, timeoutMs: null },
          customBadge: 'INBOX', // Future generalGroup property
        },
        groupOrdering: 'manual',
        reorganizeOnRuleChange: true,
        collapsePaused: false,
      };

      mockAdapter.storage[STORAGE_KEYS.CONFIG] = futureConfigWithRuleProps;

      const loaded = await configManager.loadConfig();
      const rule = loaded.rules?.find((r) => r.id === 'rule-enhanced');
      expect(rule).toBeDefined();
      expect((rule as any).customIcon).toBe('palette');
      expect((rule as any).pinnedPosition).toBe('always-first');
      expect((rule?.collapse as any).autoCloseIdleTabsAfterMs).toBe(600000);
      expect((loaded.generalGroup as any).customBadge).toBe('INBOX');

      // Re-saving retains these properties
      await configManager.setReorganizeOnRuleChange(false);
      const saved = mockAdapter.storage[STORAGE_KEYS.CONFIG];
      const savedRule = saved.rules?.find((r: any) => r.id === 'rule-enhanced');
      expect(savedRule.customIcon).toBe('palette');
      expect(savedRule.pinnedPosition).toBe('always-first');
      expect(savedRule.collapse.autoCloseIdleTabsAfterMs).toBe(600000);
      expect(saved.generalGroup.customBadge).toBe('INBOX');
    });

    it('does not wipe or corrupt storage when storage read throws a temporary error', async () => {
      mockAdapter.storage[STORAGE_KEYS.CONFIG] = {
        version: CONFIG_VERSION,
        enabled: true,
        defaultTimeoutMs: 55000,
        rules: [
          {
            id: 'precious-rule',
            name: 'Precious Rule',
            color: 'cyan',
            patterns: ['important.org'],
            collapse: { enabled: true, timeoutMs: null },
            order: 0,
            priority: 1,
          },
        ],
      };

      // Mock storage read failure (e.g. transient extension worker storage glitch)
      const errorAdapter = new MockBrowserAdapter();
      errorAdapter.storage = mockAdapter.storage;
      jest.spyOn(errorAdapter, 'getStorage').mockRejectedValueOnce(new Error('Storage temporarily locked'));

      const resilientConfigManager = new ConfigManager(errorAdapter);
      const loaded = await resilientConfigManager.loadConfig();

      // configManager returned fallback in memory
      expect(loaded.defaultTimeoutMs).toBe(DEFAULT_TIMEOUT_MS);
      expect(resilientConfigManager.isLoaded()).toBe(false);

      // Crucially, storage was NOT overwritten or wiped with defaults!
      expect(errorAdapter.storage[STORAGE_KEYS.CONFIG].defaultTimeoutMs).toBe(55000);
      expect(errorAdapter.storage[STORAGE_KEYS.CONFIG].rules[0].name).toBe('Precious Rule');
    });
  });
});
