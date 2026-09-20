import { IBrowserAdapter, BrowserTab, TabChangeInfo } from '../types/browser';
import { ConfigManager } from './config-manager';
import { RuleEngine } from './rule-engine';
import { TabGroupColor } from '../types/rules';

/**
 * Service that organizes tabs into named, colored groups based on configured URL rules.
 * Handles automatic group creation, membership, group ordering, and respects user manual moves.
 */
export class TabOrganizer {
  private manualOverrides: Set<number> = new Set();

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

    const config = this.configManager.getConfig();
    if (!config.enabled) return;

    // Respect manual overrides: if the user moved this tab, do not re-assign until URL navigates
    if (this.manualOverrides.has(tab.id)) {
      return;
    }

    let url = tab.url || tab.pendingUrl;
    if (!url) {
      try {
        const fullTab = await this.browserAdapter.getTab(tab.id);
        url = fullTab.url || fullTab.pendingUrl;
      } catch {
        return;
      }
    }

    if (!url) return;

    // Skip internal browser schemes (e.g. chrome://, about:, extensions)
    if (/^(chrome|edge|about|chrome-extension|moz-extension):\/\//i.test(url)) {
      return;
    }

    const rules = config.rules || [];
    const matchedRule = this.ruleEngine.matchUrl(url, rules);

    if (matchedRule) {
      await this.assignTabToNamedGroup(tab, matchedRule.name, matchedRule.color);
    } else if (config.unmatchedTabBehavior === 'general-group') {
      const generalGroup = config.generalGroup || { name: 'General', color: 'grey' };
      await this.assignTabToNamedGroup(tab, generalGroup.name, generalGroup.color);
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
        await this.browserAdapter.groupTabs({
          tabIds: [tab.id],
          groupId: targetGroup.id,
        });
      }
      return targetGroup.id;
    } else {
      // Create new group in window
      const newGroupId = await this.browserAdapter.groupTabs({
        tabIds: [tab.id],
        createProperties: windowId ? { windowId } : undefined,
      });

      await this.browserAdapter.updateTabGroup(newGroupId, {
        title: name,
        color,
      });

      return newGroupId;
    }
  }

  /**
   * Re-evaluates and organizes all tabs across windows.
   */
  public async organizeAllTabs(windowId?: number): Promise<void> {
    const config = this.configManager.getConfig();
    if (!config.enabled) return;

    try {
      const windows = windowId
        ? [{ id: windowId }]
        : await this.browserAdapter.getAllWindows({ populate: false });

      for (const win of windows) {
        if (!win.id) continue;
        const tabs = await this.browserAdapter.queryTabs({ windowId: win.id });
        for (const tab of tabs) {
          await this.organizeTab(tab);
        }
        await this.orderGroups(win.id);
      }
    } catch (error) {
      console.warn('Error organizing tabs:', error);
    }
  }

  /**
   * Orders groups in the specified window according to configuration.
   */
  public async orderGroups(windowId: number): Promise<void> {
    if (!this.browserAdapter.moveTabGroup) return;

    const config = this.configManager.getConfig();
    if (!config.enabled) return;

    try {
      const groups = await this.browserAdapter.queryTabGroups({ windowId });
      if (groups.length <= 1) return;

      const sortedGroups = [...groups];

      if (config.groupOrdering === 'alphabetical') {
        sortedGroups.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      } else if (config.groupOrdering === 'manual') {
        const rules = config.rules || [];
        const ruleOrderMap = new Map<string, number>();
        rules.forEach((r, idx) => {
          ruleOrderMap.set(r.name.trim().toLowerCase(), r.order ?? idx);
        });

        sortedGroups.sort((a, b) => {
          const titleA = (a.title || '').trim().toLowerCase();
          const titleB = (b.title || '').trim().toLowerCase();
          const orderA = ruleOrderMap.has(titleA) ? ruleOrderMap.get(titleA)! : 9999;
          const orderB = ruleOrderMap.has(titleB) ? ruleOrderMap.get(titleB)! : 9999;
          return orderA - orderB;
        });
      }

      // Reposition groups in order
      for (const group of sortedGroups) {
        await this.browserAdapter.moveTabGroup(group.id, { index: -1 });
      }
    } catch (error) {
      console.warn(`Failed to order groups in window ${windowId}:`, error);
    }
  }

  // ==========================================================================
  // BROWSER EVENT HANDLERS
  // ==========================================================================

  public handleTabCreated = async (tab: BrowserTab): Promise<void> => {
    if (tab.id) {
      this.manualOverrides.delete(tab.id);
    }
    await this.organizeTab(tab);
  };

  public handleTabUpdated = async (
    tabId: number,
    changeInfo: TabChangeInfo,
    tab: BrowserTab
  ): Promise<void> => {
    // If navigation happened (new URL), clear manual override and re-organize
    if (changeInfo.url) {
      this.manualOverrides.delete(tabId);
      await this.organizeTab({ ...tab, url: changeInfo.url });
      return;
    }

    // If tab's group changed without URL change, user manually dragged or ungrouped the tab
    if (changeInfo.groupId !== undefined && !changeInfo.url) {
      this.manualOverrides.add(tabId);
      return;
    }
  };

  public handleTabRemoved = (tabId: number): void => {
    this.manualOverrides.delete(tabId);
  };
}
