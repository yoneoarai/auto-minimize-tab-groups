// Helper function to minimize a tab group by its groupId
function minimizeTabGroup(groupId: number) {
  chrome.tabGroups.update(groupId, { collapsed: true });
}

// Helper function to clear the interval function
function clearIntervalFunction() {
  if (intervalId !== null) {
    clearInterval(intervalId);
  }
}

// Helper function to set the interval function
function setTabGroupInterval() {
  intervalId = setInterval(function () {
    chrome.tabs.query({}, function (tabs) {
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
    });

    // Clear newly opened group IDs
    newlyOpenedGroupIds = [];
  }, 5000);
}

// Store active tab group ID and newly opened group IDs without an active tab
let activeGroupId: number | null = null;
let newlyOpenedGroupIds: number[] = [];
let intervalId: ReturnType<typeof setInterval> | null = null;

// Starts the interval if its not already running
if (intervalId === null) {
  setTabGroupInterval();
}

// Event listener for tab updates
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

// Event listener for tab creation
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

// Event listener for new tab creation via link
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

// Event listener for tab group activation
chrome.tabGroups.onUpdated.addListener(function (activeInfo) {
  clearIntervalFunction()
  const groupId = activeInfo.id
  if (groupId !== -1) {
    newlyOpenedGroupIds.push(groupId);
  }
  setTabGroupInterval()
})