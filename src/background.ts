// Helper function to minimize a tab group by its groupId
function minimizeTabGroup(groupId: number) {
  chrome.tabGroups.update(groupId, { collapsed: true })
}

// Store active tab group ID and newly opened group IDs without an active tab
let activeGroupId: number | null = null
let newlyOpenedGroupIds: number[] = []

// Event listener for tab updates
chrome.tabs.onActivated.addListener(function (activeInfo) {
  const tabId = activeInfo.tabId
  chrome.tabs.get(tabId, function (tab) {
    const groupId = tab.groupId
    if (groupId !== -1) {
      if (tab.active) {
        activeGroupId = groupId
      }
    } else {
      activeGroupId = null
    }
  })
})

// Event listener for tab creation
chrome.tabs.onCreated.addListener(function (tab) {
  const groupId = tab.groupId
  if (
    groupId !== -1 &&
    activeGroupId === null &&
    !newlyOpenedGroupIds.includes(groupId)
  ) {
    newlyOpenedGroupIds.push(groupId)
  }
})

// Event listener for new tab creation via link
chrome.tabs.onCreated.addListener(function (tab) {
  if (newlyOpenedGroupIds.length === 0) {
    chrome.tabs.get(tab.openerTabId, function (openerTab) {
      const openerGroupId = openerTab.groupId
      if (
        openerGroupId !== -1 &&
        !newlyOpenedGroupIds.includes(openerGroupId)
      ) {
        newlyOpenedGroupIds.push(openerGroupId)
      }
    })
  }
})

// Interval function to close inactive tab groups
setInterval(function () {
  chrome.tabs.query({}, function (tabs) {
    const windowId = tabs[0].windowId // Assuming all tabs belong to the same window
    chrome.tabGroups.query({ windowId: windowId }, function (groups) {
      for (const group of groups) {
        const groupId = group.id
        if (
          groupId !== activeGroupId &&
          !newlyOpenedGroupIds.includes(groupId)
        ) {
          chrome.tabs.query({ groupId: groupId }, function (groupTabs) {
            const activeTabIds = groupTabs
              .filter(tab => tab.active)
              .map(tab => tab.id)
            if (activeTabIds.length === 0) {
              minimizeTabGroup(groupId)
            }
          })
        }
      }
    })
  })

  // Clear newly opened group IDs
  newlyOpenedGroupIds = []
}, 5000)
