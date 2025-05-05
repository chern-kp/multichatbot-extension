console.log("[Window Script]: Window script loaded");

//NOTE - List of supported sites
const SUPPORTED_SITES = [
    "gemini.google.com",
    "google.com",
    "chatgpt.com",
    "claude.ai",
    "apps.abacus.ai",
    "chat.deepseek.com",
    "huggingface.co/chat",
    "perplexity.ai",
    "poe.com",
];

// Storage for latest tab activation times
// Global variable for storing tab activation times
let tabActivationTimes = {};

// Maximum number of history items to keep
const MAX_HISTORY_ITEMS = 100;

// Default sort direction - descending
let sortDirection = "desc";

// Variables for right panel
let isRightPanelVisible = false; // Viability of the right panel
let activeButton = null;
let currentPanel = null;

// Initialize the list of tabs
let tabsListElement;

// Helper function for initializing tab data
async function initializeTabData() {
    console.log("[Window Script]: Initializing tab data");

    try {
        // Get list of all tabs
        const tabs = await chrome.tabs.query({});
        console.log("[Window Script]: Found", tabs.length, "tabs");

        // Get saved activation times
        const { tabActivationTimes: savedTimes = {} } =
            await chrome.storage.local.get("tabActivationTimes");
        console.log(
            "[Window Script]: Loaded activation times:",
            Object.keys(savedTimes).length
        );

        // Update global variable with data from storage
        tabActivationTimes = savedTimes;

        // Clean up data for non-existent tabs
        let hasChanges = false;
        const validTabIds = new Set(tabs.map((tab) => tab.id));

        for (const tabId in tabActivationTimes) {
            if (!validTabIds.has(Number(tabId))) {
                console.log(
                    "[Window Script]: Removing stale tab data for",
                    tabId
                );
                delete tabActivationTimes[tabId];
                hasChanges = true;
            }
        }

        // Assign a very old timestamp (0) for tabs that don't have activation times
        // This ensures they appear at the end when sorting by most recent (desc)
        tabs.forEach((tab) => {
            if (!(tab.id in tabActivationTimes)) { // Check if the key exists
                console.log(
                    "[Window Script]: Assigning default (old) activation time for tab",
                    tab.id
                );
                tabActivationTimes[tab.id] = 0; // Assign 0 instead of Date.now()
                hasChanges = true;
            }
        });

        // Save changes if needed
        if (hasChanges) {
            console.log("[Window Script]: Saving updated activation times");
            await chrome.storage.local.set({ tabActivationTimes });
        }

        console.log("[Window Script]: Tab data initialization complete");
        return tabActivationTimes;
    } catch (error) {
        console.error("[Window Script]: Error initializing tab data:", error);
        return {};
    }
}

// NOTE - Event listener for the DOMContentLoaded event.
// We use this event to ensure that the DOM is fully loaded before we start interacting with it.
document.addEventListener("DOMContentLoaded", async function () {
    console.log("[Window Script]: DOMContentLoaded event fired");

    tabsListElement = document.getElementById("tabsList");
    console.log("[Window Script]: Tabs list element:", tabsListElement);

    const sendButton = document.getElementById("sendButton");
    console.log("[Window Script]: Send button element:", sendButton);

    const inputText = document.getElementById("inputText");
    console.log("[Window Script]: Input text element:", inputText);

    const savePromptButton = document.getElementById("savePromptButton");
    const sortButton = document.querySelector(".sort-button");

    // SECTION - Tabs in DOMContentLoaded event

    // Load settings and initialize tab data
    const { areTabsRecentlyUpdated = false, savedSortDirection = "desc" } =
        await chrome.storage.local.get([
            "areTabsRecentlyUpdated",
            "savedSortDirection",
        ]);

    // Apply sort direction from storage
    if (savedSortDirection) {
        sortDirection = savedSortDirection;
    }
    sortButton.classList.add(sortDirection);

    // Initialize tab data regardless of the setting
    await initializeTabData();

    // Disable sort button if "Display tabs in activation order" is enabled
    if (areTabsRecentlyUpdated) {
        console.log("[Window Script]: Tab activation order is enabled");
        sortButton.disabled = true;
        sortButton.classList.add("disabled");
    } else {
        console.log("[Window Script]: Using standard sorting");
        sortButton.disabled = false;
        sortButton.classList.remove("disabled");
    }

    // Add event listener to the sort button. When clicked, change the sort direction and update the tabs list.
    sortButton.addEventListener("click", async () => {
        console.log("[Window Script]: Sort button clicked");

        // Change the sort direction after each click
        sortButton.classList.remove(sortDirection);
        sortDirection = sortDirection === "desc" ? "asc" : "desc";
        sortButton.classList.add(sortDirection);

        // Save the sort direction to storage
        await chrome.storage.local.set({ savedSortDirection: sortDirection });

        // Update the tabs list after changing the sort direction
        await setTabsList();
    });

    // Update the tabs list when the window is loaded
    await setTabsList();

    // Update button functionality
    const updateButton = document.getElementById("updateButton");
    updateButton.addEventListener("click", async () => {
        console.log("[Window Script]: Update button clicked");
        await setTabsList();
    });

    // Add event listener to the save prompt button. When clicked, save the prompt to the storage.
    savePromptButton.addEventListener("click", async () => {
        const text = document.getElementById("inputText").value.trim();
        if (!text) return;

        await savePrompt(text);
    });

    // NOTE - Send button functionality. When clicked, send the text to the selected tabs.
    sendButton.addEventListener("click", async () => {
        console.log("[Window Script]: Send button clicked");

        // Disable button and show processing state
        sendButton.disabled = true;
        const originalButtonText = sendButton.textContent;
        sendButton.textContent = "Sending...";

        try {
            const text = document.getElementById("inputText").value.trim();
            if (!text) return;

            await saveToHistory(text);

            // Get current tabs and create a Set of valid tab IDs
            const currentTabs = await chrome.tabs.query({});
            const currentTabIds = new Set(currentTabs.map((tab) => tab.id));

            // Get selected tabs and filter out invalid ones
            const { selectedTabs = {} } = await chrome.storage.local.get(
                "selectedTabs"
            );
            const validSelectedTabIds = Object.keys(selectedTabs)
                .map(Number)
                .filter((id) => currentTabIds.has(id));

            console.log(
                "[Window Script]: Processing valid tabs:",
                validSelectedTabIds
            );

            // Clean up selectedTabs storage
            const cleanedSelectedTabs = {};
            validSelectedTabIds.forEach((id) => {
                cleanedSelectedTabs[id] = true;
            });
            await chrome.storage.local.set({
                selectedTabs: cleanedSelectedTabs,
            });

            // Process valid tabs
            for (const tabId of validSelectedTabIds) {
                try {
                    const tab = await chrome.tabs.get(tabId);
                    if (!tab) {
                        console.warn(
                            `[Window Script]: Tab ${tabId} no longer exists`
                        );
                        continue;
                    }

                    await chrome.tabs.update(tabId, { active: true });
                    await processTab(tab);

                    // Add delay between tabs
                    await new Promise((resolve) => setTimeout(resolve, 500));

                    console.log(
                        "[Window Script]: Successfully processed tab:",
                        tabId,
                        tab.url
                    );
                } catch (error) {
                    console.error(
                        `[Window Script]: Failed to process tab ${tabId}:`,
                        error
                    );
                }
            }
        } catch (error) {
            console.error(
                "[Window Script]: Error in send button handler:",
                error
            );
        } finally {
            // Restore button state
            sendButton.disabled = false;
            sendButton.textContent = originalButtonText;
        }
    });

    // Right panel buttons
    const historyButton = document.getElementById("openHistoryButton");
    const savedPromptsButton = document.getElementById(
        "openSavedPromptsButton"
    );
    const settingsButton = document.getElementById("openSettingsButton");

    historyButton.addEventListener("click", () =>
        toggleRightPanel("history", historyButton)
    );
    savedPromptsButton.addEventListener("click", () =>
        toggleRightPanel("saved", savedPromptsButton)
    );
    settingsButton.addEventListener("click", () =>
        toggleRightPanel("settings", settingsButton)
    );
});

//SECTION - Tabs functions and event listeners

//NOTE - Event listener for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log("[Window Script]: Tab activated:", activeInfo.tabId);

    // Get current data
    const { tabActivationTimes: currentData = {} } =
        await chrome.storage.local.get("tabActivationTimes");

    // Update activation time for current tab
    currentData[activeInfo.tabId] = Date.now();

    // Save updated data
    await chrome.storage.local.set({ tabActivationTimes: currentData });

    // Update local copy
    tabActivationTimes = currentData;

    // Refresh the tabs list on tab activation
    await setTabsList();
});

//NOTE - Event listener for tab creation
chrome.tabs.onCreated.addListener(async () => {
    console.log("[Window Script]: Tab created");
    await setTabsList();
});

//NOTE - Event listener for tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
    console.log("[Window Script]: Tab removed:", tabId);

    // Clean up selectedTabs
    const { selectedTabs = {} } = await chrome.storage.local.get(
        "selectedTabs"
    );
    if (selectedTabs[tabId]) {
        delete selectedTabs[tabId];
        await chrome.storage.local.set({ selectedTabs });
    }

    // Clean up activation times
    const { tabActivationTimes: currentData = {} } =
        await chrome.storage.local.get("tabActivationTimes");
    if (currentData[tabId]) {
        delete currentData[tabId];
        await chrome.storage.local.set({ tabActivationTimes: currentData });

        // Update local copy
        tabActivationTimes = currentData;
    }

    await setTabsList();
});

//NOTE - Event listener for tab updates (URL changes, etc.)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only update when the tab is fully loaded or URL changes
    if (changeInfo.status === "complete" || changeInfo.url) {
        console.log("[Window Script]: Tab updated:", tabId);
        await setTabsList();
    }
});

//NOTE - Function to display the list of tabs
async function setTabsList() {
    // Check if the tabs list element exists
    if (!tabsListElement) {
        tabsListElement = document.getElementById("tabsList");
        if (!tabsListElement) {
            console.error("[Window Script]: Tabs list element not found");
            return;
        }
    }

    // Get current settings
    const { areTabsRecentlyUpdated = false } = await chrome.storage.local.get("areTabsRecentlyUpdated");
    console.log("[Window Script]: Tab activation order enabled:", areTabsRecentlyUpdated);

    const tabs = await chrome.tabs.query({});
    const currentTabIds = new Set(tabs.map((tab) => tab.id));

    // Get the URL of the extension's window
    const extensionWindowUrl = chrome.runtime.getURL("src/window.html");
    console.log("[Window Script]: Extension window URL:", extensionWindowUrl);

    // Filter out the extension's own window from the list of tabs
    const filteredTabs = tabs.filter(tab => tab.url !== extensionWindowUrl);

    // Clean up selectedTabs storage
    const { selectedTabs = {} } = await chrome.storage.local.get(
        "selectedTabs"
    );
    const cleanedSelectedTabs = {};
    Object.keys(selectedTabs)
        .map(Number)
        .filter((id) => currentTabIds.has(id))
        .forEach((id) => {
            cleanedSelectedTabs[id] = true;
        });

    await chrome.storage.local.set({ selectedTabs: cleanedSelectedTabs });

    // Clear the current list
    tabsListElement.innerHTML = "";

    // Sort the *filtered* tabs
    const sortedTabs = await sortTabs(filteredTabs);

    // Create tab items
    sortedTabs.forEach((tab) => {
        console.log(
            "[Window Script]: Creating tab item for:",
            tab.id,
            tab.title
        );

        const tabItem = document.createElement("div");
        tabItem.className = "tab-item";

        const isSupported = isSupportedUrl(tab.url);
        tabItem.classList.add(isSupported ? "supported" : "unsupported");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "tab-checkbox";
        checkbox.checked =
            isSupported && (cleanedSelectedTabs[tab.id] || false);
        checkbox.dataset.tabId = tab.id;
        checkbox.disabled = !isSupported;

        const title = document.createElement("div");
        title.className = "tab-title";
        title.title = tab.title;
        title.textContent = tab.title;

        const url = document.createElement("div");
        url.className = "tab-url";
        url.textContent = tab.url;
        url.title = tab.url;

        tabItem.appendChild(checkbox);
        tabItem.appendChild(title);
        tabItem.appendChild(url);
        tabsListElement.appendChild(tabItem);

        if (isSupported) {
            checkbox.addEventListener("change", async () => {
                const { selectedTabs = {} } = await chrome.storage.local.get(
                    "selectedTabs"
                );
                if (checkbox.checked) {
                    selectedTabs[tab.id] = true;
                } else {
                    delete selectedTabs[tab.id];
                }
                await chrome.storage.local.set({ selectedTabs });
            });
        }
    });
}

//NOTE - Function for sorting tabs
async function sortTabs(tabs) {
    const { areTabsRecentlyUpdated } = await chrome.storage.local.get(
        "areTabsRecentlyUpdated"
    );

    if (areTabsRecentlyUpdated) {
        // Sort by activation time (most recent first)
        console.log("[Window Script]: Sorting by activation time (most recent first).");
        const activationTimes = tabActivationTimes || {};

        // Create a map for quick time lookup, defaulting to 0 if not found
        const tabTimeMap = new Map();
        tabs.forEach((tab) => {
            const time = activationTimes[tab.id] || 0;
            tabTimeMap.set(tab.id, time);
            // Keep detailed log for potential future debugging, can be removed later
            console.log(`[Window Script]: Tab ${tab.id} mapped time:`, new Date(time).toISOString());
        });

        return [...tabs].sort((a, b) => {
            const timeA = tabTimeMap.get(a.id);
            const timeB = tabTimeMap.get(b.id);
            // Sort primarily by time descending, secondarily by ID descending for stability
            return (timeB - timeA) || (b.id - a.id);
        });

    } else {
        // Sort by tab ID using the selected direction
        console.log(`[Window Script]: Sorting by ID. Direction: ${sortDirection}`);
        return [...tabs].sort((a, b) =>
            sortDirection === "desc" ? b.id - a.id : a.id - b.id
        );
    }
}

//NOTE - Function to process the tab. This means injecting the content script and sending the text to each tab.
async function processTab(tab) {
    console.log(
        "[Window Script]: processTab started for tab:",
        tab.id,
        tab.url
    );

    const url = tab.url;
    console.log("[Window Script]: Processing tab:", tab.id, url);

    //NOTE - Check if the URL is supported
    if (SUPPORTED_SITES.some((site) => url.includes(site))) {
        console.log("[Window Script]: Supported site detected");

        try {
            // LINK - Inject the content script into currently active tab using code from content.js
            console.log(
                `[Window Script]: Injecting content script  to tab ${tab.id} (${tab.url})`
            );
            await injectContentScript(tab.id);

            // Delay to ensure that the content script is fully loaded
            console.log("[Window Script]: Waiting for initialization");
            await new Promise((resolve) => setTimeout(resolve, 1000));

            const text = document.getElementById("inputText").value;
            console.log("[Window Script]: Text to send:", text);

            // LINK - Send a message to the content script to focus and fill the input field
            console.debug(`[Window] Sending message to tab ${tab.id}`);
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: "focusAndFill", //  We created action focusAndFill, which is recieved in content.js
                text: text,
            });
            console.log("[Window Script]: Response received:", response);

            if (!response?.success) {
                console.error(
                    `[Window] Tab ${tab.id} failed processing:`,
                    response.error
                );
            }
        } catch (error) {
            console.error(
                `[Window] Critical error processing tab ${tab.id}:`,
                error
            );
            if (error.message.includes("Cannot access contents")) {
                console.warn(
                    "[Window] Possible permission issue - Check host permissions in manifest"
                );
            }
        }
    }
}

//!SECTION - Tabs functions and event listeners

//SECTION - Right panel functions

//NOTE - Function to toggle the right panel
async function toggleRightPanel(panelType, button) {
    const rightPanel = document.querySelector(".right-panel");
    const sections = rightPanel.querySelectorAll('.panel-section');

    // If the panel is already visible and the same button is clicked, hide the panel
    if (activeButton === button) {
        rightPanel.classList.remove("visible");
        button.classList.remove("active");
        // Hide all sections when panel is closed
        sections.forEach(section => section.style.display = 'none');
        activeButton = null;
        currentPanel = null;
        return;
    }

    // Deactivate previously active button
    if (activeButton) {
        activeButton.classList.remove("active");
    }

    // Activate the new button
    button.classList.add("active");
    activeButton = button;
    currentPanel = panelType;

    // Hide all sections first
    sections.forEach(section => section.style.display = 'none');

    // Show the target section and load its content
    let targetSection;
    switch (panelType) {
        case "history":
            targetSection = document.getElementById('historySection');
            await setHistoryPanel();
            break;
        case "saved":
            targetSection = document.getElementById('savedPromptsSection');
            await setSavedPromptsPanel();
            break;
        case "settings":
            targetSection = document.getElementById('settingsSection');
            await setSettingsPanel();
            break;
    }

    if (targetSection) {
        targetSection.style.display = 'block';
    }

    // Ensure the main right panel is visible
    rightPanel.classList.add("visible");
}

//NOTE - Function to set the history panel
async function setHistoryPanel() {
    // if (currentPanel !== "history") return; // Keep this check if needed, but toggle ensures context

    // Target the specific container for history items
    const historyContainer = document.getElementById("historyContainer");
    if (!historyContainer) {
        console.error("[Window Script]: History container not found!");
        return;
    }

    const { requestHistory = [] } = await chrome.storage.local.get(
        "requestHistory"
    );

    // Clear only the history container's content
    historyContainer.innerHTML = "";

    if (requestHistory.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "empty-history";
        emptyMessage.textContent = "Prompt history is empty";
        historyContainer.appendChild(emptyMessage);
    } else {
        requestHistory.forEach((item) => {
            const historyItem = document.createElement("div");
            historyItem.className = "history-item";

            const textContainer = document.createElement("div");
            textContainer.className = "history-text";
            textContainer.textContent = item.text;
            textContainer.title = item.text;

            const dateContainer = document.createElement("div");
            dateContainer.className = "history-date";
            dateContainer.textContent = formatDate(item.timestamp);

            const deleteButton = document.createElement("button");
            deleteButton.className = "history-delete";
            deleteButton.innerHTML = "✕";
            deleteButton.title = "Remove from history";

            deleteButton.addEventListener("click", async (e) => {
                e.stopPropagation();
                const { requestHistory = [] } = await chrome.storage.local.get(
                    "requestHistory"
                );
                const updatedHistory = requestHistory.filter(
                    (h) => h.id !== item.id
                );
                await chrome.storage.local.set({
                    requestHistory: updatedHistory,
                });
                // Re-render the history panel content
                setHistoryPanel();
            });

            // Append the text, date, and delete button to the history item
            historyItem.appendChild(textContainer);
            historyItem.appendChild(dateContainer);
            historyItem.appendChild(deleteButton);

            // When clicked, copy the text to the input field
            historyItem.addEventListener("click", () => {
                const inputText = document.getElementById("inputText");
                inputText.value = item.text;
            });

            historyContainer.appendChild(historyItem);
        });
    }
}

//NOTE - Function to set the saved prompts panel
async function setSavedPromptsPanel() {
    // if (currentPanel !== "saved") return;

    // Target the specific container for saved prompts
    const savedPromptsContainer = document.getElementById("savedPromptsContainer");
    if (!savedPromptsContainer) {
        console.error("[Window Script]: Saved prompts container not found!");
        return;
    }

    const { savedPrompts = [] } = await chrome.storage.local.get(
        "savedPrompts"
    ); // Get the saved prompts from storage

    // Clear only the saved prompts container's content
    savedPromptsContainer.innerHTML = "";

    // Header is now static in HTML
    // const header = document.createElement("h3");
    // header.textContent = "Saved Prompts";
    // rightPanel.appendChild(header);

    // Create a HTML/CSS container for saved prompts - No, append directly to savedPromptsContainer
    // const savedPromptsContainerElement = document.createElement("div");
    // savedPromptsContainerElement.className = "saved-prompts-container"; // Class moved to HTML

    if (savedPrompts.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "empty-saved-prompts";
        emptyMessage.textContent = "There are no saved prompts";
        savedPromptsContainer.appendChild(emptyMessage);
    } else {
        savedPrompts.forEach((prompt) => {
            const promptItem = document.createElement("div");
            promptItem.className = "saved-prompt-item";

            const textContainer = document.createElement("div");
            textContainer.className = "saved-prompt-text";
            textContainer.textContent = prompt.text;
            textContainer.title = prompt.text;

            const dateContainer = document.createElement("div");
            dateContainer.className = "saved-prompt-date";
            dateContainer.textContent = formatDate(prompt.timestamp);

            const deleteButton = document.createElement("button");
            deleteButton.className = "saved-prompt-delete";
            deleteButton.innerHTML = "✕";
            deleteButton.title = "Remove from saved prompts";

            deleteButton.addEventListener("click", async (e) => {
                e.stopPropagation();
                const { savedPrompts = [] } = await chrome.storage.local.get(
                    "savedPrompts"
                );
                const updatedPrompts = savedPrompts.filter(
                    (p) => p.id !== prompt.id
                );
                await chrome.storage.local.set({
                    savedPrompts: updatedPrompts,
                });
                // Re-render the saved prompts panel content
                setSavedPromptsPanel();
            });

            promptItem.appendChild(textContainer);
            promptItem.appendChild(dateContainer);
            promptItem.appendChild(deleteButton);

            // When clicked, copy the text to the input field
            promptItem.addEventListener("click", () => {
                const inputText = document.getElementById("inputText");
                inputText.value = prompt.text;
            });

            // Append the prompt item to the saved prompts container
            savedPromptsContainer.appendChild(promptItem);
        });
    }

    // Add the saved prompts container to the right panel - No
    // rightPanel.appendChild(savedPromptsContainerElement);
}

//NOTE - Function to set the settings panel
async function setSettingsPanel() {
    // if (currentPanel !== "settings") return;

    // Target the specific container for settings content
    const settingsContainer = document.getElementById("settingsContainer");
    if (!settingsContainer) {
        console.error("[Window Script]: Settings container not found!");
        return;
    }

    // Clear only the settings container's content
    settingsContainer.innerHTML = "";

    // Header is now static in HTML
    // const header = document.createElement("h3");
    // header.textContent = "Settings";
    // rightPanel.appendChild(header); // No longer appending to rightPanel

    const settingItemContainer = document.createElement("div");
    settingItemContainer.className = "setting-item-container"; // Use a more specific class if needed

    // Create checkbox for setting "Display tabs in activation order, instead of creation order"
    const areTabsRecentlyActivatedCheckbox = document.createElement("input");
    areTabsRecentlyActivatedCheckbox.type = "checkbox";
    areTabsRecentlyActivatedCheckbox.id = "recentlyUpdatedCheckbox"; // Add an ID for the label
    areTabsRecentlyActivatedCheckbox.className =
        "recently-activated-setting-checkbox";
    // areTabsRecentlyActivatedCheckbox.style.marginLeft = "10px"; // Style using CSS class

    const areTabsRecentlyActivatedCheckboxLabel =
        document.createElement("label");
    areTabsRecentlyActivatedCheckboxLabel.htmlFor = "recentlyUpdatedCheckbox"; // Use htmlFor
    areTabsRecentlyActivatedCheckboxLabel.textContent =
        " Display tabs in activation order, instead of creation order"; // Add space for clarity

    settingItemContainer.appendChild(areTabsRecentlyActivatedCheckbox);
    settingItemContainer.appendChild(areTabsRecentlyActivatedCheckboxLabel);

    // Append the setting item container to the settings container
    settingsContainer.appendChild(settingItemContainer);

    // Save the setting to storage (event listener logic remains the same)
    areTabsRecentlyActivatedCheckbox.addEventListener("change", async (e) => {
        const isEnabled = e.target.checked;

        console.log("[Window Script]: Saving tab activation setting:", isEnabled);

        // Update the setting in storage
        await chrome.storage.local.set({
            areTabsRecentlyUpdated: isEnabled,
        });

        // Verify the setting was saved
        const { areTabsRecentlyUpdated } = await chrome.storage.local.get("areTabsRecentlyUpdated");
        console.log("[Window Script]: Verified saved setting:", areTabsRecentlyUpdated);

        console.log(
            "[Window Script]: Tab activation sorting changed to:",
            isEnabled
        );

        // Disable sort button if the checkbox is checked
        const sortButton = document.querySelector(".sort-button");
        sortButton.disabled = isEnabled;
        sortButton.classList.toggle("disabled", isEnabled);

        // After checkbox status change, update the tabs list
        await setTabsList();
    });

    // Display checkbox status from storage
    const { areTabsRecentlyUpdated } = await chrome.storage.local.get(
        "areTabsRecentlyUpdated"
    );
    console.log("[Window Script]: Loading initial setting value:", areTabsRecentlyUpdated);
    areTabsRecentlyActivatedCheckbox.checked = areTabsRecentlyUpdated;
}

//!SECTION - Right panel functions

//NOTE - Function to save the prompt to history
async function saveToHistory(text) {
    const { requestHistory = [] } = await chrome.storage.local.get(
        "requestHistory"
    );

    const newHistoryItem = {
        text,
        timestamp: new Date().toISOString(),
        id: Date.now(),
    };

    // Add new item to the beginning of the array
    requestHistory.unshift(newHistoryItem);

    // Limit the number of history items
    if (requestHistory.length > MAX_HISTORY_ITEMS) {
        requestHistory.pop();
    }

    await chrome.storage.local.set({ requestHistory });

    // LINK - Update the history panel if it is currently active using updateHistoryPanel function
    if (currentPanel === "history") {
        await setHistoryPanel();
    }
}

//NOTE - Function to save the prompt to the saved prompts
async function savePrompt(text) {
    const { savedPrompts = [] } = await chrome.storage.local.get(
        "savedPrompts"
    );

    const newPrompt = {
        text,
        timestamp: new Date().toISOString(),
        id: Date.now(),
    };

    savedPrompts.unshift(newPrompt);
    await chrome.storage.local.set({ savedPrompts });

    // LINK - Update the saved prompts panel if it is currently active using updateSavedPromptsPanel function
    if (currentPanel === "saved") {
        await setSavedPromptsPanel();
    }
}

//NOTE - Utility function to format the date
function formatDate(isoString) {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}.${month}.${day} ${hours}:${minutes}`;
}

//NOTE - Function to check if the URL is supported
function isSupportedUrl(url) {
    return SUPPORTED_SITES.some((site) => url.includes(site));
}

/**
 * Injects the content script into a tab if it's not already loaded
 * This function prevents multiple injections of the same script,
 * which helps avoid variable redeclaration errors
 *
 * @param {number} tabId - The ID of the tab to inject the script into
 * @returns {Promise} A promise that resolves when the script is injected or already loaded
 */
function injectContentScript(tabId) {
    return new Promise((resolve, reject) => {
        // First, check if our content script is already loaded in the tab
        chrome.scripting
            .executeScript({
                target: { tabId: tabId },
                function: checkIfContentScriptLoaded,
            })
            .then((result) => {
                // If the script is already loaded (indicated by the global marker)
                if (result[0].result === true) {
                    console.log(
                        "[Window Script]: Content script already loaded"
                    );
                    resolve();
                } else {
                    // If the script is not loaded yet, inject it into the tab
                    chrome.scripting
                        .executeScript({
                            target: { tabId: tabId },
                            files: ["src/content.js"],
                        })
                        .then(() => {
                            console.log(
                                "[Window Script]: Content script injected successfully"
                            );
                            resolve();
                        })
                        .catch((error) => {
                            console.error(
                                "[Window Script]: Error injecting content script:",
                                error
                            );
                            reject(error);
                        });
                }
            });
    });
}

/**
 * Checks if the content script has been loaded in a page
 * This function runs in the context of the target tab and checks for
 * the global marker we set when the script initializes
 *
 * @returns {boolean} True if the content script has already been loaded
 */
function checkIfContentScriptLoaded() {
    return window.__contentScriptLoaded === true;
}
