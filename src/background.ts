/**
 * Global timeout value in milliseconds.
 */
let globalTimeout: number = 30000;

/**
 * Listens for changes in Chrome storage and updates the globalTimeout variable if the "timeout" key is changed.
 * @param changes - The changes object containing the updated values.
 */
chrome.storage.onChanged.addListener(function (changes) {
  for (let key in changes) {
    if (key === "timeout") {
      globalTimeout = validateTimeout(changes[key].newValue);
    }
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
 */
function setTabGroupInterval() {
  intervalId = setInterval(function () {
    chrome.tabs.query({}, function (tabs) {
      if (tabs[0]) {
        const windowId = tabs[0].windowId; // Assuming all tabs belong to the same window
        chrome.tabGroups.query({ windowId: windowId }, function (groups) {
          for (const group of groups) {
            const groupId = group.id;
            if (
              groupId !== activeGroupId &&
              !newlyOpenedGroupIds.includes(groupId)
            ) {
              chrome.tabs.query({ groupId: groupId }, function (groupTabs) {
                const activeTabIds = groupTabs
                  .filter((tab) => tab.active)
                  .map((tab) => tab.id);
                if (activeTabIds.length === 0) {
                  minimizeTabGroup(groupId);
                }
              });
            }
          }
        });
      }
    });

    // Clear newly opened group IDs
    newlyOpenedGroupIds = [];
  }, globalTimeout);
}

/**
 * Stores the active tab group ID and newly opened group IDs without an active tab.
 */
let activeGroupId: number | null = null;
let newlyOpenedGroupIds: number[] = [];
let intervalId: ReturnType<typeof setInterval> | null = null;

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
 * Clears the interval function, updates the newlyOpenedGroupIds, and sets the tab group interval.
 * @param tab - The newly created tab.
 */
chrome.tabs.onCreated.addListener(function (tab) {
  clearIntervalFunction();
  const groupId = tab.groupId;
  if (
    groupId !== -1 &&
    activeGroupId === null &&
    !newlyOpenedGroupIds.includes(groupId)
  ) {
    newlyOpenedGroupIds.push(groupId);
  }
  setTabGroupInterval();
});

/**
 * Event listener for new tab creation via link.
 * Clears the interval function, updates the newlyOpenedGroupIds, and sets the tab group interval.
 * @param tab - The newly created tab.
 */
chrome.tabs.onCreated.addListener(function (tab) {
  clearIntervalFunction();
  if (newlyOpenedGroupIds.length === 0 && tab.openerTabId !== undefined) {
    chrome.tabs.get(tab.openerTabId, function (openerTab) {
      const openerGroupId = openerTab.groupId;
      if (
        openerGroupId !== -1 &&
        !newlyOpenedGroupIds.includes(openerGroupId)
      ) {
        newlyOpenedGroupIds.push(openerGroupId);
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
    newlyOpenedGroupIds.push(groupId);
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
