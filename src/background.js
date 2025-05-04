// Stores the ID of the extension window
let windowId = null;

// Minimum size of the extension window
const MIN_WIDTH = 800;
const MIN_HEIGHT = 680;

// Activation of the service worker. We need it for handling background tasks and maintaining state.
self.addEventListener('activate', () => {
  console.log('[Background] Service worker activated');
});

// Track tab activation to record last active tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log('[Background] Tab activated:', activeInfo.tabId);

  // Get saved activation times
  const { tabActivationTimes = {} } = await chrome.storage.local.get("tabActivationTimes");

  // Update time for current tab
  tabActivationTimes[activeInfo.tabId] = Date.now();

  // Save updated data
  await chrome.storage.local.set({
    tabActivationTimes: tabActivationTimes
  });
});

// Clean up data when tabs are removed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  console.log('[Background] Tab removed:', tabId);

  // Get saved data
  const { tabActivationTimes = {} } = await chrome.storage.local.get("tabActivationTimes");

  // Remove data for this tab
  if (tabActivationTimes[tabId]) {
    delete tabActivationTimes[tabId];

    // Save updated data
    await chrome.storage.local.set({
      tabActivationTimes: tabActivationTimes
    });
  }
});

// Listen for changes to the tracking setting
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.areTabsRecentlyUpdated) {
    console.log('[Background] Tab tracking setting changed:',
      changes.areTabsRecentlyUpdated.oldValue, '→',
      changes.areTabsRecentlyUpdated.newValue);
  }
});

// Handling the click event on the extension icon
//TODO - FIX
chrome.action.onClicked.addListener(async () => {
  console.log('[Background] Extension icon clicked');
  try {
    // Check if the window exists
    if (windowId) {
      const window = await chrome.windows.get(windowId).catch(() => null);
      if (window) {
        // If the window exists - bring it to the front
        await chrome.windows.update(windowId, {
          focused: true,
          width: Math.max(window.width, MIN_WIDTH),
          height: Math.max(window.height, MIN_HEIGHT),
          state: 'normal'
        });
        return;
      }
    }

    // Create a new popup window
    const window = await chrome.windows.create({
      url: 'src/window.html',
      type: 'popup',
      width: MIN_WIDTH,
      height: MIN_HEIGHT,
      focused: true
    });

    // Save the new window ID
    windowId = window.id;

    // If the window is closed - reset the windowId
    chrome.windows.onRemoved.addListener((closedWindowId) => {
      if (closedWindowId === windowId) {
        windowId = null;
      }
    });

    // If the window size is changed - check and correct it if it is less than the minimum
    //TODO - FIX
    chrome.windows.onBoundsChanged.addListener((changedWindow) => {
      if (changedWindow.id === windowId) {
        // Check if the width or height is less than the minimum
        if (changedWindow.width < MIN_WIDTH || changedWindow.height < MIN_HEIGHT) {
          chrome.windows.update(windowId, {
            width: Math.max(changedWindow.width, MIN_WIDTH),
            height: Math.max(changedWindow.height, MIN_HEIGHT)
          });
        }
      }
    });

  } catch (error) {
    console.error('[Background] Error:', error);
  }
});