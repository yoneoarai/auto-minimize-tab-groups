import { IBrowserAdapter, BrowserTab, TabActiveInfo, TabChangeInfo, TabRemoveInfo, BrowserTabGroup } from '../types/browser';
import { ConfigManager } from './config-manager';
import {
  DEBOUNCE_DELAY_MS,
  NEW_TAB_GRACE_PERIOD_MS,
  JUST_OPENED_GRACE_PERIOD_MS,
} from '../common/constants';

export interface GroupState {
  timer: ReturnType<typeof setTimeout> | null;
  lastActivity: number;
  isActive: boolean;
  windowId: number;
  justOpened?: number;
}

export class GroupManager {
  private groupTimers = new Map<number, GroupState>();
  private activeGroupId: number | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private browserAdapter: IBrowserAdapter,
    private configManager: ConfigManager
  ) {
    // Listen to configuration updates to reset timers with new timeout
    this.configManager.onConfigChanged(() => {
      this.resetAllTimers();
    });
  }

  /**
   * Returns the current active group ID.
   */
  public getActiveGroupId(): number | null {
    return this.activeGroupId;
  }

  /**
   * Returns a copy of the state for a group, or undefined if not tracked.
   */
  public getGroupState(groupId: number): GroupState | undefined {
    const state = this.groupTimers.get(groupId);
    return state ? { ...state } : undefined;
  }

  /**
   * Returns all currently tracked group IDs.
   */
  public getTrackedGroupIds(): number[] {
    return Array.from(this.groupTimers.keys());
  }

  /**
   * Minimizes a tab group and cleans up its timer.
   */
  public async minimizeTabGroup(groupId: number): Promise<void> {
    try {
      await this.browserAdapter.updateTabGroup(groupId, { collapsed: true });
    } catch (error) {
      console.warn(`Failed to minimize group ${groupId}:`, error);
    } finally {
      this.removeGroupTimer(groupId);
    }
  }

  /**
   * Expands a collapsed group for UX visibility (e.g. when a tab is added).
   */
  public async openGroupForVisibility(groupId: number, windowId: number): Promise<void> {
    try {
      const group = await this.browserAdapter.getTabGroup(groupId);
      if (group.collapsed) {
        await this.browserAdapter.updateTabGroup(groupId, { collapsed: false });

        let groupState = this.groupTimers.get(groupId);
        if (!groupState) {
          groupState = {
            timer: null,
            lastActivity: Date.now(),
            isActive: groupId === this.activeGroupId,
            windowId,
            justOpened: Date.now(),
          };
          this.groupTimers.set(groupId, groupState);
        } else {
          groupState.justOpened = Date.now();
        }
      }
    } catch (error) {
      console.warn(`Failed to open group ${groupId}:`, error);
    }
  }

  /**
   * Sets or resets the inactivity timer for a specific group.
   */
  public setGroupTimer(groupId: number, windowId: number, customDelayMs?: number): void {
    const existingState = this.groupTimers.get(groupId);
    if (existingState?.timer) {
      clearTimeout(existingState.timer);
    }

    const timeoutDelay = customDelayMs ?? this.configManager.getTimeoutMs();

    const timer = setTimeout(async () => {
      await this.handleTimerFired(groupId);
    }, timeoutDelay);

    const groupState: GroupState = {
      timer,
      lastActivity: Date.now(),
      isActive: existingState ? existingState.isActive : groupId === this.activeGroupId,
      windowId,
      justOpened: existingState?.justOpened,
    };

    this.groupTimers.set(groupId, groupState);
  }

  /**
   * Clears the timer for a group without deleting its state.
   */
  public clearGroupTimer(groupId: number): void {
    const groupState = this.groupTimers.get(groupId);
    if (groupState?.timer) {
      clearTimeout(groupState.timer);
      groupState.timer = null;
    }
  }

  /**
   * Completely removes a group from timer tracking.
   */
  public removeGroupTimer(groupId: number): void {
    const groupState = this.groupTimers.get(groupId);
    if (groupState?.timer) {
      clearTimeout(groupState.timer);
    }
    this.groupTimers.delete(groupId);
  }

  /**
   * Sets whether a group is currently active.
   */
  public setGroupActive(groupId: number, isActive: boolean, windowId?: number): void {
    let groupState = this.groupTimers.get(groupId);

    if (!groupState) {
      groupState = {
        timer: null,
        lastActivity: Date.now(),
        isActive,
        windowId: windowId ?? 0,
      };
      this.groupTimers.set(groupId, groupState);
    } else {
      groupState.isActive = isActive;
      groupState.lastActivity = Date.now();
      if (windowId !== undefined && windowId > 0) {
        groupState.windowId = windowId;
      }
      if (isActive && groupState.timer) {
        clearTimeout(groupState.timer);
        groupState.timer = null;
      }
    }
  }

  /**
   * Reactivates the timer for a group when focus switches away from it.
   */
  public async reactivateTimerForGroup(groupId: number): Promise<void> {
    try {
      const group = await this.browserAdapter.getTabGroup(groupId);
      if (!group.collapsed) {
        const groupTabs = await this.browserAdapter.queryTabs({ groupId });
        if (groupTabs.length > 0 && groupTabs[0].windowId) {
          this.setGroupActive(groupId, false, groupTabs[0].windowId);
          this.setGroupTimer(groupId, groupTabs[0].windowId);
        }
      }
    } catch (error) {
      console.warn(`Failed to reactivate timer for group ${groupId}:`, error);
    }
  }

  /**
   * Handles timer completion for a group.
   */
  private async handleTimerFired(groupId: number): Promise<void> {
    try {
      const groupState = this.groupTimers.get(groupId);
      if (!groupState || groupState.isActive) {
        return;
      }

      const groupTabs = await this.browserAdapter.queryTabs({ groupId });
      const hasActiveTabs = groupTabs.some((tab) => tab.active);

      if (!hasActiveTabs && groupTabs.length > 0) {
        const now = Date.now();
        if (groupState.justOpened && now - groupState.justOpened < JUST_OPENED_GRACE_PERIOD_MS) {
          // Re-arm timer with remaining grace period
          this.setGroupTimer(groupId, groupState.windowId);
          return;
        }

        const group = await this.browserAdapter.getTabGroup(groupId);
        if (!group.collapsed) {
          await this.minimizeTabGroup(groupId);
        } else {
          this.removeGroupTimer(groupId);
        }
      } else {
        this.removeGroupTimer(groupId);
      }
    } catch (error) {
      console.warn(`Error processing group ${groupId} timer:`, error);
      this.removeGroupTimer(groupId);
    }
  }

  /**
   * Debounces a full refresh of all tab group timers.
   */
  public debounceRefreshTimers(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        await this.refreshGroupTimers();
      } catch (error) {
        console.error('Error refreshing group timers:', error);
      }
    }, DEBOUNCE_DELAY_MS);
  }

  /**
   * Refreshes timers for all tab groups across all browser windows.
   */
  public async refreshGroupTimers(): Promise<void> {
    try {
      const windows = await this.browserAdapter.getAllWindows({ populate: false });

      for (const window of windows) {
        if (!window.id) continue;

        try {
          const groups = await this.browserAdapter.queryTabGroups({ windowId: window.id });

          for (const group of groups) {
            if (group.collapsed) continue;

            const groupId = group.id;
            const isActiveGroup = groupId === this.activeGroupId;

            if (isActiveGroup) {
              this.clearGroupTimer(groupId);
              this.setGroupActive(groupId, true, window.id);
            } else {
              this.setGroupTimer(groupId, window.id);
              this.setGroupActive(groupId, false, window.id);
            }
          }
        } catch (error) {
          console.warn(`Failed to process groups in window ${window.id}:`, error);
        }
      }

      await this.cleanupTimers();
    } catch (error) {
      console.error('Error in refreshGroupTimers:', error);
    }
  }

  /**
   * Cleans up timers for groups that have been closed or deleted.
   */
  public async cleanupTimers(): Promise<void> {
    try {
      const allGroups = new Set<number>();
      const windows = await this.browserAdapter.getAllWindows({ populate: false });

      for (const window of windows) {
        if (!window.id) continue;
        try {
          const groups = await this.browserAdapter.queryTabGroups({ windowId: window.id });
          groups.forEach((g) => allGroups.add(g.id));
        } catch (error) {
          console.warn(`Failed to get groups for window ${window.id}:`, error);
        }
      }

      const groupsToRemove: number[] = [];
      for (const [groupId] of this.groupTimers) {
        if (!allGroups.has(groupId)) {
          groupsToRemove.push(groupId);
        }
      }

      groupsToRemove.forEach((groupId) => this.removeGroupTimer(groupId));
    } catch (error) {
      console.error('Error cleaning up timers:', error);
    }
  }

  /**
   * Resets all existing timers and refreshes.
   */
  public resetAllTimers(): void {
    for (const [, state] of this.groupTimers) {
      if (state.timer) {
        clearTimeout(state.timer);
      }
    }
    this.groupTimers.clear();
    this.debounceRefreshTimers();
  }

  // ==========================================================================
  // BROWSER EVENT HANDLERS
  // ==========================================================================

  public async handleTabActivated(activeInfo: TabActiveInfo): Promise<void> {
    try {
      const tab = await this.browserAdapter.getTab(activeInfo.tabId);
      const previousActiveGroupId = this.activeGroupId;

      if (tab.groupId !== undefined && tab.groupId !== -1) {
        this.activeGroupId = tab.groupId;

        this.setGroupActive(this.activeGroupId, true, tab.windowId);
        this.clearGroupTimer(this.activeGroupId);

        if (previousActiveGroupId && previousActiveGroupId !== this.activeGroupId) {
          await this.reactivateTimerForGroup(previousActiveGroupId);
        }
      } else {
        if (previousActiveGroupId) {
          await this.reactivateTimerForGroup(previousActiveGroupId);
        }
        this.activeGroupId = null;
      }
    } catch (error) {
      console.warn('Failed to handle tab activation:', error);
    }
  }

  public async handleTabCreated(tab: BrowserTab): Promise<void> {
    try {
      if (tab.groupId !== undefined && tab.groupId !== -1 && tab.windowId) {
        await this.openGroupForVisibility(tab.groupId, tab.windowId);

        if (tab.groupId !== this.activeGroupId) {
          const groupId = tab.groupId;
          const windowId = tab.windowId;

          this.clearGroupTimer(groupId);
          setTimeout(() => {
            if (groupId !== this.activeGroupId) {
              this.setGroupTimer(groupId, windowId);
            }
          }, NEW_TAB_GRACE_PERIOD_MS);
        }
      }

      if (tab.openerTabId !== undefined) {
        try {
          const openerTab = await this.browserAdapter.getTab(tab.openerTabId);
          if (
            openerTab.groupId !== undefined &&
            openerTab.groupId !== -1 &&
            openerTab.groupId !== this.activeGroupId &&
            openerTab.windowId
          ) {
            const openerGroupId = openerTab.groupId;
            const openerWindowId = openerTab.windowId;

            this.clearGroupTimer(openerGroupId);
            setTimeout(() => {
              if (openerGroupId !== this.activeGroupId) {
                this.setGroupTimer(openerGroupId, openerWindowId);
              }
            }, NEW_TAB_GRACE_PERIOD_MS);
          }
        } catch (error) {
          console.warn('Failed to handle opener tab:', error);
        }
      }

      this.debounceRefreshTimers();
    } catch (error) {
      console.warn('Failed to handle tab creation:', error);
    }
  }

  public async handleTabUpdated(
    _tabId: number,
    changeInfo: TabChangeInfo,
    tab: BrowserTab
  ): Promise<void> {
    try {
      if (changeInfo.groupId !== undefined) {
        if (tab.active) {
          const previousActiveGroupId = this.activeGroupId;

          if (changeInfo.groupId === -1) {
            this.activeGroupId = null;
            if (previousActiveGroupId) {
              await this.reactivateTimerForGroup(previousActiveGroupId);
            }
          } else {
            this.activeGroupId = changeInfo.groupId;
            this.setGroupActive(changeInfo.groupId, true, tab.windowId);
            this.clearGroupTimer(changeInfo.groupId);

            if (previousActiveGroupId && previousActiveGroupId !== changeInfo.groupId) {
              await this.reactivateTimerForGroup(previousActiveGroupId);
            }
          }
        }

        if (changeInfo.groupId === -1) {
          if (!tab.active) {
            this.debounceRefreshTimers();
          }
        } else {
          if (tab.windowId) {
            await this.openGroupForVisibility(changeInfo.groupId, tab.windowId);
          }

          if (!tab.active && changeInfo.groupId !== this.activeGroupId && tab.windowId) {
            const groupId = changeInfo.groupId;
            const windowId = tab.windowId;

            this.clearGroupTimer(groupId);
            setTimeout(() => {
              if (groupId !== this.activeGroupId) {
                this.setGroupTimer(groupId, windowId);
              }
            }, NEW_TAB_GRACE_PERIOD_MS);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to handle tab update:', error);
    }
  }

  public handleTabRemoved(_tabId: number, _removeInfo: TabRemoveInfo): void {
    this.debounceRefreshTimers();
  }

  public async handleTabGroupUpdated(group: BrowserTabGroup): Promise<void> {
    try {
      const groupId = group.id;

      if (group.collapsed) {
        this.removeGroupTimer(groupId);
      } else {
        if (groupId !== this.activeGroupId) {
          const groupTabs = await this.browserAdapter.queryTabs({ groupId });
          if (groupTabs.length > 0 && groupTabs[0].windowId) {
            this.setGroupTimer(groupId, groupTabs[0].windowId);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to handle group update:', error);
    }
  }

  public handleWindowFocusChanged(windowId: number): void {
    if (windowId !== this.browserAdapter.WINDOW_ID_NONE) {
      this.debounceRefreshTimers();
    }
  }
}
