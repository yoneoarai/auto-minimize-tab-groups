// Helper function to minimize a tab group by its groupId
function minimizeTabGroup(groupId) {
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
            var windowId = tabs[0].windowId; // Assuming all tabs belong to the same window
            chrome.tabGroups.query({ windowId: windowId }, function (groups) {
                var _loop_1 = function (group) {
                    var groupId = group.id;
                    if (groupId !== activeGroupId &&
                        !newlyOpenedGroupIds.includes(groupId)) {
                        chrome.tabs.query({ groupId: groupId }, function (groupTabs) {
                            var activeTabIds = groupTabs
                                .filter(function (tab) { return tab.active; })
                                .map(function (tab) { return tab.id; });
                            if (activeTabIds.length === 0) {
                                minimizeTabGroup(groupId);
                            }
                        });
                    }
                };
                for (var _i = 0, groups_1 = groups; _i < groups_1.length; _i++) {
                    var group = groups_1[_i];
                    _loop_1(group);
                }
            });
        });
        // Clear newly opened group IDs
        newlyOpenedGroupIds = [];
    }, 30000);
}
// Store active tab group ID and newly opened group IDs without an active tab
var activeGroupId = null;
var newlyOpenedGroupIds = [];
var intervalId = null;
// Starts the interval if its not already running
if (intervalId === null) {
    setTabGroupInterval();
}
// Event listener for tab updates
chrome.tabs.onActivated.addListener(function (activeInfo) {
    clearIntervalFunction();
    var tabId = activeInfo.tabId;
    chrome.tabs.get(tabId, function (tab) {
        var groupId = tab.groupId;
        if (groupId !== -1) {
            if (tab.active) {
                activeGroupId = groupId;
            }
        }
        else {
            activeGroupId = null;
        }
    });
    setTabGroupInterval();
});
// Event listener for tab creation
chrome.tabs.onCreated.addListener(function (tab) {
    clearIntervalFunction();
    var groupId = tab.groupId;
    if (groupId !== -1 &&
        activeGroupId === null &&
        !newlyOpenedGroupIds.includes(groupId)) {
        newlyOpenedGroupIds.push(groupId);
    }
    setTabGroupInterval();
});
// Event listener for new tab creation via link
chrome.tabs.onCreated.addListener(function (tab) {
    clearIntervalFunction();
    if (newlyOpenedGroupIds.length === 0 && tab.openerTabId !== undefined) {
        chrome.tabs.get(tab.openerTabId, function (openerTab) {
            var openerGroupId = openerTab.groupId;
            if (openerGroupId !== -1 &&
                !newlyOpenedGroupIds.includes(openerGroupId)) {
                newlyOpenedGroupIds.push(openerGroupId);
            }
        });
    }
    setTabGroupInterval();
});
// Event listener for tab group activation
chrome.tabGroups.onUpdated.addListener(function (activeInfo) {
    clearIntervalFunction();
    var groupId = activeInfo.id;
    if (groupId !== -1) {
        newlyOpenedGroupIds.push(groupId);
    }
    setTabGroupInterval();
});
// Event listener to minimize groups on Chrome startup
chrome.runtime.onStartup.addListener(function () {
    chrome.tabs.query({}, function (tabs) {
        for (var _i = 0, tabs_1 = tabs; _i < tabs_1.length; _i++) {
            var tab = tabs_1[_i];
            var windowId = tab.windowId;
            chrome.tabGroups.query({ windowId: windowId }, function (groups) {
                for (var _i = 0, groups_2 = groups; _i < groups_2.length; _i++) {
                    var group = groups_2[_i];
                    var groupId = group.id;
                    minimizeTabGroup(groupId);
                }
            });
        }
    });
});
