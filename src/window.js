console.log("[Window Script]: Window script loaded");

//NOTE - List of supported sites
const SUPPORTED_SITES = [
    "google.com",
    "chatgpt.com",
    "chatgpt.com",
    "claude.ai",
    "apps.abacus.ai",
];

const MAX_HISTORY_ITEMS = 100;

let sortDirection = "desc";

// Variables for right panel
let isRightPanelVisible = false; // Viability of the right panel
let activeButton = null;
let currentPanel = null;

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
        await updateHistoryPanel();
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

//NOTE - Function to update the history panel
async function updateHistoryPanel() {
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
                updateHistoryPanel();
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

//NOTE - Function to save the text from the input field to the saved prompts
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
        await updateSavedPromptsPanel();
    }
}

//NOTE - Function to update the saved prompts panel
async function updateSavedPromptsPanel() {
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
                updateSavedPromptsPanel();
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
            await updateHistoryPanel();
            break;
        case "saved":
            header.textContent = "Saved Prompts";
            rightPanel.appendChild(header);
            await updateSavedPromptsPanel();
            break;
        case "settings":
            //STUB - Placeholder for settings
            header.textContent = "Settings";
            rightPanel.appendChild(header);
            rightPanel.appendChild(
                createPlaceholder("Settings panel will be displayed here")
            );
            break;
    }

    // Add the right panel to the DOM
    rightPanel.classList.add("visible");
}

//STUB - Placeholder function to create a placeholder
function createPlaceholder(text) {
    const placeholder = document.createElement("div");
    placeholder.style.color = "#666";
    placeholder.style.textAlign = "center";
    placeholder.style.padding = "20px";
    placeholder.textContent = text;
    return placeholder;
}

//NOTE - Function to check if the URL is supported
function isSupportedUrl(url) {
    return SUPPORTED_SITES.some((site) => url.includes(site));
}

//NOTE - Event listener for the DOMContentLoaded event.
//We use this event to ensure that the DOM is fully loaded before we start interacting with it.
document.addEventListener("DOMContentLoaded", async function () {
    console.log("[Window Script]: DOMContentLoaded event fired");

    const tabsList = document.getElementById("tabsList");
    console.log("[Window Script]: Tabs list element:", tabsList);

    const sendButton = document.getElementById("sendButton");
    console.log("[Window Script]: Send button element:", sendButton);

    const inputText = document.getElementById("inputText");
    console.log("[Window Script]: Input text element:", inputText);

    const savePromptButton = document.getElementById("savePromptButton");

    // Add event listener to the save prompt button. When clicked, save the prompt to the storage.
    savePromptButton.addEventListener("click", async () => {
        const text = document.getElementById("inputText").value.trim();
        if (!text) return;

        await savePrompt(text);
    });

    // Add new button for sorting tabs
    //TODO - move creation of the button to html
    const sortButton = document.createElement("button");
    sortButton.id = "sortButton";
    sortButton.textContent = "Sorting";

    // Get the saved sort direction from storage
    const { savedSortDirection } = await chrome.storage.local.get(
        "savedSortDirection"
    );
    if (savedSortDirection) {
        sortDirection = savedSortDirection;
    }
    sortButton.className = sortDirection;

    // Insert the sort button before the tabs list
    //TODO - move creation of the button to html
    tabsList.parentElement.insertBefore(sortButton, tabsList);

    //NOTE - Function for sorting tabs
    function sortTabs(tabs) {
        return [...tabs].sort((a, b) => {
            if (sortDirection === "desc") {
                return b.id - a.id;
            }
        });
    }

    //NOTE - Function to display the list of tabs
    async function updateTabsList() {
        const tabs = await chrome.tabs.query({});
        const { selectedTabs = {} } = await chrome.storage.local.get(
            "selectedTabs"
        );

        // Clear the current list, so we can re-render it
        tabsList.innerHTML = "";

        // Sort the tabs
        const sortedTabs = sortTabs(tabs);

        // Create a tab item for each tab
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

            // Create a checkbox for each tab
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "tab-checkbox";
            checkbox.checked = isSupported && (selectedTabs[tab.id] || false);
            checkbox.dataset.tabId = tab.id;

            // if the site is not supported, disable the checkbox
            if (!isSupported) {
                checkbox.disabled = true;
            }

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
            tabsList.appendChild(tabItem);

            // if the site is supported, add an event listener to the checkbox
            if (isSupported) {
                checkbox.addEventListener("change", async () => {
                    const { selectedTabs = {} } =
                        await chrome.storage.local.get("selectedTabs");
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

    // Add event listener to the sort button. When clicked, change the sort direction and update the tabs list.
    sortButton.addEventListener("click", async () => {
        console.log("[Window Script]: Sort button clicked");

        // Change the sort direction after each click
        sortDirection = sortDirection === "desc" ? "asc" : "desc";

        // Save the sort direction to storage
        await chrome.storage.local.set({ savedSortDirection: sortDirection });

        // Update the class name of the sort button, so the icon changes (up/down arrow from CSS file)
        sortButton.className = sortDirection;

        await updateTabsList();
    });

    // Update the tabs list when the window is loaded
    await updateTabsList();

    //NOTE - Send button functionality. When clicked, send the text to the selected tabs.
    sendButton.addEventListener("click", async () => {
        console.log("[Window Script]: Send button clicked");

        // Get the text from the input field
        const text = document.getElementById("inputText").value.trim();

        // If the text is empty, do nothing.
        if (!text) return;

        // Save the prompt to history
        await saveToHistory(text);

        // Get the selected tabs from storage
        const { selectedTabs = {} } = await chrome.storage.local.get(
            "selectedTabs"
        );
        console.log(
            "[Window Script]: Selected tabs for sending:",
            selectedTabs
        );

        // Get the tab IDs of the selected tabs
        const selectedTabIds = Object.keys(selectedTabs).map(Number);
        console.log(
            "[Window Script]: Selected tab IDs for sending:",
            selectedTabIds
        );

        // Iterate over the selected tabs and process each tab
        for (const tabId of selectedTabIds) {

            try {
                // This will activate the tab. This means that the tab will be brought to the front.
                await chrome.tabs.update(tabId, { active: true });

                // Get information about the tab (like URL, title, etc.)
                const tab = await chrome.tabs.get(tabId);

                // LINK - Call the processTab function to process the tab
                await processTab(tab);

                console.log(
                    "[Window Script]: Processing for tab completed:",
                    tabId
                );

                // Add a delay between tabs to avoid issues
                //TODO - add custom delay option in settings
                await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (error) {
                console.error(
                    "[Window Script]: Error processing tab:",
                    tabId,
                    error
                );
            }
        }
    });

    const historyButton = document.getElementById("openHistoryButton");
    const savedPromptsButton = document.getElementById(
        "openSavedPromptsButton"
    );
    const settingsButton = document.getElementById("openSettingsButton");

    //LINK - Toggle the right panel (call toggleRightPanel function) depending on the button clicked
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
            // LINK - Inject the content script into the tab using code from content.js
            console.log("[Window Script]: Injecting content script");
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["src/content.js"],
            });
            console.log(
                "[Window Script]: Content script injected successfully"
            );

            // Delay to ensure that the content script is fully loaded
            console.log("[Window Script]: Waiting for initialization");
            await new Promise((resolve) => setTimeout(resolve, 1000));

            const text = document.getElementById("inputText").value;
            console.log("[Window Script]: Text to send:", text);


            const response = await chrome.tabs.sendMessage(tab.id, {
                action: "focusAndFill",
                text: text,
            });
            console.log("[Window Script]: Response received:", response);

            if (!response?.success) {
                console.error(
                    "[Window Script]: Failed to process tab:",
                    response?.error || "Unknown error"
                );
            }
        } catch (error) {
            console.error("[Window Script]: Error processing tab:", error);
        }
    }
}
