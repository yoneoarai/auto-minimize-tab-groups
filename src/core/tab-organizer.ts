import { IBrowserAdapter, BrowserTab, TabChangeInfo } from '../types/browser';
import { ConfigManager } from './config-manager';
import { RuleEngine } from './rule-engine';
import { TabGroupColor } from '../types/rules';
import { DEFAULT_GROUPING_DELAY_MS } from '../common/constants';

/**
 * Service that organizes tabs into named, colored groups based on configured URL rules.
 * Handles automatic group creation, membership, group ordering, and respects user manual moves.
 */
export class TabOrganizer {
  private manualOverrides: Set<number> = new Set();
  private pendingGroupAssignments: Set<number> = new Set();
  private tabUrls: Map<number, string> = new Map();
  private windowOrderPromises: Map<number, Promise<void>> = new Map();
  private pendingDebounceTimers: Map<number, any> = new Map();

  constructor(
    private browserAdapter: IBrowserAdapter,
    private configManager: ConfigManager,
    private ruleEngine: typeof RuleEngine = RuleEngine
  ) {}

  /**
   * Returns current manual overrides set.
   */
  public getManualOverrides(): Set<number> {
    return new Set(this.manualOverrides);
  }

  /**
   * Clears all manual overrides.
   */
  public clearManualOverrides(): void {
    this.manualOverrides.clear();
  }

  /**
   * Evaluates a tab's URL against rules and assigns it to the matching group.
   */
  public async organizeTab(tab: BrowserTab): Promise<void> {
    if (!tab.id) return;

    // Pinned tabs must never be organized into groups
    if (tab.pinned) return;

    const config = this.configManager.getConfig();
    if (!config.enabled) return;
    if (config.autoGroupTabs === false) return;

    // Respect manual overrides: if the user moved this tab, do not re-assign until URL navigates
    if (this.manualOverrides.has(tab.id)) {
      return;
    }

    let url = tab.url || tab.pendingUrl;
    let pinned: boolean | undefined = tab.pinned;
    let groupId: number | undefined = tab.groupId;
    if (!url || pinned === undefined || groupId === undefined) {
      try {
        const fullTab = await this.browserAdapter.getTab(tab.id);
        if (!url) {
          url = fullTab.url || fullTab.pendingUrl;
        }
        if (pinned === undefined) {
          pinned = fullTab.pinned;
        }
        if (groupId === undefined) {
          groupId = fullTab.groupId;
        }
      } catch {
        return;
      }
    }

    if (pinned) return;
    if (!url) return;

    // Skip internal browser schemes (e.g. chrome://, about:, extensions)
    if (/^(chrome|edge|about|chrome-extension|moz-extension):\/\//i.test(url)) {
      return;
    }

    // Sticky Grouping / Ignore Auth Redirects:
    // If the tab is already inside a group, and navigates to an authentication/SSO endpoint,
    // keep it in its current group so it doesn't hop across groups or lose its place.
    if (
      config.ignoreAuthRedirects !== false &&
      groupId !== undefined &&
      groupId !== -1 &&
      this.ruleEngine.isAuthUrl(url)
    ) {
      this.tabUrls.set(tab.id, url);
      return;
    }

    this.tabUrls.set(tab.id, url);

    const allRules = this.configManager.getRules();
    const activeRules =
      config.unmatchedTabBehavior === 'general-group'
        ? allRules
        : allRules.filter((r) => !r.isFallback);

    const matchedRule = this.ruleEngine.matchUrl(url, activeRules);

    if (matchedRule) {
      await this.assignTabToNamedGroup(tab, matchedRule.name, matchedRule.color);
    }
  }

  /**
   * Assigns a tab to a group with the given name and color, creating the group if needed.
   */
  private async assignTabToNamedGroup(
    tab: BrowserTab,
    name: string,
    color: TabGroupColor
  ): Promise<number | undefined> {
    if (!tab.id || !this.browserAdapter.groupTabs) return undefined;

    const windowId = tab.windowId;
    const groups = await this.browserAdapter.queryTabGroups({ windowId });

    // Look for an existing group in the same window with matching title and color
    const targetGroup = groups.find(
      (g) =>
        (g.title || '').trim().toLowerCase() === name.trim().toLowerCase() &&
        (g.color || '').toLowerCase() === color.toLowerCase()
    );

    if (targetGroup) {
      if (tab.groupId !== targetGroup.id) {
        this.pendingGroupAssignments.add(tab.id!);
        try {
          const config = this.configManager.getConfig();
          const insertPosition = config.tabInsertPosition || 'end';
          let frontIndex: number | undefined;

          if (insertPosition === 'front') {
            const allTabs = await this.browserAdapter.queryTabs(windowId ? { windowId } : {});
            const groupTabs = allTabs.filter((t) => t.groupId === targetGroup.id && t.id !== tab.id);
            if (groupTabs.length > 0) {
              frontIndex = Math.min(...groupTabs.map((t) => (typeof t.index === 'number' ? t.index : 0)));
            }
          }

          await this.browserAdapter.groupTabs({
            tabIds: [tab.id!],
            groupId: targetGroup.id,
          });

          if (frontIndex !== undefined && this.browserAdapter.moveTab) {
            await this.browserAdapter.moveTab(tab.id!, { index: frontIndex });
          }
        } finally {
          setTimeout(() => this.pendingGroupAssignments.delete(tab.id!), 1000);
        }
      }
      return targetGroup.id;
    } else {
      // Create new group in window
      this.pendingGroupAssignments.add(tab.id!);
      try {
        const newGroupId = await this.browserAdapter.groupTabs({
          tabIds: [tab.id!],
          createProperties: windowId ? { windowId } : undefined,
        });

        await this.browserAdapter.updateTabGroup(newGroupId, {
          title: name,
          color,
        });

        // Position the new group according to configured tab strip order if ordering is enabled
        const config = this.configManager.getConfig();
        if (config.groupOrdering === 'alphabetical' || config.groupOrdering === 'rules') {
          let winId = windowId;
          if (!winId && tab.id) {
            try {
              const freshTab = await this.browserAdapter.getTab(tab.id);
              winId = freshTab.windowId;
            } catch {}
          }
          if (winId) {
            await this.orderGroups(winId);
          }
        }

        return newGroupId;
      } finally {
        setTimeout(() => this.pendingGroupAssignments.delete(tab.id!), 1000);
      }
    }
  }

  /**
   * Re-evaluates and organizes all tabs across windows.
   */
  public async organizeAllTabs(windowId?: number): Promise<void> {
    const config = this.configManager.getConfig();
    if (!config.enabled) return;
    if (config.autoGroupTabs === false) return;

    // Reset manual overrides so tabs are not permanently locked when re-organizing
    this.manualOverrides.clear();

    try {
      const windows = windowId
        ? [{ id: windowId }]
        : await this.browserAdapter.getAllWindows({ populate: false });

      for (const win of windows) {
        if (!win.id) continue;
        const tabs = await this.browserAdapter.queryTabs({ windowId: win.id });
        for (const tab of tabs) {
          if (!tab.pinned) {
            if (tab.id) this.cancelPendingDebounce(tab.id);
            await this.organizeTab(tab);
          }
        }
        if (config.groupOrdering === 'alphabetical' || config.groupOrdering === 'rules') {
          await this.orderGroups(win.id);
        }
      }
    } catch (error) {
      console.warn('Error organizing tabs:', error);
    }
  }

  /**
   * Orders groups in all open windows according to configuration.
   */
  public async orderAllGroups(): Promise<void> {
    const config = this.configManager.getConfig();
    if (!config.enabled) return;
    if (config.groupOrdering === 'none' || config.groupOrdering === 'manual') return;

    try {
      const windows = await this.browserAdapter.getAllWindows({ populate: false });
      for (const win of windows) {
        if (win.id) {
          await this.orderGroups(win.id);
        }
      }
    } catch (error) {
      console.warn('Error ordering all groups:', error);
    }
  }

  /**
   * Orders groups in the specified window according to configuration.
   * Serializes per-window calls to avoid concurrent ordering races.
   */
  public async orderGroups(windowId: number): Promise<void> {
    const config = this.configManager.getConfig();
    if (!config.enabled) return;
    if (config.groupOrdering === 'none' || config.groupOrdering === 'manual') return;

    const currentPromise = this.windowOrderPromises.get(windowId) || Promise.resolve();
    const nextPromise = currentPromise
      .then(() => this.doOrderGroups(windowId))
      .catch((err) => {
        console.warn(`Failed to order groups in window ${windowId}:`, err);
      });
    this.windowOrderPromises.set(windowId, nextPromise);
    return nextPromise;
  }

  /**
   * Internal implementation that calculates physical tab strip positions and applies ordered moves.
   */
  private async doOrderGroups(windowId: number): Promise<void> {
    if (!this.browserAdapter.moveTabGroup) return;

    const config = this.configManager.getConfig();
    if (!config.enabled) return;
    if (config.groupOrdering === 'none' || config.groupOrdering === 'manual') return;

    try {
      const [groups, tabs] = await Promise.all([
        this.browserAdapter.queryTabGroups({ windowId }),
        this.browserAdapter.queryTabs({ windowId }),
      ]);

      if (groups.length <= 1 || tabs.length <= 1) return;

      // Map each group to its tabs and its current physical visual start position in the window
      const groupPositionMap = new Map<number, { minIndex: number; tabCount: number }>();
      for (const group of groups) {
        const groupTabs = tabs.filter((t) => t.groupId === group.id);
        if (groupTabs.length > 0) {
          const minIndex = Math.min(...groupTabs.map((t) => (typeof t.index === 'number' ? t.index : 0)));
          groupPositionMap.set(group.id, { minIndex, tabCount: groupTabs.length });
        }
      }

      // Filter groups to only those with active tabs in this window
      const activeGroups = groups.filter((g) => groupPositionMap.has(g.id));
      if (activeGroups.length <= 1) return;

      // Determine the actual current physical order of groups in the tab strip from left to right
      const currentVisualOrder = [...activeGroups].sort(
        (a, b) => groupPositionMap.get(a.id)!.minIndex - groupPositionMap.get(b.id)!.minIndex
      );

      const targetSortedGroups = [...activeGroups];
      if (config.groupOrdering === 'alphabetical') {
        targetSortedGroups.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      } else if (config.groupOrdering === 'rules') {
        const rules = config.rules || [];
        const ruleOrderMap = new Map<string, number>();
        rules.forEach((r, idx) => {
          ruleOrderMap.set(r.name.trim().toLowerCase(), typeof r.order === 'number' ? r.order : idx);
        });

        targetSortedGroups.sort((a, b) => {
          const titleA = (a.title || '').trim().toLowerCase();
          const titleB = (b.title || '').trim().toLowerCase();
          const orderA = ruleOrderMap.has(titleA) ? ruleOrderMap.get(titleA)! : 9999;
          const orderB = ruleOrderMap.has(titleB) ? ruleOrderMap.get(titleB)! : 9999;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return titleA.localeCompare(titleB);
        });
      }

      // Check if the physical visual order already matches the target sorted order
      const alreadyInOrder = currentVisualOrder.every(
        (g, i) => g.id === targetSortedGroups[i].id
      );
      if (alreadyInOrder) return;

      // Position groups starting from the current physical position of the leftmost group
      const startingIndex = groupPositionMap.get(currentVisualOrder[0].id)!.minIndex;
      let nextIndex = startingIndex;
      for (const group of targetSortedGroups) {
        const info = groupPositionMap.get(group.id);
        const tabCount = info?.tabCount || 1;
        await this.browserAdapter.moveTabGroup(group.id, { index: nextIndex });
        nextIndex += tabCount;
      }
    } catch (error) {
      console.warn(`Failed to order groups in window ${windowId}:`, error);
    }
  }

  // ==========================================================================
  // DEBOUNCED SCHEDULING HELPERS
  // ==========================================================================

  /**
   * Schedules a debounced organizeTab call for a tab.
   * If called again for the same tab before timeout expires, the previous timer is cancelled.
   */
  public scheduleOrganizeTab(tabId: number, delayMs: number): void {
    this.cancelPendingDebounce(tabId);

    const timer = setTimeout(async () => {
      this.pendingDebounceTimers.delete(tabId);
      try {
        const freshTab = await this.browserAdapter.getTab(tabId);
        if (freshTab && !freshTab.pinned) {
          await this.organizeTab(freshTab);
        }
      } catch {
        // Tab may have been closed
      }
    }, delayMs);

    this.pendingDebounceTimers.set(tabId, timer);
  }

  /**
   * Cancels any pending debounce timer for a tab.
   */
  public cancelPendingDebounce(tabId: number): void {
    const timer = this.pendingDebounceTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      this.pendingDebounceTimers.delete(tabId);
    }
  }

  /**
   * Returns whether a tab has a pending grouping debounce timer.
   */
  public hasPendingDebounce(tabId: number): boolean {
    return this.pendingDebounceTimers.has(tabId);
  }

  /**
   * Flushes all pending debounce timers immediately (useful for tests and clean transitions).
   */
  public async flushPendingDebounces(): Promise<void> {
    const tabIds = Array.from(this.pendingDebounceTimers.keys());
    for (const tabId of tabIds) {
      this.cancelPendingDebounce(tabId);
      try {
        const tab = await this.browserAdapter.getTab(tabId);
        if (tab && !tab.pinned) {
          await this.organizeTab(tab);
        }
      } catch {}
    }
  }

  /**
   * Clears all pending debounce timers without executing them.
   */
  public clearPendingTimers(): void {
    for (const timer of this.pendingDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingDebounceTimers.clear();
  }

  // ==========================================================================
  // BROWSER EVENT HANDLERS
  // ==========================================================================

  public handleTabCreated = async (tab: BrowserTab): Promise<void> => {
    if (tab.id) {
      this.manualOverrides.delete(tab.id);
      const url = tab.url || tab.pendingUrl;
      if (url) {
        this.tabUrls.set(tab.id, url);
      }
    }
    if (tab.pinned) {
      return;
    }

    const config = this.configManager.getConfig();
    if (!config.enabled || config.autoGroupTabs === false) {
      return;
    }

    const delayMs = config.groupingDelayMs ?? DEFAULT_GROUPING_DELAY_MS;
    if (delayMs > 0 && tab.id) {
      this.scheduleOrganizeTab(tab.id, delayMs);
    } else {
      await this.organizeTab(tab);
    }
  };

  public handleTabUpdated = async (
    tabId: number,
    changeInfo: TabChangeInfo,
    tab: BrowserTab
  ): Promise<void> => {
    // If tab is pinned or was just pinned, never group it
    if (tab.pinned || changeInfo.pinned === true) {
      this.manualOverrides.delete(tabId);
      this.cancelPendingDebounce(tabId);
      return;
    }

    // If tab was unpinned, evaluate for grouping
    if (changeInfo.pinned === false) {
      this.manualOverrides.delete(tabId);
      const config = this.configManager.getConfig();
      if (!config.enabled || config.autoGroupTabs === false) {
        return;
      }
      const delayMs = config.groupingDelayMs ?? DEFAULT_GROUPING_DELAY_MS;
      if (delayMs > 0) {
        this.scheduleOrganizeTab(tabId, delayMs);
      } else {
        await this.organizeTab({ ...tab, pinned: false });
      }
      return;
    }

    const currentUrl = changeInfo.url || tab.url || tab.pendingUrl;
    const previousUrl = this.tabUrls.get(tabId);

    // If navigation happened (new URL or URL changed), clear manual override and re-organize
    const hasNavigated =
      Boolean(changeInfo.url) ||
      Boolean(currentUrl && previousUrl && currentUrl !== previousUrl);

    if (hasNavigated) {
      const newUrl = changeInfo.url || currentUrl!;
      this.tabUrls.set(tabId, newUrl);
      this.manualOverrides.delete(tabId);

      const config = this.configManager.getConfig();
      if (!config.enabled || config.autoGroupTabs === false) {
        return;
      }

      const delayMs = config.groupingDelayMs ?? DEFAULT_GROUPING_DELAY_MS;
      if (delayMs > 0) {
        this.scheduleOrganizeTab(tabId, delayMs);
      } else {
        await this.organizeTab({ ...tab, url: newUrl });
      }
      return;
    }

    // If tab's group changed without URL change, check if it was our own action or a user drag
    if (changeInfo.groupId !== undefined && !changeInfo.url) {
      if (changeInfo.groupId !== -1 && this.pendingGroupAssignments.has(tabId)) {
        // This was our own programmatic grouping, not a user action.
        // DO NOT delete here: let the 1000ms timeout clean it up so subsequent
        // onUpdated events for this grouping operation don't falsely trigger manualOverrides.
        return;
      }
      this.manualOverrides.add(tabId);
      return;
    }
  };

  public handleTabRemoved = (tabId: number): void => {
    this.cancelPendingDebounce(tabId);
    this.manualOverrides.delete(tabId);
    this.tabUrls.delete(tabId);
    this.pendingGroupAssignments.delete(tabId);
  };
}
