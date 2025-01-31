console.log("[Window Script]: Window script loaded");

//NOTE - List of supported sites
const SUPPORTED_SITES = [
    "google.com",
    "chatgpt.com",
    "chatgpt.com",
    "claude.ai",
    "apps.abacus.ai",
    "chat.deepseek.com"
];

// Storage for latest tab activation times
let tabActivationTimes = new Map();

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
    const sortButton = document.getElementById("sortButton");

    // SECTION - Tabs in DOMContentLoaded event

    // Initialize activation times for existing tabs
    const tabs = await chrome.tabs.query({});
    const currentTime = Date.now();
    const { tabActivationTimes: savedTimes = {} } = await chrome.storage.local.get("tabActivationTimes");

    // Load saved activation times
    tabActivationTimes = new Map(Object.entries(savedTimes));

    // Initialize times for tabs that don't have them
    tabs.forEach(tab => {
        if (!tabActivationTimes.has(tab.id.toString())) {
            tabActivationTimes.set(tab.id.toString(), currentTime);
        }
    });

    // Save updated activation times
    await chrome.storage.local.set({
        tabActivationTimes: Object.fromEntries(tabActivationTimes)
    });

    // Load both sort settings from storage in a single call
    const { savedSortDirection, areTabsRecentlyUpdated } = await chrome.storage.local.get([
        "savedSortDirection",
        "areTabsRecentlyUpdated"
    ]);

    // Disable sort button on startup if "Display tabs in activation order" is enabled
    if (areTabsRecentlyUpdated) {
        sortButton.disabled = true;
        sortButton.classList.add("disabled");
    } else {
        sortButton.disabled = false;
        sortButton.classList.remove("disabled");
    }

    // Load the saved sort direction if it exists
    if (savedSortDirection) {
        sortDirection = savedSortDirection;
    }
    sortButton.className = sortDirection;

    // Add event listener to the sort button. When clicked, change the sort direction and update the tabs list.
    sortButton.addEventListener("click", async () => {
        console.log("[Window Script]: Sort button clicked");

        // Change the sort direction after each click
        sortDirection = sortDirection === "desc" ? "asc" : "desc";

        // Save the sort direction to storage
        await chrome.storage.local.set({ savedSortDirection: sortDirection });

        // Update the class name of the sort button, so the icon changes (up/down arrow from CSS file)
        sortButton.className = sortDirection;

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
            const currentTabIds = new Set(currentTabs.map(tab => tab.id));

            // Get selected tabs and filter out invalid ones
            const { selectedTabs = {} } = await chrome.storage.local.get("selectedTabs");
            const validSelectedTabIds = Object.keys(selectedTabs)
                .map(Number)
                .filter(id => currentTabIds.has(id));

            console.log("[Window Script]: Processing valid tabs:", validSelectedTabIds);

            // Clean up selectedTabs storage
            const cleanedSelectedTabs = {};
            validSelectedTabIds.forEach(id => {
                cleanedSelectedTabs[id] = true;
            });
            await chrome.storage.local.set({ selectedTabs: cleanedSelectedTabs });

            // Process valid tabs
            for (const tabId of validSelectedTabIds) {
                try {
                    const tab = await chrome.tabs.get(tabId);
                    if (!tab) {
                        console.warn(`[Window Script]: Tab ${tabId} no longer exists`);
                        continue;
                    }

                    await chrome.tabs.update(tabId, { active: true });
                    await processTab(tab);

                    // Add delay between tabs
                    await new Promise((resolve) => setTimeout(resolve, 500));

                    console.log("[Window Script]: Successfully processed tab:", tabId, tab.url);
                } catch (error) {
                    console.error(`[Window Script]: Failed to process tab ${tabId}:`, error);
                }
            }
        } catch (error) {
            console.error("[Window Script]: Error in send button handler:", error);
        } finally {
            // Restore button state
            sendButton.disabled = false;
            sendButton.textContent = originalButtonText;
        }
    });

    // Right panel buttons
    const historyButton = document.getElementById("openHistoryButton");
    const savedPromptsButton = document.getElementById("openSavedPromptsButton");
    const settingsButton = document.getElementById("openSettingsButton");

    historyButton.addEventListener("click", () => toggleRightPanel("history", historyButton));
    savedPromptsButton.addEventListener("click", () => toggleRightPanel("saved", savedPromptsButton));
    settingsButton.addEventListener("click", () => toggleRightPanel("settings", settingsButton));
});

//SECTION - Tabs functions and event listeners

//NOTE - Event listener for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    tabActivationTimes.set(activeInfo.tabId.toString(), Date.now());
    // Save to storage for persistence
    await chrome.storage.local.set({
        tabActivationTimes: Object.fromEntries(tabActivationTimes)
    });

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
    const { selectedTabs = {} } = await chrome.storage.local.get("selectedTabs");
    if (selectedTabs[tabId]) {
        delete selectedTabs[tabId];
        await chrome.storage.local.set({ selectedTabs });
    }

    // Clean up activation times
    tabActivationTimes.delete(tabId.toString());
    await chrome.storage.local.set({
        tabActivationTimes: Object.fromEntries(tabActivationTimes)
    });

    await setTabsList();
});

//NOTE - Event listener for tab updates (URL changes, etc.)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only update when the tab is fully loaded or URL changes
    if (changeInfo.status === 'complete' || changeInfo.url) {
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

    const tabs = await chrome.tabs.query({});
    const currentTabIds = new Set(tabs.map(tab => tab.id));

    // Clean up selectedTabs storage
    const { selectedTabs = {} } = await chrome.storage.local.get("selectedTabs");
    const cleanedSelectedTabs = {};
    Object.keys(selectedTabs)
        .map(Number)
        .filter(id => currentTabIds.has(id))
        .forEach(id => {
            cleanedSelectedTabs[id] = true;
        });

    await chrome.storage.local.set({ selectedTabs: cleanedSelectedTabs });

    // Clear the current list
    tabsListElement.innerHTML = "";

    // Sort the tabs
    const sortedTabs = await sortTabs(tabs);

    // Create tab items
    sortedTabs.forEach((tab) => {
        console.log("[Window Script]: Creating tab item for:", tab.id, tab.title);

        const tabItem = document.createElement("div");
        tabItem.className = "tab-item";

        const isSupported = isSupportedUrl(tab.url);
        tabItem.classList.add(isSupported ? "supported" : "unsupported");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "tab-checkbox";
        checkbox.checked = isSupported && (cleanedSelectedTabs[tab.id] || false);
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
                const { selectedTabs = {} } = await chrome.storage.local.get("selectedTabs");
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
    // Check if the areTabsRecentlyUpdated setting is enabled
    const { areTabsRecentlyUpdated } = await chrome.storage.local.get("areTabsRecentlyUpdated");

    if (areTabsRecentlyUpdated) {
        // If areTabsRecentlyUpdated is enabled, sort tabs based on activation time
        return [...tabs].sort((a, b) => {
            return (tabActivationTimes.get(b.id.toString()) || 0) - (tabActivationTimes.get(a.id.toString()) || 0);
        });
    }

    // If areTabsRecentlyUpdated is disabled, sort tabs based on creation time
    return [...tabs].sort((a, b) => (sortDirection === "desc" ? b.id - a.id : a.id - b.id));
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
            console.log(`[Window Script]: Injecting content script  to tab ${tab.id} (${tab.url})`);
            await chrome.scripting.executeScript({
                target: { tabId: tab.id }, //  Script is injected into the current tab
                files: ["src/content.js"], //  Content script file
            });
            console.log(
                "[Window Script]: Content script injected successfully"
            );

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
                console.error(`[Window] Tab ${tab.id} failed processing:`, response.error);
            }
        } catch (error) {
            console.error(`[Window] Critical error processing tab ${tab.id}:`, error);
            if (error.message.includes("Cannot access contents")) {
                console.warn("[Window] Possible permission issue - Check host permissions in manifest");}
        }
    }
}

//!SECTION - Tabs functions and event listeners

//SECTION - Right panel functions

//NOTE - Function to toggle the right panel
async function toggleRightPanel(panelType, button) {
    const rightPanel = document.querySelector(".right-panel");

    // If the panel is already visible and the same button is clicked, hide the panel
    if (activeButton === button) {
        rightPanel.classList.remove("visible");
        button.classList.remove("active");
        activeButton = null;
        currentPanel = null;
        return;
    }

    // If the panel is not visible, show it
    if (activeButton) {
        activeButton.classList.remove("active");
    }

    // Add the active class to the clicked button
    button.classList.add("active");
    activeButton = button;
    currentPanel = panelType;

    // Clear the current content, so we can re-render it
    rightPanel.innerHTML = "";

    // Add the header to HTML
    const header = document.createElement("h3");

    switch (panelType) {
        case "history":
            header.textContent = "History";
            rightPanel.appendChild(header);
            await setHistoryPanel();
            break;
        case "saved":
            header.textContent = "Saved Prompts";
            rightPanel.appendChild(header);
            await setSavedPromptsPanel();
            break;
        case "settings":
            header.textContent = "Settings";
            rightPanel.appendChild(header);
            await setSettingsPanel();
            break;
    }

    // Add the right panel to the DOM
    rightPanel.classList.add("visible");
}

//NOTE - Function to set the history panel
async function setHistoryPanel() {
    if (currentPanel !== "history") return;

    const rightPanel = document.querySelector(".right-panel");
    const { requestHistory = [] } = await chrome.storage.local.get(
        "requestHistory"
    );

    // Clear the current content, so we can re-render it
    rightPanel.innerHTML = "";

    // Add the header to HTML
    const header = document.createElement("h3");
    header.textContent = "History";
    rightPanel.appendChild(header);

    // Create a HTML/CSS container for history items
    const historyContainer = document.createElement("div");
    historyContainer.className = "history-container";

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

    // Add the history container to the right panel
    rightPanel.appendChild(historyContainer);
}

//NOTE - Function to set the saved prompts panel
async function setSavedPromptsPanel() {
    if (currentPanel !== "saved") return;

    const rightPanel = document.querySelector(".right-panel");
    const { savedPrompts = [] } = await chrome.storage.local.get(
        "savedPrompts"
    ); // Get the saved prompts from storage

    // Clear the current content, so we can re-render it
    rightPanel.innerHTML = "";

    // Add the header to HTML
    const header = document.createElement("h3");
    header.textContent = "Saved Prompts";
    rightPanel.appendChild(header);

    // Create a HTML/CSS container for saved prompts
    const savedPromptsContainer = document.createElement("div");
    savedPromptsContainer.className = "saved-prompts-container";

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

    // Add the saved prompts container to the right panel
    rightPanel.appendChild(savedPromptsContainer);
}

//NOTE - Function to set the settings panel
async function setSettingsPanel() {
    if (currentPanel !== "settings") return;

    const rightPanel = document.querySelector(".right-panel");

    const settingContainer = document.createElement("div");
    settingContainer.className = "recently-updated-setting-container";

    // Create checkbox for setting "Display tabs in activation order, instead of creation order"
    const areTabsRecentlyActivatedCheckbox = document.createElement("input");
    areTabsRecentlyActivatedCheckbox.type = "checkbox";
    areTabsRecentlyActivatedCheckbox.className =
        "recently-activated-setting-checkbox";
    areTabsRecentlyActivatedCheckbox.style.marginLeft = "10px";

    const areTabsRecentlyActivatedCheckboxLabel = document.createElement("label");
    areTabsRecentlyActivatedCheckboxLabel.for = "recentlyUpdatedCheckbox";
    areTabsRecentlyActivatedCheckboxLabel.textContent =
        "Display tabs in activation order, instead of creation order";

    settingContainer.appendChild(areTabsRecentlyActivatedCheckbox);
    settingContainer.appendChild(areTabsRecentlyActivatedCheckboxLabel);

    rightPanel.appendChild(settingContainer);

    //Save the setting to storage
    areTabsRecentlyActivatedCheckbox.addEventListener("change", async (e) => {
        await chrome.storage.local.set({
            areTabsRecentlyUpdated: e.target.checked,
        });

        // Disable sort button if the checkbox is checked
        sortButton.disabled = e.target.checked;
        sortButton.classList.toggle("disabled", e.target.checked);

        //After checkbox status change, update the tabs list
        await setTabsList();
    });


    //Display checkbox status from storage
    const { areTabsRecentlyUpdated } = await chrome.storage.local.get(
        "areTabsRecentlyUpdated"
    );
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
