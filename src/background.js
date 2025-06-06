// Stores the ID of the extension window
import './debug.js';
let windowId = null;

// Minimum size of the extension window
const MIN_WIDTH = 800;
const MIN_HEIGHT = 680;

/**
 * LISTENER - Activation of the service worker.
 * This listener is necessary for handling background tasks and maintaining the extension's state.
 */
self.addEventListener('activate', () => {
  console.log('[Background] Service worker activated');
});

/**
 * LISTENER - Tracks tab activation to record last active tabs.
 * Updates the activation timestamp for the newly active tab in local storage.
 * @param {object} activeInfo - Information about the tab that was activated.
 * @param {number} activeInfo.tabId - The ID of the tab that became active.
 */
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

/**
 * LISTENER - Cleans up data when tabs are removed.
 * Removes stored tab activation times for the closed tab from local storage.
 * @param {number} tabId - The ID of the tab that was removed.
 */
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

/**
 * LISTENER - Listens for changes to the tab tracking setting.
 * Logs changes to the `areTabsRecentlyUpdated` setting in local storage.
 * @param {object} changes - An object detailing the changes.
 * @param {string} area - The storage area ("sync", "local", or "managed") the changes happened in.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.areTabsRecentlyUpdated) {
    console.log('[Background] Tab tracking setting changed:',
      changes.areTabsRecentlyUpdated.oldValue, '→',
      changes.areTabsRecentlyUpdated.newValue);
  }
});

/**
 * LISTENER - Handles the click event on the extension icon.
 * When the icon is clicked, it checks if the extension window already exists.
 * If it does, the existing window is focused and its size is adjusted to minimums.
 * If not, a new popup window is created with `src/window.html`.
 * It also sets up listeners for window removal and bounds changes to manage the window state.
 */
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

    /**
     * LISTENER - Resets the stored windowId when the extension window is closed.
     * @param {number} closedWindowId - The ID of the window that was closed.
     */
    chrome.windows.onRemoved.addListener((closedWindowId) => {
      if (closedWindowId === windowId) {
        windowId = null;
      }
    });

    /**
     * LISTENER - Checks and corrects the extension window size if it falls below minimums.
     * This listener is triggered when the extension window's bounds change.
     * @param {object} changedWindow - The window object with updated bounds.
     * @param {number} changedWindow.id - The ID of the changed window.
     * @param {number} changedWindow.width - The new width of the window.
     * @param {number} changedWindow.height - The new height of the window.
     */
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