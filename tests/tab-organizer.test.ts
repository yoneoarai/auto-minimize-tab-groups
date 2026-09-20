import { TabOrganizer } from '../src/core/tab-organizer';
import { ConfigManager } from '../src/core/config-manager';
import { MockBrowserAdapter } from '../src/adapters/mock-adapter';
import { RuleEngine } from '../src/core/rule-engine';

describe('TabOrganizer', () => {
  let mockAdapter: MockBrowserAdapter;
  let configManager: ConfigManager;
  let organizer: TabOrganizer;

  beforeEach(async () => {
    mockAdapter = new MockBrowserAdapter();
    configManager = new ConfigManager(mockAdapter);
    organizer = new TabOrganizer(mockAdapter, configManager, RuleEngine);

    mockAdapter.windows.set(1, { id: 1, focused: true });

    // Setup initial rules
    await configManager.addRule({
      name: 'GitHub',
      color: 'blue',
      patterns: ['github.com'],
      collapse: { enabled: true, timeoutMs: null },
    });

    await configManager.addRule({
      name: 'Google',
      color: 'red',
      patterns: ['google.com', '*.google.com'],
      collapse: { enabled: true, timeoutMs: 10000 },
    });
  });

  describe('Tab grouping', () => {
    it('creates a new group for matching tab and assigns it', async () => {
      const tab = {
        id: 1,
        windowId: 1,
        url: 'https://github.com/user/repo',
        active: true,
      };
      mockAdapter.tabs.set(1, tab);

      await organizer.organizeTab(tab);

      const updatedTab = await mockAdapter.getTab(1);
      expect(updatedTab.groupId).toBeDefined();
      expect(updatedTab.groupId).not.toBe(-1);

      const group = await mockAdapter.getTabGroup(updatedTab.groupId!);
      expect(group.title).toBe('GitHub');
      expect(group.color).toBe('blue');
    });

    it('reuses existing group in the same window for same rule', async () => {
      const tab1 = { id: 1, windowId: 1, url: 'https://github.com/repo1', active: false };
      const tab2 = { id: 2, windowId: 1, url: 'https://github.com/repo2', active: false };

      mockAdapter.tabs.set(1, tab1);
      mockAdapter.tabs.set(2, tab2);

      await organizer.organizeTab(tab1);
      await organizer.organizeTab(tab2);

      const t1 = await mockAdapter.getTab(1);
      const t2 = await mockAdapter.getTab(2);

      expect(t1.groupId).toBe(t2.groupId);

      const groups = await mockAdapter.queryTabGroups({ windowId: 1 });
      expect(groups.filter((g) => g.title === 'GitHub')).toHaveLength(1);
    });

    it('leaves unmatched tab ungrouped when unmatchedTabBehavior is leave-ungrouped', async () => {
      await configManager.setUnmatchedBehavior('leave-ungrouped');

      const tab = { id: 3, windowId: 1, url: 'https://example.com', active: false };
      mockAdapter.tabs.set(3, tab);

      await organizer.organizeTab(tab);

      const updated = await mockAdapter.getTab(3);
      expect(updated.groupId ?? -1).toBe(-1);
    });

    it('moves unmatched tab to General group when configured', async () => {
      await configManager.setUnmatchedBehavior('general-group');

      const tab = { id: 4, windowId: 1, url: 'https://example.com', active: false };
      mockAdapter.tabs.set(4, tab);

      await organizer.organizeTab(tab);

      const updated = await mockAdapter.getTab(4);
      expect(updated.groupId).toBeDefined();
      expect(updated.groupId).not.toBe(-1);

      const group = await mockAdapter.getTabGroup(updated.groupId!);
      expect(group.title).toBe('General');
      expect(group.color).toBe('grey');
    });

    it('ignores internal browser URLs', async () => {
      const chromeTab = { id: 5, windowId: 1, url: 'chrome://settings', active: false };
      const aboutTab = { id: 6, windowId: 1, url: 'about:blank', active: false };

      mockAdapter.tabs.set(5, chromeTab);
      mockAdapter.tabs.set(6, aboutTab);

      await organizer.organizeTab(chromeTab);
      await organizer.organizeTab(aboutTab);

      expect((await mockAdapter.getTab(5)).groupId ?? -1).toBe(-1);
      expect((await mockAdapter.getTab(6)).groupId ?? -1).toBe(-1);
    });
  });

  describe('Manual overrides', () => {
    it('respects manual user tab moves and stops re-assigning until navigation', async () => {
      const tab = { id: 10, windowId: 1, url: 'https://github.com/myrepo', active: false };
      mockAdapter.tabs.set(10, tab);

      await organizer.organizeTab(tab);
      const originalGroupId = (await mockAdapter.getTab(10)).groupId;

      // Simulate user manually ungrouping or moving the tab
      const ungroupedTab = { ...tab, groupId: -1 };
      mockAdapter.tabs.set(10, ungroupedTab);
      await organizer.handleTabUpdated(10, { groupId: -1 }, ungroupedTab);

      expect(organizer.getManualOverrides().has(10)).toBe(true);

      // Now call organizeTab again with same URL: should NOT re-group
      await organizer.organizeTab(ungroupedTab);
      expect((await mockAdapter.getTab(10)).groupId).toBe(-1);

      // User navigates to a new Google URL: override is cleared and new rule applied
      await organizer.handleTabUpdated(10, { url: 'https://google.com/search' }, tab);

      expect(organizer.getManualOverrides().has(10)).toBe(false);

      const reassignedTab = await mockAdapter.getTab(10);
      expect(reassignedTab.groupId).not.toBe(originalGroupId);
      const newGroup = await mockAdapter.getTabGroup(reassignedTab.groupId!);
      expect(newGroup.title).toBe('Google');
    });

    it('clears manual override when tab is removed', () => {
      organizer.handleTabUpdated(20, { groupId: 5 }, { id: 20, active: false });
      expect(organizer.getManualOverrides().has(20)).toBe(true);

      organizer.handleTabRemoved(20);
      expect(organizer.getManualOverrides().has(20)).toBe(false);
    });
  });

  describe('organizeAllTabs and groupOrdering', () => {
    it('organizes all tabs in a window and orders groups alphabetically', async () => {
      await configManager.setGroupOrdering('alphabetical');

      mockAdapter.tabs.set(31, { id: 31, windowId: 1, url: 'https://google.com', active: false });
      mockAdapter.tabs.set(32, { id: 32, windowId: 1, url: 'https://github.com', active: false });

      await organizer.organizeAllTabs(1);

      const tab1 = await mockAdapter.getTab(31);
      const tab2 = await mockAdapter.getTab(32);

      expect(tab1.groupId).toBeDefined();
      expect(tab2.groupId).toBeDefined();

      const groupGoogle = await mockAdapter.getTabGroup(tab1.groupId!);
      const groupGitHub = await mockAdapter.getTabGroup(tab2.groupId!);

      expect(groupGoogle.title).toBe('Google');
      expect(groupGitHub.title).toBe('GitHub');
    });

    it('does not group tabs when extension is disabled', async () => {
      await configManager.setEnabled(false);

      const tab = { id: 40, windowId: 1, url: 'https://github.com', active: false };
      mockAdapter.tabs.set(40, tab);

      await organizer.organizeTab(tab);
      expect((await mockAdapter.getTab(40)).groupId ?? -1).toBe(-1);
    });
  });
});
