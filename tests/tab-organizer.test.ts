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

    await configManager.setGroupingDelayMs(0);
  });

  afterEach(() => {
    organizer.clearPendingTimers();
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

  describe('In-group tab positioning (tabInsertPosition)', () => {
    it('places new tabs at the end of the group when tabInsertPosition is end', async () => {
      await configManager.setTabInsertPosition('end');

      const tab1 = { id: 1, windowId: 1, index: 0, url: 'https://github.com/repo1', active: false };
      const tab2 = { id: 2, windowId: 1, index: 1, url: 'https://github.com/repo2', active: false };
      mockAdapter.tabs.set(1, tab1);
      mockAdapter.tabs.set(2, tab2);

      await organizer.organizeTab(tab1);
      await organizer.organizeTab(tab2);

      const t1 = await mockAdapter.getTab(1);
      const t2 = await mockAdapter.getTab(2);

      expect(t1.groupId).toBe(t2.groupId);
      expect(t1.index).toBe(0);
      expect(t2.index).toBe(1);
    });

    it('places new tabs at the front of the group when tabInsertPosition is front', async () => {
      await configManager.setTabInsertPosition('front');

      const tab1 = { id: 1, windowId: 1, index: 0, url: 'https://github.com/repo1', active: false };
      mockAdapter.tabs.set(1, tab1);
      await organizer.organizeTab(tab1);

      const tab2 = { id: 2, windowId: 1, index: 1, url: 'https://github.com/repo2', active: false };
      mockAdapter.tabs.set(2, tab2);
      await organizer.organizeTab(tab2);

      let t1 = await mockAdapter.getTab(1);
      let t2 = await mockAdapter.getTab(2);

      expect(t1.groupId).toBe(t2.groupId);
      expect(t2.index).toBe(0);
      expect(t1.index).toBe(1);

      const tab3 = { id: 3, windowId: 1, index: 2, url: 'https://github.com/repo3', active: false };
      mockAdapter.tabs.set(3, tab3);
      await organizer.organizeTab(tab3);

      t1 = await mockAdapter.getTab(1);
      t2 = await mockAdapter.getTab(2);
      const t3 = await mockAdapter.getTab(3);

      expect(t3.index).toBe(0);
      expect(t2.index).toBe(1);
      expect(t1.index).toBe(2);
    });

    it('only positions tabs on initial group addition and preserves internal ordering if already in group', async () => {
      await configManager.setTabInsertPosition('front');

      const tab1 = { id: 1, windowId: 1, index: 0, url: 'https://github.com/repo1', active: false };
      const tab2 = { id: 2, windowId: 1, index: 1, url: 'https://github.com/repo2', active: false };
      mockAdapter.tabs.set(1, tab1);
      mockAdapter.tabs.set(2, tab2);

      await organizer.organizeTab(tab1);
      await organizer.organizeTab(tab2);

      expect((await mockAdapter.getTab(2)).index).toBe(0);
      expect((await mockAdapter.getTab(1)).index).toBe(1);

      // Re-running organizeTab on tab1 (which is already in the group) does not reposition it
      const updatedTab1 = await mockAdapter.getTab(1);
      await organizer.organizeTab(updatedTab1);

      expect((await mockAdapter.getTab(2)).index).toBe(0);
      expect((await mockAdapter.getTab(1)).index).toBe(1);
    });

    it('preserves manually rearranged tabs inside a group', async () => {
      await configManager.setTabInsertPosition('front');

      const tab1 = { id: 1, windowId: 1, index: 0, url: 'https://github.com/repo1', active: false };
      const tab2 = { id: 2, windowId: 1, index: 1, url: 'https://github.com/repo2', active: false };
      mockAdapter.tabs.set(1, tab1);
      mockAdapter.tabs.set(2, tab2);

      await organizer.organizeTab(tab1);
      await organizer.organizeTab(tab2);

      expect((await mockAdapter.getTab(2)).index).toBe(0);
      expect((await mockAdapter.getTab(1)).index).toBe(1);

      // User manually drags tab2 behind tab1
      await mockAdapter.moveTab(2, { index: 1 });
      expect((await mockAdapter.getTab(1)).index).toBe(0);
      expect((await mockAdapter.getTab(2)).index).toBe(1);

      // Running organizeAllTabs does not disrupt manual in-group ordering
      await organizer.organizeAllTabs(1);

      expect((await mockAdapter.getTab(1)).index).toBe(0);
      expect((await mockAdapter.getTab(2)).index).toBe(1);
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

    it('clears manual overrides when organizeAllTabs is invoked', async () => {
      organizer.handleTabUpdated(25, { groupId: 5 }, { id: 25, active: false });
      expect(organizer.getManualOverrides().has(25)).toBe(true);

      mockAdapter.tabs.set(25, { id: 25, windowId: 1, url: 'https://google.com', active: false });
      await organizer.organizeAllTabs(1);

      expect(organizer.getManualOverrides().has(25)).toBe(false);
      const tab = await mockAdapter.getTab(25);
      expect(tab.groupId).toBeDefined();
    });

    it('groups a new tab when navigating from chrome://newtab to matching URL', async () => {
      // 1. Tab created at chrome://newtab
      const initialTab = { id: 30, windowId: 1, url: 'chrome://newtab', active: true };
      mockAdapter.tabs.set(30, initialTab);
      await organizer.handleTabCreated(initialTab);
      expect((await mockAdapter.getTab(30)).groupId ?? -1).toBe(-1);

      // 2. User navigates to google.com (changeInfo contains url or tab contains url)
      const navigatedTab = { id: 30, windowId: 1, url: 'https://google.com', active: true };
      mockAdapter.tabs.set(30, navigatedTab);
      await organizer.handleTabUpdated(30, { url: 'https://google.com' }, navigatedTab);

      const result = await mockAdapter.getTab(30);
      expect(result.groupId).toBeDefined();
      expect(result.groupId).not.toBe(-1);
      const group = await mockAdapter.getTabGroup(result.groupId!);
      expect(group.title).toBe('Google');
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

  describe('Pinned tabs', () => {
    it('does not group pinned tabs during organizeTab', async () => {
      const tab = { id: 50, windowId: 1, url: 'https://github.com/myrepo', active: false, pinned: true };
      mockAdapter.tabs.set(50, tab);

      await organizer.organizeTab(tab);

      const tabResult = await mockAdapter.getTab(50);
      expect(tabResult.groupId ?? -1).toBe(-1);
    });

    it('skips pinned tabs during organizeAllTabs', async () => {
      mockAdapter.tabs.set(51, { id: 51, windowId: 1, url: 'https://github.com/myrepo', active: false, pinned: true });
      mockAdapter.tabs.set(52, { id: 52, windowId: 1, url: 'https://github.com/myrepo', active: false, pinned: false });

      await organizer.organizeAllTabs(1);

      const tab51 = await mockAdapter.getTab(51);
      const tab52 = await mockAdapter.getTab(52);

      expect(tab51.groupId ?? -1).toBe(-1);
      expect(tab52.groupId).toBeDefined();
      expect(tab52.groupId).not.toBe(-1);
    });

    it('ignores pinned tabs in handleTabCreated', async () => {
      const tab = { id: 53, windowId: 1, url: 'https://google.com', active: false, pinned: true };
      mockAdapter.tabs.set(53, tab);

      await organizer.handleTabCreated(tab);
      expect((await mockAdapter.getTab(53)).groupId ?? -1).toBe(-1);
    });

    it('organizes a tab when it gets unpinned', async () => {
      const tab = { id: 54, windowId: 1, url: 'https://google.com', active: false, pinned: true };
      mockAdapter.tabs.set(54, tab);

      // Tab was pinned: not grouped
      await organizer.handleTabUpdated(54, { pinned: true }, tab);
      expect((await mockAdapter.getTab(54)).groupId ?? -1).toBe(-1);

      // User unpins the tab
      const unpinnedTab = { ...tab, pinned: false };
      mockAdapter.tabs.set(54, unpinnedTab);
      await organizer.handleTabUpdated(54, { pinned: false }, unpinnedTab);

      const result = await mockAdapter.getTab(54);
      expect(result.groupId).toBeDefined();
      expect(result.groupId).not.toBe(-1);
      const group = await mockAdapter.getTabGroup(result.groupId!);
      expect(group.title).toBe('Google');
    });
  });

  describe('Group ordering on creation & organization', () => {
    it('positions newly created group according to rule order when rules ordering is enabled', async () => {
      // Configure rule ordering
      await configManager.setGroupOrdering('rules');

      // Rule 0 is GitHub (order 0), Rule 1 is Google (order 1)
      // First, create Google tab at index 0 (Google group created at index 0)
      const googleTab = { id: 101, windowId: 1, url: 'https://google.com', active: false, index: 0 };
      mockAdapter.tabs.set(101, googleTab);
      await organizer.organizeTab(googleTab);

      const googleGroup = await mockAdapter.getTabGroup((await mockAdapter.getTab(101)).groupId!);
      expect(googleGroup.title).toBe('Google');

      // Now create GitHub tab at index 5 (end of window)
      // GitHub rule has order 0, so GitHub group should be ordered BEFORE Google group!
      const githubTab = { id: 102, windowId: 1, url: 'https://github.com/repo', active: false, index: 5 };
      mockAdapter.tabs.set(102, githubTab);
      await organizer.organizeTab(githubTab);

      const githubGroup = await mockAdapter.getTabGroup((await mockAdapter.getTab(102)).groupId!);
      expect(githubGroup.title).toBe('GitHub');

      // Verify physical tab positions in the window:
      const tab101After = await mockAdapter.getTab(101);
      const tab102After = await mockAdapter.getTab(102);

      // GitHub tab (order 0) must now precede Google tab (order 1)!
      expect(tab102After.index).toBeLessThan(tab101After.index!);
      expect(tab102After.index).toBe(0);
      expect(tab101After.index).toBe(1);
    });

    it('does NOT reorder or shift tab groups when groupOrdering is set to manual', async () => {
      await configManager.setGroupOrdering('manual');

      // First create Google tab at index 0 (Google group at index 0)
      const googleTab = { id: 103, windowId: 1, url: 'https://google.com', active: false, index: 0 };
      mockAdapter.tabs.set(103, googleTab);
      await organizer.organizeTab(googleTab);

      // Create GitHub tab at index 5
      const githubTab = { id: 104, windowId: 1, url: 'https://github.com/repo', active: false, index: 5 };
      mockAdapter.tabs.set(104, githubTab);
      await organizer.organizeTab(githubTab);

      // In manual mode, Tabbi does NOT force group positions!
      const tab103After = await mockAdapter.getTab(103);
      const tab104After = await mockAdapter.getTab(104);

      expect(tab103After.index).toBe(0);
      expect(tab104After.index).toBe(5);
    });

    it('does NOT reorder or shift tab groups when groupOrdering is set to none', async () => {
      await configManager.setGroupOrdering('none');

      const googleTab = { id: 105, windowId: 1, url: 'https://google.com', active: false, index: 0 };
      mockAdapter.tabs.set(105, googleTab);
      await organizer.organizeTab(googleTab);

      const githubTab = { id: 106, windowId: 1, url: 'https://github.com/repo', active: false, index: 5 };
      mockAdapter.tabs.set(106, githubTab);
      await organizer.organizeTab(githubTab);

      const tab105After = await mockAdapter.getTab(105);
      const tab106After = await mockAdapter.getTab(106);

      expect(tab105After.index).toBe(0);
      expect(tab106After.index).toBe(5);
    });

    it('positions newly created groups alphabetically when alphabetical ordering is enabled', async () => {
      await configManager.setGroupOrdering('alphabetical');

      // First create Google tab at index 0
      const googleTab = { id: 201, windowId: 1, url: 'https://google.com', active: false, index: 0 };
      mockAdapter.tabs.set(201, googleTab);
      await organizer.organizeTab(googleTab);

      // Now create GitHub tab at index 3
      // 'GitHub' alphabetically precedes 'Google' (G-i vs G-o)
      const githubTab = { id: 202, windowId: 1, url: 'https://github.com/repo', active: false, index: 3 };
      mockAdapter.tabs.set(202, githubTab);
      await organizer.organizeTab(githubTab);

      const tab201After = await mockAdapter.getTab(201);
      const tab202After = await mockAdapter.getTab(202);

      expect(tab202After.index).toBeLessThan(tab201After.index!);
      expect(tab202After.index).toBe(0);
      expect(tab201After.index).toBe(1);
    });
  });

  describe('Auto-Group Tabs disabled (collapse groups only)', () => {
    it('does not group tabs when autoGroupTabs is false', async () => {
      await configManager.setAutoGroupEnabled(false);

      const tab = { id: 301, windowId: 1, url: 'https://github.com/repo', active: false };
      mockAdapter.tabs.set(301, tab);

      await organizer.organizeTab(tab);
      const result = await mockAdapter.getTab(301);
      expect(result.groupId ?? -1).toBe(-1);
    });

    it('does not group tabs in handleTabCreated when autoGroupTabs is false', async () => {
      await configManager.setAutoGroupEnabled(false);

      const tab = { id: 302, windowId: 1, url: 'https://github.com/repo', active: false };
      mockAdapter.tabs.set(302, tab);

      await organizer.handleTabCreated(tab);
      const result = await mockAdapter.getTab(302);
      expect(result.groupId ?? -1).toBe(-1);
    });

    it('does not group tabs in handleTabUpdated when autoGroupTabs is false', async () => {
      await configManager.setAutoGroupEnabled(false);

      const tab = { id: 303, windowId: 1, url: 'chrome://newtab', active: false };
      mockAdapter.tabs.set(303, tab);

      await organizer.handleTabUpdated(303, { url: 'https://github.com/repo' }, { ...tab, url: 'https://github.com/repo' });
      const result = await mockAdapter.getTab(303);
      expect(result.groupId ?? -1).toBe(-1);
    });

    it('does not group tabs in organizeAllTabs when autoGroupTabs is false', async () => {
      await configManager.setAutoGroupEnabled(false);

      mockAdapter.tabs.set(304, { id: 304, windowId: 1, url: 'https://github.com/repo', active: false });
      await organizer.organizeAllTabs(1);

      const result = await mockAdapter.getTab(304);
      expect(result.groupId ?? -1).toBe(-1);
    });
  });

  describe('Navigation Debounce & Grouping Delay', () => {
    it('debounces rapid URL changes (e.g. redirect chain) and only assigns final URL to group', async () => {
      await configManager.setGroupingDelayMs(200);

      // Tab initially created
      const tab = { id: 401, windowId: 1, url: 'https://github.com/app', active: true };
      mockAdapter.tabs.set(401, tab);

      // Rapid navigation: github -> intermediate okta SSO -> back to github with auth token
      await organizer.handleTabUpdated(401, { url: 'https://github.com/app' }, tab);
      expect(organizer.hasPendingDebounce(401)).toBe(true);

      // Immediate redirect to Okta (before 200ms debounce fires)
      const oktaTab = { ...tab, url: 'https://company.okta.com/oauth/login' };
      mockAdapter.tabs.set(401, oktaTab);
      await organizer.handleTabUpdated(401, { url: 'https://company.okta.com/oauth/login' }, oktaTab);

      // Immediate redirect back to GitHub
      const finalTab = { ...tab, url: 'https://github.com/app/dashboard' };
      mockAdapter.tabs.set(401, finalTab);
      await organizer.handleTabUpdated(401, { url: 'https://github.com/app/dashboard' }, finalTab);

      // Tab is still pending debounce, not grouped prematurely
      expect((await mockAdapter.getTab(401)).groupId ?? -1).toBe(-1);

      // Flush debounce
      await organizer.flushPendingDebounces();

      const finalResult = await mockAdapter.getTab(401);
      expect(finalResult.groupId).toBeDefined();
      expect(finalResult.groupId).not.toBe(-1);
      const group = await mockAdapter.getTabGroup(finalResult.groupId!);
      expect(group.title).toBe('GitHub');
    });

    it('cancels pending debounce if tab is closed before timer expires', async () => {
      await configManager.setGroupingDelayMs(500);

      const tab = { id: 402, windowId: 1, url: 'https://github.com/app', active: true };
      mockAdapter.tabs.set(402, tab);

      await organizer.handleTabUpdated(402, { url: 'https://github.com/app' }, tab);
      expect(organizer.hasPendingDebounce(402)).toBe(true);

      organizer.handleTabRemoved(402);
      expect(organizer.hasPendingDebounce(402)).toBe(false);
    });

    it('cancels pending debounce if tab is pinned before timer expires', async () => {
      await configManager.setGroupingDelayMs(500);

      const tab = { id: 403, windowId: 1, url: 'https://github.com/app', active: true };
      mockAdapter.tabs.set(403, tab);

      await organizer.handleTabUpdated(403, { url: 'https://github.com/app' }, tab);
      expect(organizer.hasPendingDebounce(403)).toBe(true);

      await organizer.handleTabUpdated(403, { pinned: true }, { ...tab, pinned: true });
      expect(organizer.hasPendingDebounce(403)).toBe(false);
    });
  });

  describe('Sticky Auth & SSO Redirect Protection', () => {
    it('keeps already-grouped tab in its group when redirected to SSO/auth endpoint', async () => {
      // 1. Group tab under GitHub
      const tab = { id: 501, windowId: 1, url: 'https://github.com/myrepo', active: true };
      mockAdapter.tabs.set(501, tab);
      await organizer.organizeTab(tab);

      const initialTab = await mockAdapter.getTab(501);
      const gitHubGroupId = initialTab.groupId;
      expect(gitHubGroupId).toBeDefined();
      expect(gitHubGroupId).not.toBe(-1);

      // Add rule for Okta
      await configManager.addRule({
        name: 'Okta',
        color: 'blue',
        patterns: ['okta.com'],
        collapse: { enabled: true, timeoutMs: null },
      });

      // 2. Tab in GitHub group redirects to Okta SSO
      const ssoTab = { ...initialTab, url: 'https://mycompany.okta.com/login/sso' };
      mockAdapter.tabs.set(501, ssoTab);

      // Call organizeTab on the SSO URL
      await organizer.organizeTab(ssoTab);

      // Tab should NOT be moved into Okta group! It stays in GitHub group!
      const tabAfterSso = await mockAdapter.getTab(501);
      expect(tabAfterSso.groupId).toBe(gitHubGroupId);
      const currentGroup = await mockAdapter.getTabGroup(tabAfterSso.groupId!);
      expect(currentGroup.title).toBe('GitHub');
    });

    it('groups standalone tab navigating to SSO endpoint if tab was not previously in a group', async () => {
      await configManager.addRule({
        name: 'Okta',
        color: 'blue',
        patterns: ['okta.com'],
        collapse: { enabled: true, timeoutMs: null },
      });

      // Standalone new tab directly opened to Okta (not grouped)
      const tab = { id: 502, windowId: 1, url: 'https://mycompany.okta.com/login', active: true, groupId: -1 };
      mockAdapter.tabs.set(502, tab);

      await organizer.organizeTab(tab);

      const result = await mockAdapter.getTab(502);
      expect(result.groupId).toBeDefined();
      expect(result.groupId).not.toBe(-1);
      const group = await mockAdapter.getTabGroup(result.groupId!);
      expect(group.title).toBe('Okta');
    });
  });
});
