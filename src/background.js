/**
 * @file background.js
 * This file is initialized by browser when the extension is loaded.
 * Uses Service Worker Api instead of background page - required for Manifest V3 extension. It constantly runs in the background, listening for events that we added listeners for {@link https://developer.mozilla.org/docs/Web/API/Service_Worker_API}.
 * - Handles service worker activation to maintain the extension's state @see handleServiceWorkerActivate
 * - Handles extension icon clicks to open or focus the extension window @see handleExtensionIconClick
 * - Handles tab activation to track last active tabs, nessesary for "Display tabs in activation order" setting @see handleTabActivated @see handleTabRemoved @see handleStorageChanged
 */

// Stores the ID of the extension window
import './debug.js';
let windowId = null;

// Minimum size of the extension window
const MIN_WIDTH = 800;
const MIN_HEIGHT = 680;

/**
 * FUNC - Handles activation of the service worker.
 * This function is necessary for handling background tasks and maintaining the extension's state.
 */
function handleServiceWorkerActivate() {
  console.log('[Background] Service worker activated');
}

self.addEventListener('activate', handleServiceWorkerActivate);

// SECTION - Extension Window Opening Handling
/**
 * FUNC - Handles the click event on the extension icon.
 * When the icon is clicked, it checks if the extension window already exists.
 * If it does, the existing window is focused and its size is adjusted to minimums.
 * If not, a new popup window is created with `src/window.html`.
 * It also sets up listeners for window removal and bounds changes to manage the window state.
 */
async function handleExtensionIconClick() {
  console.log('[Background] Extension icon clicked');
  try {
    // Check if the window exists
    if (windowId) {
      let window = null;
      try {
        window = await chrome.windows.get(windowId);
      } catch (error) {
        console.warn('[Background] Existing window with ID', windowId, 'not found or accessible, creating new. Error:', error);
        windowId = null; // Reset windowId if not found
      }

      if (window) {
        // If the window exists - bring it to the front
        try {
          await chrome.windows.update(windowId, {
            focused: true,
            width: Math.max(window.width, MIN_WIDTH),
            height: Math.max(window.height, MIN_HEIGHT),
            state: 'normal'
          });
          console.log('[Background] Existing window focused and resized.');
          return;
        } catch (updateError) {
          console.error('[Background] Error updating existing window', windowId, ':', updateError);
          windowId = null; // Reset if update fails
        }
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
     * FUNC - Resets the stored windowId when the extension window is closed.
     * @param {number} closedWindowId - The ID of the window that was closed.
     */
    function handleWindowRemoved(closedWindowId) {
      if (closedWindowId === windowId) {
        windowId = null;
      }
    }
    chrome.windows.onRemoved.addListener(handleWindowRemoved);

    /**
     * FUNC - Checks and corrects the extension window size if it falls below minimums.
     * This function is triggered when the extension window's bounds change.
     * @param {object} changedWindow - The window object with updated bounds.
     * @param {number} changedWindow.id - The ID of the changed window.
     * @param {number} changedWindow.width - The new width of the window.
     * @param {number} changedWindow.height - The new height of the window.
     */
    function handleWindowBoundsChanged(changedWindow) {
      if (changedWindow.id === windowId) {
        // Check if the width or height is less than the minimum
        if (changedWindow.width < MIN_WIDTH || changedWindow.height < MIN_HEIGHT) {
          try {
            chrome.windows.update(windowId, {
              width: Math.max(changedWindow.width, MIN_WIDTH),
              height: Math.max(changedWindow.height, MIN_HEIGHT)
            });
            console.log('[Background] Window resized to minimums.');
          } catch (error) {
            console.error('[Background] Error resizing window', windowId, ':', error);
          }
        }
      }
    }
    chrome.windows.onBoundsChanged.addListener(handleWindowBoundsChanged);

  } catch (error) {
    console.error('[Background] Error:', error);
  }
}
chrome.action.onClicked.addListener(handleExtensionIconClick);
// !SECTION - Extension Window Opening Handling

// SECTION - Tab Activation Tracking (For "Display tabs in activation order" setting)
/**
 * FUNC - Tracks tab activation to record last active tabs.
 * Updates the activation timestamp for the newly active tab in local storage.
 * @param {object} activeInfo - Information about the tab that was activated.
 * @param {number} activeInfo.tabId - The ID of the tab that became active.
 */
async function handleTabActivated(activeInfo) {
  console.log('[Background] Tab activated:', activeInfo.tabId);
  try {
    // Get saved activation times
    const { tabActivationTimes = {} } = await chrome.storage.local.get("tabActivationTimes");

    // Update time for current tab
    tabActivationTimes[activeInfo.tabId] = Date.now();

    // Save updated data
    await chrome.storage.local.set({ tabActivationTimes: tabActivationTimes });
    console.log('[Background] Tab activation time saved for:', activeInfo.tabId);
  } catch (error) {
    console.error('[Background] Error updating tab activation time for tab', activeInfo.tabId, ':', error);
  }
}

chrome.tabs.onActivated.addListener(handleTabActivated);

/**
 * FUNC - Cleans up data when tabs are removed.
 * Removes stored tab activation times for the closed tab from local storage.
 * @param {number} tabId - The ID of the tab that was removed.
 */
async function handleTabRemoved(tabId) {
  console.log('[Background] Tab removed:', tabId);
  try {
    // Get saved data
    const { tabActivationTimes = {} } = await chrome.storage.local.get("tabActivationTimes");

    // Remove data for this tab
    if (tabActivationTimes[tabId]) {
      delete tabActivationTimes[tabId];

      // Save updated data
      await chrome.storage.local.set({ tabActivationTimes: tabActivationTimes });
      console.log('[Background] Tab activation time removed for:', tabId);
    }
  } catch (error) {
    console.error('[Background] Error cleaning up tab data for tab', tabId, ':', error);
  }
}

chrome.tabs.onRemoved.addListener(handleTabRemoved);

/**
 * FUNC - Listens for changes to the tab tracking setting.
 * Logs changes to the `areTabsRecentlyUpdated` setting in local storage.
 * @param {object} changes - An object detailing the changes.
 * @param {string} area - The storage area ("sync", "local", or "managed") the changes happened in.
 */
function handleStorageChanged(changes, area) {
  if (area === 'local' && changes.areTabsRecentlyUpdated) {
    console.log('[Background] Tab tracking setting changed:',
      changes.areTabsRecentlyUpdated.oldValue, '→',
      changes.areTabsRecentlyUpdated.newValue);
  }
}

chrome.storage.onChanged.addListener(handleStorageChanged);
// !SECTION - Tab Activation Tracking (For "Display tabs in activation order" setting)