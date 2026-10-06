import { GroupManager } from '../src/core/group-manager';
import { ConfigManager } from '../src/core/config-manager';
import { MockBrowserAdapter } from '../src/adapters/mock-adapter';
import {
  NEW_TAB_GRACE_PERIOD_MS,
  JUST_OPENED_GRACE_PERIOD_MS,
  DEBOUNCE_DELAY_MS,
} from '../src/common/constants';

describe('GroupManager', () => {
  let mockAdapter: MockBrowserAdapter;
  let configManager: ConfigManager;
  let groupManager: GroupManager;

  beforeEach(() => {
    jest.useFakeTimers();
    mockAdapter = new MockBrowserAdapter();
    configManager = new ConfigManager(mockAdapter);
    groupManager = new GroupManager(mockAdapter, configManager);

    // Default window setup
    mockAdapter.windows.set(1, { id: 1, focused: true });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('minimizes an inactive tab group after timeout expires', async () => {
    const groupId = 101;
    mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
    mockAdapter.tabs.set(1, { id: 1, groupId, windowId: 1, active: false });

    // Set group timer (default 30,000ms)
    groupManager.setGroupTimer(groupId, 1);
    expect(groupManager.getGroupState(groupId)?.timer).not.toBeNull();

    // Fast-forward time and await async chain
    await jest.advanceTimersByTimeAsync(30000);

    const group = await mockAdapter.getTabGroup(groupId);
    expect(group.collapsed).toBe(true);
    expect(groupManager.getGroupState(groupId)).toBeUndefined();
  });

  it('protects active group from being minimized', async () => {
    const groupId = 102;
    mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
    mockAdapter.tabs.set(2, { id: 2, groupId, windowId: 1, active: true });

    // Tab activation event
    await groupManager.handleTabActivated({ tabId: 2, windowId: 1 });

    expect(groupManager.getActiveGroupId()).toBe(groupId);
    expect(groupManager.getGroupState(groupId)?.isActive).toBe(true);
    expect(groupManager.getGroupState(groupId)?.timer).toBeNull();

    // Fast-forward time
    jest.advanceTimersByTime(60000);
    await Promise.resolve();

    const group = await mockAdapter.getTabGroup(groupId);
    expect(group.collapsed).toBe(false);
  });

  it('reactivates timer on previously active group when switching to a new group', async () => {
    const groupA = 201;
    const groupB = 202;

    mockAdapter.groups.set(groupA, { id: groupA, collapsed: false, windowId: 1 });
    mockAdapter.groups.set(groupB, { id: groupB, collapsed: false, windowId: 1 });

    mockAdapter.tabs.set(10, { id: 10, groupId: groupA, windowId: 1, active: true });
    mockAdapter.tabs.set(20, { id: 20, groupId: groupB, windowId: 1, active: false });

    // Activate tab 10 in Group A
    await groupManager.handleTabActivated({ tabId: 10, windowId: 1 });
    expect(groupManager.getActiveGroupId()).toBe(groupA);

    // Switch active tab to tab 20 in Group B
    mockAdapter.tabs.set(10, { id: 10, groupId: groupA, windowId: 1, active: false });
    mockAdapter.tabs.set(20, { id: 20, groupId: groupB, windowId: 1, active: true });
    await groupManager.handleTabActivated({ tabId: 20, windowId: 1 });

    expect(groupManager.getActiveGroupId()).toBe(groupB);
    // Group A should now have a running inactivity timer
    expect(groupManager.getGroupState(groupA)?.isActive).toBe(false);
    expect(groupManager.getGroupState(groupA)?.timer).not.toBeNull();

    // Advance timers to trigger Group A minimization
    await jest.advanceTimersByTimeAsync(30000);

    expect((await mockAdapter.getTabGroup(groupA)).collapsed).toBe(true);
    expect((await mockAdapter.getTabGroup(groupB)).collapsed).toBe(false);
  });

  it('reactivates previous group timer when switching to an ungrouped tab', async () => {
    const groupId = 301;
    mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
    mockAdapter.tabs.set(1, { id: 1, groupId, windowId: 1, active: true });
    mockAdapter.tabs.set(2, { id: 2, groupId: -1, windowId: 1, active: false });

    await groupManager.handleTabActivated({ tabId: 1, windowId: 1 });
    expect(groupManager.getActiveGroupId()).toBe(groupId);

    // Switch to ungrouped tab 2
    mockAdapter.tabs.set(1, { id: 1, groupId, windowId: 1, active: false });
    mockAdapter.tabs.set(2, { id: 2, groupId: -1, windowId: 1, active: true });
    await groupManager.handleTabActivated({ tabId: 2, windowId: 1 });

    expect(groupManager.getActiveGroupId()).toBeNull();
    expect(groupManager.getGroupState(groupId)?.timer).not.toBeNull();
  });

  it('uncollapses a group when a tab is added to it for visibility', async () => {
    const groupId = 401;
    mockAdapter.groups.set(groupId, { id: groupId, collapsed: true, windowId: 1 });

    await groupManager.openGroupForVisibility(groupId, 1);

    const group = await mockAdapter.getTabGroup(groupId);
    expect(group.collapsed).toBe(false);
    expect(groupManager.getGroupState(groupId)?.justOpened).toBeDefined();
  });

  it('respects justOpened grace period before minimizing', async () => {
    const groupId = 501;
    mockAdapter.groups.set(groupId, { id: groupId, collapsed: true, windowId: 1 });
    mockAdapter.tabs.set(1, { id: 1, groupId, windowId: 1, active: false });

    // Open for visibility
    await groupManager.openGroupForVisibility(groupId, 1);

    // Set custom short timer (e.g. 2s) to fire before grace period (5s) ends
    groupManager.setGroupTimer(groupId, 1, 2000);

    // Advance 2s
    await jest.advanceTimersByTimeAsync(2000);

    // Group should still be open because of justOpened grace period
    let group = await mockAdapter.getTabGroup(groupId);
    expect(group.collapsed).toBe(false);

    // Now advance past grace period (5s) and timeout
    await jest.advanceTimersByTimeAsync(JUST_OPENED_GRACE_PERIOD_MS + 30000);

    group = await mockAdapter.getTabGroup(groupId);
    expect(group.collapsed).toBe(true);
  });

  it('cleans up deleted groups on full timer refresh', async () => {
    const group1 = 601;
    const group2 = 602;

    mockAdapter.groups.set(group1, { id: group1, collapsed: false, windowId: 1 });
    groupManager.setGroupTimer(group1, 1);
    groupManager.setGroupTimer(group2, 1); // Group 2 doesn't exist in mockAdapter

    expect(groupManager.getTrackedGroupIds()).toContain(group1);
    expect(groupManager.getTrackedGroupIds()).toContain(group2);

    await groupManager.cleanupTimers();

    expect(groupManager.getTrackedGroupIds()).toContain(group1);
    expect(groupManager.getTrackedGroupIds()).not.toContain(group2);
  });

  it('resets all timers when configuration changes', async () => {
    const groupId = 701;
    mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
    mockAdapter.tabs.set(1, { id: 1, groupId, windowId: 1, active: false });

    groupManager.setGroupTimer(groupId, 1);
    expect(groupManager.getGroupState(groupId)?.timer).not.toBeNull();

    // Change timeout in configManager
    await configManager.setTimeoutSeconds(10);

    // Timers are cleared and debounceRefreshTimers is invoked
    await jest.advanceTimersByTimeAsync(DEBOUNCE_DELAY_MS);

    // Timer re-armed with new 10s timeout
    expect(groupManager.getGroupState(groupId)?.timer).not.toBeNull();

    // Advance 10s
    await jest.advanceTimersByTimeAsync(10000);

    expect((await mockAdapter.getTabGroup(groupId)).collapsed).toBe(true);
  });

  describe('Per-Group Collapse and Custom Rules', () => {
    it('applies custom timeout from matching rule', async () => {
      await configManager.addRule({
        name: 'Social',
        color: 'pink',
        patterns: ['x.com'],
        collapse: { enabled: true, timeoutMs: 5000 },
      });

      const socialGroup = 801;
      const defaultGroup = 802;

      mockAdapter.groups.set(socialGroup, {
        id: socialGroup,
        title: 'Social',
        color: 'pink',
        collapsed: false,
        windowId: 1,
      });
      mockAdapter.groups.set(defaultGroup, {
        id: defaultGroup,
        title: 'Work',
        color: 'blue',
        collapsed: false,
        windowId: 1,
      });

      mockAdapter.tabs.set(81, { id: 81, groupId: socialGroup, windowId: 1, active: false });
      mockAdapter.tabs.set(82, { id: 82, groupId: defaultGroup, windowId: 1, active: false });

      // Refresh timers so metadata is learned
      await groupManager.refreshGroupTimers();

      // After 5s, Social group collapses, but Work group remains open
      await jest.advanceTimersByTimeAsync(5000);
      expect((await mockAdapter.getTabGroup(socialGroup)).collapsed).toBe(true);
      expect((await mockAdapter.getTabGroup(defaultGroup)).collapsed).toBe(false);

      // After remaining 25s, Work group collapses
      await jest.advanceTimersByTimeAsync(25000);
      expect((await mockAdapter.getTabGroup(defaultGroup)).collapsed).toBe(true);
    });

    it('never minimizes a group when collapse is disabled for its rule', async () => {
      await configManager.addRule({
        name: 'Persistent Group',
        color: 'purple',
        patterns: ['github.com'],
        collapse: { enabled: false, timeoutMs: null },
      });

      const persistentGroup = 803;
      mockAdapter.groups.set(persistentGroup, {
        id: persistentGroup,
        title: 'Persistent Group',
        color: 'purple',
        collapsed: false,
        windowId: 1,
      });
      mockAdapter.tabs.set(83, { id: 83, groupId: persistentGroup, windowId: 1, active: false });

      await groupManager.refreshGroupTimers();

      // Fast-forward 60 seconds
      await jest.advanceTimersByTimeAsync(60000);

      const group = await mockAdapter.getTabGroup(persistentGroup);
      expect(group.collapsed).toBe(false);
      expect(groupManager.getGroupState(persistentGroup)?.timer).toBeFalsy();
    });

    it('respects global enabled toggle', async () => {
      const groupId = 804;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
      mockAdapter.tabs.set(84, { id: 84, groupId, windowId: 1, active: false });

      await configManager.setEnabled(false);
      await groupManager.refreshGroupTimers();

      expect(groupManager.getTrackedGroupIds()).toHaveLength(0);

      await jest.advanceTimersByTimeAsync(60000);
      const group = await mockAdapter.getTabGroup(groupId);
      expect(group.collapsed).toBe(false);
    });

    it('respects General group collapse settings', async () => {
      await configManager.setGeneralGroup({
        name: 'General',
        color: 'grey',
        collapse: { enabled: false, timeoutMs: null },
      });

      const generalGroup = 805;
      mockAdapter.groups.set(generalGroup, {
        id: generalGroup,
        title: 'General',
        color: 'grey',
        collapsed: false,
        windowId: 1,
      });
      mockAdapter.tabs.set(85, { id: 85, groupId: generalGroup, windowId: 1, active: false });

      await groupManager.refreshGroupTimers();
      await jest.advanceTimersByTimeAsync(60000);

      const group = await mockAdapter.getTabGroup(generalGroup);
      expect(group.collapsed).toBe(false);
    });

    it('respects General group independent custom timeout', async () => {
      await configManager.setGeneralGroup({
        name: 'General',
        color: 'grey',
        collapse: { enabled: true, timeoutMs: 10000 },
      });

      const generalGroup = 807;
      mockAdapter.groups.set(generalGroup, {
        id: generalGroup,
        title: 'General',
        color: 'grey',
        collapsed: false,
        windowId: 1,
      });
      mockAdapter.tabs.set(87, { id: 87, groupId: generalGroup, windowId: 1, active: false });

      await groupManager.refreshGroupTimers();

      // At 5s (halfway of 10s custom timeout), should still be open
      await jest.advanceTimersByTimeAsync(5000);
      expect((await mockAdapter.getTabGroup(generalGroup)).collapsed).toBe(false);

      // At 10s total, should now be collapsed (even though default timeout is 30s)
      await jest.advanceTimersByTimeAsync(5000);
      expect((await mockAdapter.getTabGroup(generalGroup)).collapsed).toBe(true);
    });

    it('does not reset an already-running timer on an inactive group when refreshing timers', async () => {
      const groupId = 806;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
      mockAdapter.tabs.set(86, { id: 86, groupId, windowId: 1, active: false });

      await groupManager.refreshGroupTimers();
      const initialTimer = groupManager.getGroupState(groupId)?.timer;
      expect(initialTimer).not.toBeNull();

      // Advance halfway through timeout (15s out of 30s)
      await jest.advanceTimersByTimeAsync(15000);

      // Refresh timers again (e.g. triggered by tab creation or removal in another group)
      await groupManager.refreshGroupTimers();

      // Timer reference must be identical (not blown away and restarted)
      const currentTimer = groupManager.getGroupState(groupId)?.timer;
      expect(currentTimer).toBe(initialTimer);

      // Advance the remaining 15s (total 30s from original arming)
      await jest.advanceTimersByTimeAsync(15000);

      // Group should now be collapsed on schedule
      const group = await mockAdapter.getTabGroup(groupId);
      expect(group.collapsed).toBe(true);
    });

    it('stops maintaining timers and prevents all collapsing when collapsePaused is enabled', async () => {
      const groupId = 901;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
      mockAdapter.tabs.set(91, { id: 91, groupId, windowId: 1, active: false });

      // Enable pause
      await configManager.setCollapsePaused(true);

      // Attempting to set timer directly or via refreshGroupTimers should arm zero timers
      groupManager.setGroupTimer(groupId, 1);
      expect(groupManager.getGroupState(groupId)).toBeUndefined();

      await groupManager.refreshGroupTimers();
      expect(groupManager.getGroupState(groupId)).toBeUndefined();

      // Advancing time far past timeout does not collapse the group
      await jest.advanceTimersByTimeAsync(120000);
      const group = await mockAdapter.getTabGroup(groupId);
      expect(group.collapsed).toBe(false);
    });

    it('immediately cancels existing running timers when collapsePaused is turned on', async () => {
      const groupId = 902;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
      mockAdapter.tabs.set(92, { id: 92, groupId, windowId: 1, active: false });

      await groupManager.refreshGroupTimers();
      expect(groupManager.getGroupState(groupId)?.timer).not.toBeNull();

      // User clicks "Pause auto-collapse"
      await configManager.setCollapsePaused(true);

      // Existing timer must be cleared immediately
      expect(groupManager.getGroupState(groupId)).toBeUndefined();

      // Time advances — group remains open
      await jest.advanceTimersByTimeAsync(60000);
      expect((await mockAdapter.getTabGroup(groupId)).collapsed).toBe(false);

      // User unpauses
      await configManager.setCollapsePaused(false);
      await jest.advanceTimersByTimeAsync(DEBOUNCE_DELAY_MS);

      // Timer should be restored
      expect(groupManager.getGroupState(groupId)?.timer).not.toBeNull();

      // After timeout expires, group collapses
      await jest.advanceTimersByTimeAsync(30000);
      expect((await mockAdapter.getTabGroup(groupId)).collapsed).toBe(true);
    });
  });

  describe('GroupManager Event Handlers', () => {
    it('handleTabUpdated opens group for visibility and sets justOpened grace period when tab moves into group', async () => {
      const groupId = 201;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: true, windowId: 1, title: 'Dev' });
      mockAdapter.tabs.set(10, { id: 10, groupId: -1, windowId: 1, active: false });

      await groupManager.handleTabUpdated(10, { groupId }, { id: 10, groupId, windowId: 1, active: false });

      // Group was opened for visibility
      const group = await mockAdapter.getTabGroup(groupId);
      expect(group.collapsed).toBe(false);

      const state = groupManager.getGroupState(groupId);
      expect(state).toBeDefined();
      expect(state?.justOpened).toBeDefined();

      // Grace period expires and arms collapse timer
      await jest.advanceTimersByTimeAsync(NEW_TAB_GRACE_PERIOD_MS);
      expect(groupManager.getGroupState(groupId)?.timer).not.toBeNull();
    });

    it('handleTabGroupUpdated arms timer when user manually expands a group without active tabs', async () => {
      const groupId = 202;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: true, windowId: 1, title: 'Work' });
      mockAdapter.tabs.set(20, { id: 20, groupId, windowId: 1, active: false });

      // User expands group
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1, title: 'Work' });
      await groupManager.handleTabGroupUpdated({ id: groupId, collapsed: false, windowId: 1, title: 'Work' });

      const state = groupManager.getGroupState(groupId);
      expect(state).toBeDefined();
      expect(state?.timer).not.toBeNull();

      // Advancing time collapses it
      await jest.advanceTimersByTimeAsync(30000);
      expect((await mockAdapter.getTabGroup(groupId)).collapsed).toBe(true);
    });

    it('handleTabGroupUpdated clears timer when group is collapsed', async () => {
      const groupId = 203;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1, title: 'Reading' });
      mockAdapter.tabs.set(30, { id: 30, groupId, windowId: 1, active: false });

      groupManager.setGroupTimer(groupId, 1);
      expect(groupManager.getGroupState(groupId)?.timer).not.toBeNull();

      // User collapses group
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: true, windowId: 1, title: 'Reading' });
      await groupManager.handleTabGroupUpdated({ id: groupId, collapsed: true, windowId: 1, title: 'Reading' });

      expect(groupManager.getGroupState(groupId)).toBeUndefined();
    });

    it('handleWindowFocusChanged reactivates timers and queries active tabs', async () => {
      const groupId = 204;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1, title: 'Mail' });
      mockAdapter.tabs.set(40, { id: 40, groupId, windowId: 1, active: true });

      // Window 1 is focused, tab 40 is active
      await groupManager.handleTabActivated({ tabId: 40, windowId: 1 });
      expect(groupManager.getActiveGroupId()).toBe(groupId);

      // Focus switches to window 2
      mockAdapter.windows.set(1, { id: 1, focused: false });
      mockAdapter.windows.set(2, { id: 2, focused: true });
      mockAdapter.tabs.set(50, { id: 50, groupId: -1, windowId: 2, active: true });

      groupManager.handleWindowFocusChanged(2);
      await jest.advanceTimersByTimeAsync(DEBOUNCE_DELAY_MS);
      await Promise.resolve();

      // Window 1 group should now have a timer armed since focus left
      const state = groupManager.getGroupState(groupId);
      expect(state?.timer).not.toBeNull();
    });

    it('handleTabRemoved cleans up timers when group tabs are closed', async () => {
      const groupId = 205;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
      mockAdapter.tabs.set(60, { id: 60, groupId, windowId: 1, active: false });

      groupManager.setGroupTimer(groupId, 1);
      expect(groupManager.getGroupState(groupId)?.timer).not.toBeNull();

      // In the browser, closing the last tab in a group destroys the tab group
      mockAdapter.tabs.delete(60);
      mockAdapter.groups.delete(groupId);
      groupManager.handleTabRemoved(60, { windowId: 1, isWindowClosing: false });
      await jest.advanceTimersByTimeAsync(DEBOUNCE_DELAY_MS);
      await Promise.resolve();

      // Group has no tabs left, should be cleaned up
      expect(groupManager.getGroupState(groupId)).toBeUndefined();
    });
  });

  // ==========================================================================
  // MV3 Persistent Alarms & Long Timeout Support (e.g. 600s / 10min)
  // ==========================================================================
  describe('MV3 Persistent Alarms & Long Timeout Support', () => {
    it('schedules a persistent browser alarm when setting a group timer', async () => {
      const groupId = 901;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
      mockAdapter.tabs.set(91, { id: 91, groupId, windowId: 1, active: false });

      const timeout600s = 600000;
      groupManager.setGroupTimer(groupId, 1, timeout600s);

      // In-memory timer is set
      expect(groupManager.getGroupState(groupId)?.timer).not.toBeNull();

      // Persistent alarm is scheduled for MV3 service worker
      const alarm = await mockAdapter.getAlarm(`collapse_group_${groupId}`);
      expect(alarm).not.toBeNull();
      expect(alarm?.name).toBe(`collapse_group_${groupId}`);
      expect(alarm?.scheduledTime).toBeGreaterThanOrEqual(Date.now() + timeout600s - 100);
    });

    it('clears persistent alarm when a group is activated or timer is removed', async () => {
      const groupId = 902;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
      mockAdapter.tabs.set(92, { id: 92, groupId, windowId: 1, active: false });

      groupManager.setGroupTimer(groupId, 1, 600000);
      expect(await mockAdapter.getAlarm(`collapse_group_${groupId}`)).not.toBeNull();

      // Clear timer
      groupManager.clearGroupTimer(groupId);
      expect(await mockAdapter.getAlarm(`collapse_group_${groupId}`)).toBeNull();

      // Re-set and remove timer
      groupManager.setGroupTimer(groupId, 1, 600000);
      expect(await mockAdapter.getAlarm(`collapse_group_${groupId}`)).not.toBeNull();

      groupManager.removeGroupTimer(groupId);
      expect(await mockAdapter.getAlarm(`collapse_group_${groupId}`)).toBeNull();
    });

    it('collapses group when alarm fires even if in-memory service worker state was reset', async () => {
      const groupId = 903;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
      mockAdapter.tabs.set(93, { id: 93, groupId, windowId: 1, active: false });

      groupManager.setGroupTimer(groupId, 1, 600000);

      // Simulate MV3 service worker termination (all memory state wiped)
      const freshGroupManager = new GroupManager(mockAdapter, configManager);

      // The browser alarm triggers when the timeout arrives
      await freshGroupManager.handleAlarmFired(groupId);

      const group = await mockAdapter.getTabGroup(groupId);
      expect(group.collapsed).toBe(true);
    });

    it('preserves existing alarm scheduled time on worker wakeup instead of resetting countdown', async () => {
      const groupId = 904;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
      mockAdapter.tabs.set(94, { id: 94, groupId, windowId: 1, active: false });

      const startTime = Date.now();
      const totalTimeout = 600000; // 10 minutes
      groupManager.setGroupTimer(groupId, 1, totalTimeout);

      // 4 minutes pass, worker wakes up from sleep
      jest.advanceTimersByTime(240000);

      // Worker re-evaluates groups on wakeup
      await groupManager.refreshGroupTimers();

      // The remaining time should be ~360,000ms (6 minutes), NOT reset back to 600,000ms
      const alarm = await mockAdapter.getAlarm(`collapse_group_${groupId}`);
      expect(alarm?.scheduledTime).toBe(startTime + totalTimeout);

      // Advance remaining 360,000ms
      await jest.advanceTimersByTimeAsync(360000);

      expect((await mockAdapter.getTabGroup(groupId)).collapsed).toBe(true);
    });

    it('immediately collapses group if alarm time passed while worker was sleeping', async () => {
      const groupId = 905;
      mockAdapter.groups.set(groupId, { id: groupId, collapsed: false, windowId: 1 });
      mockAdapter.tabs.set(95, { id: 95, groupId, windowId: 1, active: false });

      // Alarm was scheduled in the past
      await mockAdapter.createAlarm(`collapse_group_${groupId}`, { when: Date.now() - 5000 });

      // Service worker boots and refreshes groups
      await groupManager.refreshGroupTimers();

      // Group should be immediately collapsed since alarm is overdue
      expect((await mockAdapter.getTabGroup(groupId)).collapsed).toBe(true);
    });
  });
});
