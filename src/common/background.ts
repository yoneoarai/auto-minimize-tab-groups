import { BrowserAPI } from './browser-api';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const DEBOUNCE_DELAY_MS = 250; // Event debouncing delay
const NEW_TAB_GRACE_PERIOD_MS = 1000; // Grace period for new tabs to settle
const JUST_OPENED_GRACE_PERIOD_MS = 5000; // Grace period for manually opened groups
const STARTUP_DELAY_MS = 2000; // Delay before initializing on startup
const INSTALL_DELAY_MS = 1000; // Delay before initializing on install/update

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Per-group timer management
 */
interface GroupState {
  timer: ReturnType<typeof setTimeout> | null;
  lastActivity: number;
  isActive: boolean;
  windowId: number;
  justOpened?: number; // Timestamp when group was manually opened
}

let globalTimeout: number = DEFAULT_TIMEOUT_MS;
const groupTimers = new Map<number, GroupState>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let activeGroupId: number | null = null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validates the timeout value and returns a number.
 * If the timeout value is not a valid number or less than or equal to 0, returns the default timeout.
 */
function validateTimeout(timeout: any): number {
  const parsedTimeout = parseInt(timeout);
  if (isNaN(parsedTimeout) || parsedTimeout <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return parsedTimeout;
}

/**
 * Minimizes a tab group and cleans up its timer.
 */
async function minimizeTabGroup(groupId: number): Promise<void> {
  try {
    await BrowserAPI.tabGroups.update(groupId, { collapsed: true });
    removeGroupTimer(groupId);
  } catch (error) {
    console.warn(`Failed to minimize group ${groupId}:`, error);
    removeGroupTimer(groupId);
  }
}

/**
 * Opens a collapsed group for UX clarity and marks it as recently opened.
 * This shows users where their tab was placed (important for auto-grouping plugins).
 */
async function openGroupForVisibility(groupId: number, windowId: number): Promise<void> {
  try {
    const group = await BrowserAPI.tabGroupsGet(groupId);
    if (group.collapsed) {
      await BrowserAPI.tabGroups.update(groupId, { collapsed: false });
      
      // Mark group as recently opened to prevent immediate re-minimization
      let groupState = groupTimers.get(groupId);
      if (!groupState) {
        groupState = {
          timer: null,
          lastActivity: Date.now(),
          isActive: groupId === activeGroupId,
          windowId,
          justOpened: Date.now()
        };
        groupTimers.set(groupId, groupState);
      } else {
        groupState.justOpened = Date.now();
      }
    }
  } catch (error) {
    console.warn(`Failed to open group ${groupId}:`, error);
  }
}

/**
 * Reactivates the timer for a group that is no longer active.
 * Called when switching away from a group.
 */
async function reactivateTimerForGroup(groupId: number): Promise<void> {
  try {
    const group = await BrowserAPI.tabGroupsGet(groupId);
    if (!group.collapsed) {
      const groupTabs = await BrowserAPI.tabsQuery({ groupId });
      if (groupTabs.length > 0 && groupTabs[0].windowId) {
        setGroupActive(groupId, false, groupTabs[0].windowId);
        setGroupTimer(groupId, groupTabs[0].windowId);
      }
    }
  } catch (error) {
    console.warn(`Failed to reactivate timer for group ${groupId}:`, error);
  }
}

// ============================================================================
// TIMER MANAGEMENT
// ============================================================================

/**
 * Set or reset a timer for a specific group
 */
function setGroupTimer(groupId: number, windowId: number): void {
  const existingState = groupTimers.get(groupId);
  
  // Clear existing timer if present
  if (existingState?.timer) {
    clearTimeout(existingState.timer);
  }
  
  // Create new timer
  const timer = setTimeout(async () => {
    try {
      const groupState = groupTimers.get(groupId);
      if (!groupState || groupState.isActive) {
        return; // Group is active or was cleaned up
      }
      
      // Double-check group still exists and has no active tabs
      const groupTabs = await BrowserAPI.tabsQuery({ groupId });
      const hasActiveTabs = groupTabs.some(tab => tab.active);
      
      if (!hasActiveTabs && groupTabs.length > 0) {
        // Check if group was recently opened (within 5 seconds)
        const groupState = groupTimers.get(groupId);
        const now = Date.now();
        if (groupState?.justOpened && (now - groupState.justOpened) < JUST_OPENED_GRACE_PERIOD_MS) {
          // Group was recently opened, give it more time
          setGroupTimer(groupId, groupState.windowId);
          return;
        }
        
        // Check if group is already collapsed
        const group = await BrowserAPI.tabGroupsGet(groupId);
        if (!group.collapsed) {
          await minimizeTabGroup(groupId);
        } else {
          removeGroupTimer(groupId);
        }
      } else {
        // Group has active tabs or is empty, clean up timer
        removeGroupTimer(groupId);
      }
    } catch (error) {
      console.warn(`Error processing group ${groupId} timer:`, error);
      removeGroupTimer(groupId);
    }
  }, globalTimeout);
  
  // Update group state - preserve existing isActive state if it exists
  const existingGroupState = groupTimers.get(groupId);
  const groupState = {
    timer,
    lastActivity: Date.now(),
    isActive: existingGroupState ? existingGroupState.isActive : (groupId === activeGroupId),
    windowId
  };
  groupTimers.set(groupId, groupState);
}

/**
 * Clear timer for a specific group (preserves group state)
 */
function clearGroupTimer(groupId: number): void {
  const groupState = groupTimers.get(groupId);
  if (groupState?.timer) {
    clearTimeout(groupState.timer);
    groupState.timer = null; // Clear timer but keep group state
  }
}

/**
 * Completely remove a group from timer management
 */
function removeGroupTimer(groupId: number): void {
  const groupState = groupTimers.get(groupId);
  if (groupState?.timer) {
    clearTimeout(groupState.timer);
  }
  groupTimers.delete(groupId);
}

/**
 * Mark a group as active (prevents minimization)
 * Creates group state entry if it doesn't exist
 */
function setGroupActive(groupId: number, isActive: boolean, windowId?: number): void {
  let groupState = groupTimers.get(groupId);
  
  // Create group state if it doesn't exist
  if (!groupState) {
    // Try to get windowId if not provided
    if (!windowId) {
      // We'll set windowId when we actually need to set a timer
      windowId = 0; // Placeholder, will be updated when timer is set
    }
    
    groupState = {
      timer: null,
      lastActivity: Date.now(),
      isActive: isActive,
      windowId: windowId
    };
    groupTimers.set(groupId, groupState);
  } else {
    // Update existing state
    groupState.isActive = isActive;
    groupState.lastActivity = Date.now();
    
    if (isActive) {
      // Clear timer for active group
      if (groupState.timer) {
        clearTimeout(groupState.timer);
        groupState.timer = null;
      }
    }
  }
}

/**
 * Debounced function to refresh group timers
 */
function debounceRefreshTimers(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  debounceTimer = setTimeout(async () => {
    try {
      await refreshGroupTimers();
    } catch (error) {
      console.error('Error refreshing group timers:', error);
    }
  }, DEBOUNCE_DELAY_MS);
}

/**
 * Refresh timers for all non-active groups
 */
async function refreshGroupTimers(): Promise<void> {
  try {
    const windows = await BrowserAPI.windowsGetAll({ populate: false });
    
    for (const window of windows) {
      if (!window.id) continue;
      
      try {
        const groups = await BrowserAPI.tabGroupsQuery({ windowId: window.id });
        
        for (const group of groups) {
          if (group.collapsed) continue; // Skip already collapsed groups
          
          const groupId = group.id;
          const isActiveGroup = groupId === activeGroupId;
          
          if (isActiveGroup) {
            // Clear timer for active group
            clearGroupTimer(groupId);
            setGroupActive(groupId, true);
          } else {
            // Set or refresh timer for inactive group
            setGroupTimer(groupId, window.id);
            setGroupActive(groupId, false);
          }
        }
      } catch (error) {
        console.warn(`Failed to process groups in window ${window.id}:`, error);
      }
    }
    
    // Clean up timers for groups that no longer exist
    await cleanupTimers();
  } catch (error) {
    console.error('Error in refreshGroupTimers:', error);
  }
}

/**
 * Clean up timers for groups that no longer exist
 */
async function cleanupTimers(): Promise<void> {
  const groupsToRemove: number[] = [];
  
  // Batch check all groups at once instead of individual queries
  try {
    const allGroups = new Set<number>();
    const windows = await BrowserAPI.windowsGetAll({ populate: false });
    
    for (const window of windows) {
      if (!window.id) continue;
      try {
        const groups = await BrowserAPI.tabGroupsQuery({ windowId: window.id });
        groups.forEach(group => allGroups.add(group.id));
      } catch (error) {
        console.warn(`Failed to get groups for window ${window.id}:`, error);
      }
    }
    
    // Remove timers for groups that no longer exist
    for (const [groupId] of groupTimers) {
      if (!allGroups.has(groupId)) {
        groupsToRemove.push(groupId);
      }
    }
    
    groupsToRemove.forEach(groupId => removeGroupTimer(groupId));
  } catch (error) {
    console.error('Error cleaning up timers:', error);
  }
}

/**
 * Initialize the timer system
 */
async function initializeTimers(): Promise<void> {
  try {
    // Load timeout from storage
    const result = await BrowserAPI.storageGet(["timeout"]);
    globalTimeout = validateTimeout(result.timeout);
    
    // Set up initial timers
    await refreshGroupTimers();
  } catch (error) {
    console.error('Error initializing timers:', error);
    globalTimeout = DEFAULT_TIMEOUT_MS;
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Event listener for tab activation.
 * Updates the active group and manages timers accordingly.
 */
BrowserAPI.tabs.onActivated.addListener(async function (activeInfo: chrome.tabs.TabActiveInfo) {
  try {
    const tab = await BrowserAPI.tabsGet(activeInfo.tabId);
    const previousActiveGroupId = activeGroupId;
    
    if (tab.groupId !== -1) {
      activeGroupId = tab.groupId;
      
      // Mark new group as active
      setGroupActive(activeGroupId, true, tab.windowId);
      clearGroupTimer(activeGroupId);
      
      // If previous group is different, reactivate its timer
      if (previousActiveGroupId && previousActiveGroupId !== activeGroupId) {
        await reactivateTimerForGroup(previousActiveGroupId);
      }
    } else {
      // Tab is not in a group
      if (previousActiveGroupId) {
        await reactivateTimerForGroup(previousActiveGroupId);
      }
      activeGroupId = null;
    }
  } catch (error) {
    console.warn('Failed to handle tab activation:', error);
  }
});

/**
 * Event listener for tab creation.
 * Manages group timers when new tabs are created and focuses new groups.
 */
BrowserAPI.tabs.onCreated.addListener(async function (tab: chrome.tabs.Tab) {
  try {
    // If tab is created in a group, open it to show where the tab was placed
    if (tab.groupId !== -1 && tab.windowId) {
      await openGroupForVisibility(tab.groupId, tab.windowId);
      
      // Set timer for non-active groups with grace period
      if (tab.groupId !== activeGroupId) {
        const groupId = tab.groupId;
        const windowId = tab.windowId;
        
        clearGroupTimer(groupId);
        setTimeout(() => {
          if (groupId !== activeGroupId) {
            setGroupTimer(groupId, windowId);
          }
        }, NEW_TAB_GRACE_PERIOD_MS);
      }
    }
    
    // Handle opener tab scenario
    if (tab.openerTabId !== undefined) {
      try {
        const openerTab = await BrowserAPI.tabsGet(tab.openerTabId);
        if (openerTab.groupId !== -1 && openerTab.groupId !== activeGroupId && openerTab.windowId) {
          const openerGroupId = openerTab.groupId;
          const openerWindowId = openerTab.windowId;
          
          clearGroupTimer(openerGroupId);
          setTimeout(() => {
            if (openerGroupId !== activeGroupId) {
              setGroupTimer(openerGroupId, openerWindowId);
            }
          }, NEW_TAB_GRACE_PERIOD_MS);
        }
      } catch (error) {
        console.warn('Failed to handle opener tab:', error);
      }
    }
    
    debounceRefreshTimers();
  } catch (error) {
    console.warn('Failed to handle tab creation:', error);
  }
});

/**
 * Event listener for tab updates.
 * Handles when tabs are moved into or out of groups.
 */
BrowserAPI.tabs.onUpdated.addListener(async function (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
  try {
    // Check if tab groupId changed
    if (changeInfo.groupId !== undefined) {
      // CRITICAL: Check if this is the active tab and update activeGroupId accordingly
      // This is essential for auto-grouping plugin compatibility
      if (tab.active) {
        const previousActiveGroupId = activeGroupId;
        
        if (changeInfo.groupId === -1) {
          // Active tab removed from group
          activeGroupId = null;
          if (previousActiveGroupId) {
            await reactivateTimerForGroup(previousActiveGroupId);
          }
        } else {
          // Active tab moved into a group - update activeGroupId
          activeGroupId = changeInfo.groupId;
          setGroupActive(changeInfo.groupId, true, tab.windowId);
          clearGroupTimer(changeInfo.groupId);
          
          // Reactivate timer for previous group if different
          if (previousActiveGroupId && previousActiveGroupId !== changeInfo.groupId) {
            await reactivateTimerForGroup(previousActiveGroupId);
          }
        }
      }
      
      // Handle UI feedback and timer management for non-active tabs
      if (changeInfo.groupId === -1) {
        // Tab removed from group - refresh timers to handle cleanup
        if (!tab.active) {
          debounceRefreshTimers();
        }
      } else {
        // Tab moved into a group - open to show where it was grouped
        if (tab.windowId) {
          await openGroupForVisibility(changeInfo.groupId, tab.windowId);
        }
        
        // Only set timer for non-active groups
        if (!tab.active && changeInfo.groupId !== activeGroupId && tab.windowId) {
          const groupId = changeInfo.groupId;
          const windowId = tab.windowId;
          
          clearGroupTimer(groupId);
          setTimeout(() => {
            if (groupId !== activeGroupId) {
              setGroupTimer(groupId, windowId);
            }
          }, NEW_TAB_GRACE_PERIOD_MS);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to handle tab update:', error);
  }
});

/**
 * Event listener for tab group updates.
 * Handles group state changes like creation, collapse/expand, etc.
 */
BrowserAPI.tabGroups.onUpdated.addListener(async function (group: chrome.tabGroups.TabGroup) {
  try {
    const groupId = group.id;
    
    if (group.collapsed) {
      // Group was collapsed, clean up timer
      removeGroupTimer(groupId);
    } else {
      // Group was expanded or updated
      if (groupId !== activeGroupId) {
        // Reset timer for non-active group
        const groupTabs = await BrowserAPI.tabsQuery({ groupId });
        if (groupTabs.length > 0 && groupTabs[0].windowId) {
          setGroupTimer(groupId, groupTabs[0].windowId);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to handle group update:', error);
  }
});

/**
 * Event listener for tab removal.
 * Clean up timers for groups that become empty.
 */
BrowserAPI.tabs.onRemoved.addListener(async function (tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) {
  try {
    // Debounce refresh to handle cleanup after tab removal
    debounceRefreshTimers();
  } catch (error) {
    console.warn('Failed to handle tab removal:', error);
  }
});

/**
 * Event listener for window focus changes.
 * Refresh timers when switching between windows.
 */
BrowserAPI.windows.onFocusChanged.addListener(function (windowId: number) {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    debounceRefreshTimers();
  }
});

/**
 * Event listeners for storage changes.
 */
BrowserAPI.storage.onChanged.addListener(function (changes: {[key: string]: chrome.storage.StorageChange}) {
  try {
    for (let key in changes) {
      if (key === "timeout") {
        const newValue = changes[key].newValue;
        const newTimeout = validateTimeout(newValue);
        
        if (newTimeout !== globalTimeout) {
          globalTimeout = newTimeout;
          
          // Refresh all timers with new timeout
          // Clear all existing timers and restart system
          for (const [groupId, groupState] of groupTimers) {
            if (groupState.timer) {
              clearTimeout(groupState.timer);
            }
          }
          groupTimers.clear();
          
          // Restart timers with new timeout
          debounceRefreshTimers();
        }
      }
    }
  } catch (error) {
    console.error('Error handling storage change:', error);
  }
});

/**
 * Event listener for startup and install.
 * Initialize the timer system properly.
 */
BrowserAPI.runtime.onStartup.addListener(async function () {
  try {
    // Wait for browser to stabilize before initializing
    setTimeout(async () => {
      await initializeTimers();
    }, STARTUP_DELAY_MS);
  } catch (error) {
    console.error('Error during startup:', error);
  }
});

BrowserAPI.runtime.onInstalled.addListener(async function (details: chrome.runtime.InstalledDetails) {
  try {
    if (details.reason === 'install' || details.reason === 'update') {
      setTimeout(async () => {
        await initializeTimers();
      }, INSTALL_DELAY_MS);
    }
  } catch (error) {
    console.error('Error during install/update:', error);
  }
});

// Initialize timers when script loads
initializeTimers().catch(error => {
  console.error('Error during initial timer setup:', error);
});
