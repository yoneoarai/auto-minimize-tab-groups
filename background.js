// Helper function to minimize a tab group by its groupId
function minimizeTabGroup(groupId) {
    chrome.tabGroups.update(groupId, { collapsed: true });
}
// Store active tab group ID and newly opened group IDs without an active tab
var activeGroupId = null;
var newlyOpenedGroupIds = [];
// Event listener for tab updates
chrome.tabs.onActivated.addListener(function (activeInfo) {
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
});
// Event listener for tab creation
chrome.tabs.onCreated.addListener(function (tab) {
    var groupId = tab.groupId;
    if (groupId !== -1 &&
        activeGroupId === null &&
        !newlyOpenedGroupIds.includes(groupId)) {
        newlyOpenedGroupIds.push(groupId);
    }
});
// Event listener for new tab creation via link
chrome.tabs.onCreated.addListener(function (tab) {
    if (newlyOpenedGroupIds.length === 0) {
        chrome.tabs.get(tab.openerTabId, function (openerTab) {
            var openerGroupId = openerTab.groupId;
            if (openerGroupId !== -1 &&
                !newlyOpenedGroupIds.includes(openerGroupId)) {
                newlyOpenedGroupIds.push(openerGroupId);
            }
        });
    }
});
// Interval function to close inactive tab groups
setInterval(function () {
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
}, 5000);
