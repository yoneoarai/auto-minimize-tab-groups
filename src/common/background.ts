import { BrowserAPI } from './browser-api';

/**
 * Global timeout value in milliseconds.
 */
let globalTimeout: number = 30000;

/**
 * Per-group timer management
 */
interface GroupState {
  timer: ReturnType<typeof setTimeout> | null;
  lastActivity: number;
  isActive: boolean;
  windowId: number;
}

const groupTimers = new Map<number, GroupState>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let activeGroupId: number | null = null;

/**
 * Validates the timeout value and returns a number.
 * If the timeout value is not a valid number or less than or equal to 0, the default timeout value of 30000 is returned.
 */
function validateTimeout(timeout: any): number {
  const parsedTimeout = parseInt(timeout);
  if (isNaN(parsedTimeout) || parsedTimeout <= 0) {
    return 30000;
  }
  return parsedTimeout;
}

/**
 * Helper function to minimize a tab group by its groupId with error handling.
 */
async function minimizeTabGroup(groupId: number): Promise<void> {
  try {
    await BrowserAPI.tabGroups.update(groupId, { collapsed: true });
    
    // Clean up timer after successful minimization
    removeGroupTimer(groupId);
  } catch (error) {
    console.warn(`Failed to minimize group ${groupId}:`, error);
    // Clean up invalid group
    removeGroupTimer(groupId);
  }
}

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
  }, 250); // 250ms debounce
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
    globalTimeout = 30000; // Use default on error
  }
}

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
        try {
          const prevGroup = await BrowserAPI.tabGroupsGet(previousActiveGroupId);
          if (!prevGroup.collapsed) {
            // Find window ID by querying tabs in the group
            const prevGroupTabs = await BrowserAPI.tabsQuery({ groupId: previousActiveGroupId });
            if (prevGroupTabs.length > 0 && prevGroupTabs[0].windowId) {
              // Mark as inactive and provide windowId
              setGroupActive(previousActiveGroupId, false, prevGroupTabs[0].windowId);
              setGroupTimer(previousActiveGroupId, prevGroupTabs[0].windowId);
            }
          }
        } catch (error) {
          console.warn('Failed to reactivate timer for previous group:', error);
        }
      }
    } else {
      // Tab is not in a group
      if (previousActiveGroupId) {
        // Reactivate timer for previous group
        try {
          const prevGroup = await BrowserAPI.tabGroupsGet(previousActiveGroupId);
          if (!prevGroup.collapsed) {
            const prevGroupTabs = await BrowserAPI.tabsQuery({ groupId: previousActiveGroupId });
            if (prevGroupTabs.length > 0 && prevGroupTabs[0].windowId) {
              // Mark as inactive and provide windowId  
              setGroupActive(previousActiveGroupId, false, prevGroupTabs[0].windowId);
              setGroupTimer(previousActiveGroupId, prevGroupTabs[0].windowId);
            }
          }
        } catch (error) {
          console.warn('Failed to reactivate timer for previous group:', error);
        }
      }
      activeGroupId = null;
    }
  } catch (error) {
    console.warn('Failed to handle tab activation:', error);
  }
});

/**
 * Event listener for tab creation.
 * Manages group timers when new tabs are created.
 */
BrowserAPI.tabs.onCreated.addListener(async function (tab: chrome.tabs.Tab) {
  try {
    // If tab is created in a group, temporarily pause its timer
    if (tab.groupId !== -1 && tab.groupId !== activeGroupId) {
      // Clear existing timer for the group
      clearGroupTimer(tab.groupId);
      
      // Set a delayed timer to allow for tab settling
      setTimeout(() => {
        if (tab.windowId && tab.groupId !== activeGroupId) {
          setGroupTimer(tab.groupId, tab.windowId);
        }
      }, 1000); // 1 second grace period for new tabs
    }
    
    // Handle opener tab scenario
    if (tab.openerTabId !== undefined) {
      try {
        const openerTab = await BrowserAPI.tabsGet(tab.openerTabId);
        if (openerTab.groupId !== -1 && openerTab.groupId !== activeGroupId) {
          // Give grace period for opener group as well
          clearGroupTimer(openerTab.groupId);
          setTimeout(() => {
            if (openerTab.windowId && openerTab.groupId !== activeGroupId) {
              setGroupTimer(openerTab.groupId, openerTab.windowId);
            }
          }, 1000);
        }
      } catch (error) {
        console.warn('Failed to handle opener tab:', error);
      }
    }
    
    // Debounce refresh to handle multiple rapid tab creations
    debounceRefreshTimers();
  } catch (error) {
    console.warn('Failed to handle tab creation:', error);
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
    // Wait a bit for browser to stabilize
    setTimeout(async () => {
      await initializeTimers();
    }, 2000);
  } catch (error) {
    console.error('Error during startup:', error);
  }
});

BrowserAPI.runtime.onInstalled.addListener(async function (details: chrome.runtime.InstalledDetails) {
  try {
    if (details.reason === 'install' || details.reason === 'update') {
      // Initialize timers after install/update
      setTimeout(async () => {
        await initializeTimers();
      }, 1000);
    }
  } catch (error) {
    console.error('Error during install/update:', error);
  }
});

// Initialize timers when script loads
initializeTimers().catch(error => {
  console.error('Error during initial timer setup:', error);
});
