import { BrowserAPI } from './browser-api';

/**
 * Global timeout value in milliseconds.
 */
let globalTimeout: number = 30000;

/**
 * Listens for changes in storage and updates the globalTimeout variable if the "timeout" key is changed.
 * @param changes - The changes object containing the updated values.
 */
BrowserAPI.storage.onChanged.addListener(function (changes: {[key: string]: chrome.storage.StorageChange}) {
  try {
    for (let key in changes) {
      if (key === "timeout") {
        const newValue = changes[key].newValue;
        globalTimeout = validateTimeout(newValue);
        console.log(`Timeout updated to: ${globalTimeout}ms`);
        
        // Restart interval with new timeout
        clearIntervalFunction();
        setTabGroupInterval();
      }
    }
  } catch (error) {
    console.error('Error handling storage change:', error);
  }
});

/**
 * Retrieves the timeout value from storage and initializes the globalTimeout variable.
 */
BrowserAPI.storageGet(["timeout"]).then((result) => {
  console.log("Value currently is " + result.timeout);
  globalTimeout = validateTimeout(result.timeout);
}).catch((error) => {
  console.error('Error loading timeout from storage:', error);
  globalTimeout = 30000; // Use default on error
});

/**
 * Validates the timeout value and returns a number.
 * If the timeout value is not a valid number or less than or equal to 0, the default timeout value of 30000 is returned.
 * @param timeout - The timeout value to validate.
 * @returns The validated timeout value.
 */
function validateTimeout(timeout: any): number {
  const parsedTimeout = parseInt(timeout);
  if (isNaN(parsedTimeout) || parsedTimeout <= 0) {
    return 30000; // Set default timeout to 30000
  }
  return parsedTimeout;
}

/**
 * Helper function to minimize a tab group by its groupId.
 * @param groupId - The ID of the tab group to minimize.
 */
function minimizeTabGroup(groupId: number) {
  BrowserAPI.tabGroups.update(groupId, { collapsed: true });
}

/**
 * Helper function to clear the interval function.
 */
function clearIntervalFunction() {
  if (intervalId !== null) {
    clearInterval(intervalId);
  }
}

/**
 * Helper function to set the interval function.
 * Now properly handles multiple windows and includes better error handling.
 */
async function setTabGroupInterval() {
  intervalId = setInterval(async function () {
    try {
      // Get all windows to handle multi-window scenarios properly
      const windows = await BrowserAPI.windowsGetAll({ populate: true });
      
      // Process each window separately
      for (const window of windows) {
        if (!window.id) continue;
        
        try {
          const groups = await BrowserAPI.tabGroupsQuery({ windowId: window.id });
          
          for (const group of groups) {
            const groupId = group.id;
            if (
              groupId !== activeGroupId &&
              !newlyOpenedGroupIds.has(groupId) &&
              !group.collapsed // Don't process already collapsed groups
            ) {
              try {
                const groupTabs = await BrowserAPI.tabsQuery({ groupId: groupId });
                
                // Check if any tab in the group is active
                const hasActiveTabs = groupTabs.some(tab => tab.active);
                if (!hasActiveTabs && groupTabs.length > 0) {
                  minimizeTabGroup(groupId);
                }
              } catch (error) {
                console.warn('Failed to get tabs for group:', error);
              }
            }
          }
        } catch (error) {
          console.warn('Failed to get tab groups for window:', error);
        }
      }

      // Clear newly opened group IDs and run cleanup
      newlyOpenedGroupIds.clear();
      await cleanupState();
    } catch (error) {
      console.error('Error in tab group interval:', error);
    }
  }, globalTimeout);
}

/**
 * Stores the active tab group ID and newly opened group IDs without an active tab.
 */
let activeGroupId: number | null = null;
let newlyOpenedGroupIds: Set<number> = new Set();
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Clean up state for removed tabs/groups
 */
async function cleanupState() {
  // Clear newly opened groups that no longer exist or have been processed
  const groupsToRemove = new Set<number>();
  
  for (const groupId of newlyOpenedGroupIds) {
    try {
      await BrowserAPI.tabGroupsGet(groupId);
    } catch (error) {
      // Group doesn't exist anymore
      groupsToRemove.add(groupId);
    }
  }
  
  // Remove non-existent groups
  groupsToRemove.forEach(groupId => newlyOpenedGroupIds.delete(groupId));
}

// Starts the interval if its not already running
if (intervalId === null) {
  setTabGroupInterval();
}

/**
 * Event listener for tab updates.
 * Clears the interval function, updates the activeGroupId, and sets the tab group interval.
 * @param activeInfo - Information about the activated tab.
 */
BrowserAPI.tabs.onActivated.addListener(async function (activeInfo: chrome.tabs.TabActiveInfo) {
  clearIntervalFunction();
  const tabId = activeInfo.tabId;
  
  try {
    const tab = await BrowserAPI.tabsGet(tabId);
    const groupId = tab.groupId;
    if (groupId !== -1) {
      if (tab.active) {
        activeGroupId = groupId;
      }
    } else {
      activeGroupId = null;
    }
  } catch (error) {
    console.warn('Failed to get tab info:', error);
  }
  
  setTabGroupInterval();
});

/**
 * Event listener for tab creation.
 * Handles both direct tab creation and tab creation via links.
 * Clears the interval function, updates the newlyOpenedGroupIds, and sets the tab group interval.
 * @param tab - The newly created tab.
 */
BrowserAPI.tabs.onCreated.addListener(async function (tab: chrome.tabs.Tab) {
  clearIntervalFunction();
  
  const groupId = tab.groupId;
  
  // Handle direct tab creation in a group
  if (
    groupId !== -1 &&
    activeGroupId !== groupId &&
    !newlyOpenedGroupIds.has(groupId)
  ) {
    newlyOpenedGroupIds.add(groupId);
  }
  
  // Handle tab creation via link (opener tab)
  if (tab.openerTabId !== undefined) {
    try {
      const openerTab = await BrowserAPI.tabsGet(tab.openerTabId);
      const openerGroupId = openerTab.groupId;
      if (
        openerGroupId !== -1 &&
        openerGroupId !== activeGroupId &&
        !newlyOpenedGroupIds.has(openerGroupId)
      ) {
        newlyOpenedGroupIds.add(openerGroupId);
      }
    } catch (error) {
      console.warn('Failed to get opener tab:', error);
    }
  }
  
  setTabGroupInterval();
});

/**
 * Event listener for tab group activation.
 * Clears the interval function, updates the newlyOpenedGroupIds, and sets the tab group interval.
 * @param activeInfo - Information about the updated tab group.
 */
BrowserAPI.tabGroups.onUpdated.addListener(function (activeInfo: chrome.tabGroups.TabGroup) {
  clearIntervalFunction();
  const groupId = activeInfo.id;
  if (groupId !== -1) {
    newlyOpenedGroupIds.add(groupId);
  }
  setTabGroupInterval();
});

/**
 * Event listener to minimize groups on startup.
 */
BrowserAPI.runtime.onStartup.addListener(async function () {
  setTimeout(async function () {
    try {
      const tabs = await BrowserAPI.tabsQuery({});
      const windowIds = [...new Set(tabs.map(tab => tab.windowId))];
      
      for (const windowId of windowIds) {
        if (windowId) {
          const groups = await BrowserAPI.tabGroupsQuery({ windowId: windowId });
          for (const group of groups) {
            const groupId = group.id;
            minimizeTabGroup(groupId);
          }
        }
      }
    } catch (error) {
      console.error('Error minimizing groups on startup:', error);
    }
  }, 5000); // Wait for 5 seconds before minimizing tabs
});
