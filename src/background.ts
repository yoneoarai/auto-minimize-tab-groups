/// <reference types="chrome"/>

/**
 * Global timeout value in milliseconds.
 */
let globalTimeout: number = 30000;

/**
 * Listens for changes in Chrome storage and updates the globalTimeout variable if the "timeout" key is changed.
 * @param changes - The changes object containing the updated values.
 */
chrome.storage.onChanged.addListener(function (changes) {
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
 * Retrieves the timeout value from Chrome storage and initializes the globalTimeout variable.
 * @param result - The result object containing the timeout value.
 */
chrome.storage.sync.get(["timeout"], function (result) {
  console.log("Value currently is " + result.timeout);

  globalTimeout = validateTimeout(result.timeout);
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
  chrome.tabGroups.update(groupId, { collapsed: true });
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
function setTabGroupInterval() {
  intervalId = setInterval(function () {
    try {
      // Get all windows to handle multi-window scenarios properly
      chrome.windows.getAll({ populate: true }, function (windows) {
        if (chrome.runtime.lastError) {
          console.warn('Failed to get windows:', chrome.runtime.lastError.message);
          return;
        }

        // Process each window separately
        windows.forEach(window => {
          if (!window.id) return;
          
          chrome.tabGroups.query({ windowId: window.id }, function (groups) {
            if (chrome.runtime.lastError) {
              console.warn('Failed to get tab groups for window:', chrome.runtime.lastError.message);
              return;
            }

            groups.forEach(group => {
              const groupId = group.id;
              if (
                groupId !== activeGroupId &&
                !newlyOpenedGroupIds.has(groupId) &&
                !group.collapsed // Don't process already collapsed groups
              ) {
                chrome.tabs.query({ groupId: groupId }, function (groupTabs) {
                  if (chrome.runtime.lastError) {
                    console.warn('Failed to get tabs for group:', chrome.runtime.lastError.message);
                    return;
                  }

                  // Check if any tab in the group is active
                  const hasActiveTabs = groupTabs.some(tab => tab.active);
                  if (!hasActiveTabs && groupTabs.length > 0) {
                    minimizeTabGroup(groupId);
                  }
                });
              }
            });
          });
        });

        // Clear newly opened group IDs and run cleanup
        newlyOpenedGroupIds.clear();
        cleanupState();
      });
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
function cleanupState() {
  // Clear newly opened groups that no longer exist or have been processed
  const groupsToRemove = new Set<number>();
  
  newlyOpenedGroupIds.forEach(groupId => {
    chrome.tabGroups.get(groupId, (group) => {
      if (chrome.runtime.lastError || !group) {
        groupsToRemove.add(groupId);
      }
    });
  });
  
  // Remove non-existent groups after a small delay
  setTimeout(() => {
    groupsToRemove.forEach(groupId => newlyOpenedGroupIds.delete(groupId));
  }, 100);
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
chrome.tabs.onActivated.addListener(function (activeInfo) {
  clearIntervalFunction();
  const tabId = activeInfo.tabId;
  chrome.tabs.get(tabId, function (tab) {
    const groupId = tab.groupId;
    if (groupId !== -1) {
      if (tab.active) {
        activeGroupId = groupId;
      }
    } else {
      activeGroupId = null;
    }
  });
  setTabGroupInterval();
});

/**
 * Event listener for tab creation.
 * Handles both direct tab creation and tab creation via links.
 * Clears the interval function, updates the newlyOpenedGroupIds, and sets the tab group interval.
 * @param tab - The newly created tab.
 */
chrome.tabs.onCreated.addListener(function (tab) {
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
    chrome.tabs.get(tab.openerTabId, function (openerTab) {
      if (chrome.runtime.lastError) {
        console.warn('Failed to get opener tab:', chrome.runtime.lastError.message);
        return;
      }
      
      const openerGroupId = openerTab.groupId;
      if (
        openerGroupId !== -1 &&
        openerGroupId !== activeGroupId &&
        !newlyOpenedGroupIds.has(openerGroupId)
      ) {
        newlyOpenedGroupIds.add(openerGroupId);
      }
    });
  }
  
  setTabGroupInterval();
});

/**
 * Event listener for tab group activation.
 * Clears the interval function, updates the newlyOpenedGroupIds, and sets the tab group interval.
 * @param activeInfo - Information about the updated tab group.
 */
chrome.tabGroups.onUpdated.addListener(function (activeInfo) {
  clearIntervalFunction();
  const groupId = activeInfo.id;
  if (groupId !== -1) {
    newlyOpenedGroupIds.add(groupId);
  }
  setTabGroupInterval();
});

/**
 * Event listener to minimize groups on Chrome startup.
 */
chrome.runtime.onStartup.addListener(function () {
  setTimeout(function () {
    chrome.tabs.query({}, function (tabs) {
      for (const tab of tabs) {
        const windowId = tab.windowId;
        chrome.tabGroups.query({ windowId: windowId }, function (groups) {
          for (const group of groups) {
            const groupId = group.id;
            minimizeTabGroup(groupId);
          }
        });
      }
    });
  }, 5000); // Wait for 5 seconds before minimizing tabs
});
