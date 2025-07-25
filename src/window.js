/**
 * @file window.js
 * This file is activated when:
 * Step 1. Event listener `background.js` finds a click on the extension icon.
 * Step 2. Extension window is opened, and `window.html` file is loaded.
 * Step 3. `window.html` loads and executes `window.js`.
 *
 * After `window.js` is loaded, it will call for `DOMContentLoaded` event handler. It will call @see handleDOMContentLoaded function, that:
 * - Initialize UI elements @see initializeUIElements
 * - Set up event listeners for buttons and input fields @see setupInputListeners, @see setupDataManagementListeners, etc.
 * - Load and apply initial settings from chrome.storage.local, such as settings checkboxes states and sorting order @see loadAndApplyInitialSettings
 * - Initialize tab data and update the tabs list @see initializeTabData, @see setTabsList
 *
 * This file also handles:
 * - Tab activation events to track last active tabs, necessary for "Display tabs in activation order" setting @see handleTabActivatedChromeAPI; their creation, removal, and update events to keep the tabs list up-to-date @see handleTabCreatedChromeAPI, @see handleTabRemovedChromeAPI, @see handleTabUpdatedChromeAPI
 * - Right panel toggle buttons to show supported sites, history, saved prompts, and settings @see setupRightPanelListeners
 * - Error handling and display in the UI @see setupErrorHandlingListeners, displayErrorInUI
 * - Input handling for sending messages, saving prompts, and managing tab selections @see setupInputListeners, setupSendButtonListener
 * - Data management for exporting and importing saved prompts @see setupDataManagementListeners
 * - Robust communication with the background script using a long-lived port to handle Service Worker lifecycle @see backgroundPort
 *
 * This file activates script injection into the current tab using `content.js` file @see setupSendButtonListener.
 */

import "./debug.js";

//NOTE - List of supported sites
const SUPPORTED_SITES = [
    "gemini.google.com",
    "aistudio.google.com",
    "google.com",
    "chatgpt.com",
    "claude.ai",
    "apps.abacus.ai",
    "chat.deepseek.com",
    "perplexity.ai",
    "poe.com",
    "grok.com",
    "copilot.microsoft.com",
];

//NOTE - Detailed information about supported sites
const SUPPORTED_SITES_LINKS = {
    "ChatGPT": "https://chat.openai.com",
    "Google Gemini": "https://gemini.google.com/app",
    "Google AI Studio": "https://aistudio.google.com/",
    "Microsoft Copilot": "https://copilot.microsoft.com/",
    "Claude AI": "https://claude.ai/chat",
    "DeepSeek Chat": "https://chat.deepseek.com",
    "Grok": "https://grok.com",
    "Perplexity AI": "https://perplexity.ai",
    "Poe": "https://poe.com",
    "Anthropic Claude (Abacus)": "https://apps.abacus.ai/chat",
};

// Storage for latest tab activation times
// Global variable for storing tab activation times
let tabActivationTimes = {};

// Displaying tab creation/activation date/time
let displayTabDateTime = false;

// Maximum number of history items to keep
const MAX_HISTORY_ITEMS = 100;

// Default sort direction - descending
let sortDirection = "desc";

// Variables for right panel
let activeButton = null;
let currentPanel = null;

// Global variable for storing tab list element
let tabsListElement;

// Global variable to track if tabs are currently being processed. Necessary for canceling processing of tabs functionality.
let isProcessingTabs = false;
let isUpdatingTabsList = false; // Flag to prevent duplicate updates

// Global variables for error handling
let errorQueue = [];
let errorMessageContainer;
let errorMessageText;
let errorMessageCloseButton;

// Global variable for the long-lived port to the background script
let backgroundPort;

/**
 * FUNC - Handles the DOMContentLoaded event.
 * Ensures that the DOM is fully loaded before interacting with it.
 * Initializes UI elements, loads settings, event listeners for buttons,
 * and updates the tabs list.
 */
async function handleDOMContentLoaded() {
    console.log("[Window Script]: DOMContentLoaded event fired");
    // 1. Connect to the background script using a long-lived port
    connectToBackgroundScript();

    // 2. Initialize UI elements
    const elements = await initializeUIElements();

    // 3. Setup error handling listeners
    errorMessageContainer = elements.errorMessageContainer;
    errorMessageText = elements.errorMessageText;
    errorMessageCloseButton = elements.errorMessageCloseButton;
    setupErrorHandlingListeners(elements);

    // 4. Setup input listeners
    setupInputListeners(elements);

    // 5. Setup data management listeners
    setupDataManagementListeners(elements);

    // 6. Setup tab list control listeners
    setupTabListControlListeners(elements);

    // 7. Setup send button listener
    setupSendButtonListener(elements);

    // 8. Setup stop button listener
    setupStopButtonListener(elements);

    // 9. Setup right panel listeners
    setupRightPanelListeners(elements);

    // 10. Load and apply initial settings (includes setting up its own change listener)
    await loadAndApplyInitialSettings(elements);

    // 11. Initialize tab data and update the tabs list
    await initializeTabData();
    await setTabsList();

    // Initial UI state update
    updateUIState(elements);

    console.log("[Window Script]: DOMContentLoaded processing complete.");
}

// Attach the main handler to the DOMContentLoaded event
document.addEventListener("DOMContentLoaded", handleDOMContentLoaded);

/**
 * FUNC - Sets up the event listener for the stop button.
 * Handles the click event for the stop button, setting the processing flag to false.
 * @param {object} elements - Object containing references to DOM elements.
 */
function setupStopButtonListener(elements) {
    console.log("[Window Script]: Setting up stop button listener.");
    elements.stopProcessingButton.addEventListener("click", () => {
        console.log("[Window Script]: Stop button clicked. Cancelling processing.");
        isProcessingTabs = false; // Set the flag to stop the loop
        updateUIState(elements); // Update UI immediately
    });
    console.log("[Window Script]: Stop button listener set up.");
}

/**
 * FUNC - Updates the UI state of the send and stop buttons.
 * Disables/enables buttons based on the `isProcessingTabs` flag.
 * @param {object} elements - Object containing references to DOM elements.
 */
function updateUIState(elements) {
    elements.sendButton.disabled = isProcessingTabs;
    elements.stopProcessingButton.disabled = !isProcessingTabs;

    if (isProcessingTabs) {
        elements.sendButton.textContent = "Sending...";
        elements.sendButton.classList.add("sending");
        elements.stopProcessingButton.classList.remove("hidden-by-default"); // Show stop button
    } else {
        elements.sendButton.textContent = "Send"; // Restore original text
        elements.sendButton.classList.remove("sending");
        elements.stopProcessingButton.classList.add("hidden-by-default"); // Hide stop button
    }
    console.log("[Window Script]: UI state updated. isProcessingTabs:", isProcessingTabs);
}

/**
 * FUNC - Listeners for input text field and save prompt button.
 * @param {object} elements - Object containing references to DOM elements.
 */
function setupInputListeners(elements) {
    console.log("[Window Script]: Setting up input listeners.");

    // Listener for Ctrl/Cmd + Enter to send message
    elements.inputText.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault(); // Prevent default behavior (e.g., new line in textarea)
            elements.sendButton.click(); // Programmatically click the send button
        }
    });

    // Event listener to the save prompt button. When clicked, save the prompt to the storage.
    elements.savePromptButton.addEventListener("click", async () => {
        const text = elements.inputText.value.trim();
        if (!text) return;
        await savePrompt(text);
    });
    console.log("[Window Script]: Input listeners set up.");
}

/**
 * FUNC - Event listeners for data management (export/import) buttons.
 * @param {object} elements - Object containing references to DOM elements.
 */
function setupDataManagementListeners(elements) {
    console.log("[Window Script]: Setting up data management listeners.");

    // Add event listener for export button
    if (elements.exportPromptsButton) {
        elements.exportPromptsButton.addEventListener("click", async () => {
            console.log("[Window Script]: Export button clicked");
            if (
                window.exportImport &&
                typeof window.exportImport.exportSavedPrompts === "function"
            ) {
                const success = await window.exportImport.exportSavedPrompts();
                if (success) {
                    // Visual feedback that export was successful
                    const originalText =
                        elements.exportPromptsButton.textContent;
                    elements.exportPromptsButton.textContent = "Exported ✓";
                    setTimeout(() => {
                        elements.exportPromptsButton.textContent = originalText;
                    }, 2000);
                }
            } else {
                console.error("[Window Script]: Export function not available");
            }
        });
    }

    // Add event listener for import button
    if (elements.importPromptsButton) {
        elements.importPromptsButton.addEventListener("click", async () => {
            console.log("[Window Script]: Import button clicked");

            if (
                window.exportImport &&
                typeof window.exportImport.importSavedPrompts === "function"
            ) {
                // Disable button and change text while importing
                elements.importPromptsButton.disabled = true;
                const originalText = elements.importPromptsButton.textContent;
                elements.importPromptsButton.textContent = "Importing...";

                try {
                    // Call the import function
                    const result =
                        await window.exportImport.importSavedPrompts();
                    console.log("[Window Script]: Import result:", result);

                    if (result.success) {
                        // Show success message with counts
                        elements.importPromptsButton.textContent = `Imported ${result.imported}/${result.total} ✓`;

                        // If in saved prompts panel, refresh the display
                        if (currentPanel === "saved") {
                            await setSavedPromptsPanel();
                        }
                    } else if (result.userCancelled) {
                        // User cancelled the file selection, restore button immediately
                        console.log(
                            "[Window Script]: User cancelled file selection"
                        );
                        elements.importPromptsButton.textContent = originalText;
                        elements.importPromptsButton.disabled = false;
                        return; // Exit early to skip the timeout
                    } else {
                        // Show error message
                        elements.importPromptsButton.textContent = `Error: ${result.error}`;
                        console.error(
                            "[Window Script]: Import error:",
                            result.error
                        );
                    }
                } catch (error) {
                    // Handle unexpected errors
                    console.error("[Window Script]: Import failed:", error);
                    elements.importPromptsButton.textContent = "Import Failed";
                }

                // Re-enable button and restore text after delay
                setTimeout(() => {
                    elements.importPromptsButton.disabled = false;
                    elements.importPromptsButton.textContent = originalText;
                }, 3000);
            } else {
                console.error("[Window Script]: Import function not available");
            }
        });
    }
    console.log("[Window Script]: Data management listeners set up.");
}

/**
 * FUNC - Event listeners for tab list control buttons (sort and update).
 * @param {object} elements - Object containing references to DOM elements.
 */
function setupTabListControlListeners(elements) {
    console.log("[Window Script]: Setting up tab list control listeners.");

    // Add event listener to the sort button. When clicked, change the sort direction and update the tabs list.
    elements.sortButton.addEventListener("click", async () => {
        console.log("[Window Script]: Sort button clicked");

        // Change the sort direction after each click
        sortDirection = sortDirection === "desc" ? "asc" : "desc";
        // Update button text
        elements.sortButton.textContent = sortDirection === "desc" ? " ⇵ Sorted by newest opened" : " ⇵ Sorted by oldest opened";

        // Save the sort direction to storage
        await chrome.storage.local.set({ savedSortDirection: sortDirection });

        // Update the tabs list after changing the sort direction
        await setTabsList();
    });

    // Update button functionality
    elements.updateButton.addEventListener("click", async () => {
        console.log("[Window Script]: Update button clicked");
        await setTabsList();
    });
    console.log("[Window Script]: Tab list control listeners set up.");
}

/**
 * FUNC - Sets up the event listener for the send button.
 * Handles the click event for the send button, processing selected tabs.
 * @param {object} elements - Object containing references to DOM elements.
 * @global
 *
 * When the "Send" button is clicked, this function initiates the process of sending the user's prompt to selected chatbot tabs:
 * 1. Disables the "Send" button and updates its text to indicate processing.
 * 2. Saves the current prompt text to the user's history using @see saveToHistory.
 * 3. Retrieves all currently open tabs and filters them to get only the valid, selected tabs.
 * 4. Iterates through each valid selected tab:
 *    a. Activates the tab using `chrome.tabs.update({ active: true })`.
 *    b. Sends a message to the content script (`src/content.js`) within that tab.
 *       The message contains the action "focusAndFill" and the prompt text.
 *       The content script then handles the interaction with the chatbot's webpage
 *       (finding the text field, inserting text, and attempting to send the message).
 *    c. Introduces a short delay (500ms) before processing the next tab to prevent
 *       overloading the browser or the chatbot sites.
 *    d. Handles any errors that occur during the processing of an individual tab,
 *       displaying them in the UI using @see displayErrorInUI.
 * 5. After all selected tabs have been processed (or attempted), the "Send" button
 *    is re-enabled and its original text is restored.
 */
function setupSendButtonListener(elements) {
    console.log("[Window Script]: Setting up send button listener.");

    elements.sendButton.addEventListener("click", async () => {
        console.log("[Window Script]: Send button clicked");

        // If already processing, do nothing
        if (isProcessingTabs) {
            console.log("[Window Script]: Already processing tabs. Ignoring click.");
            return;
        }

        // Set processing flag to true
        isProcessingTabs = true;

        // Disable send button and enable stop button, show processing state
        elements.sendButton.disabled = true;
        elements.stopProcessingButton.disabled = false;
        // Update UI state at the start of processing
        updateUIState(elements);

        try {
            const text = elements.inputText.value.trim();
            if (!text) {
                console.log("[Window Script]: No text provided. Aborting send.");
                isProcessingTabs = false; // Reset flag if no text
                updateUIState(elements);
                return;
            }

            await saveToHistory(text);

            // Get current tabs and create a Set of valid tab IDs
            const currentTabs = await chrome.tabs.query({});
            const currentTabIds = new Set(currentTabs.map((tab) => tab.id));

            // Get selected tabs directly from the UI checkboxes (to avoid race conditions)
            const selectedCheckboxes = tabsListElement.querySelectorAll('.tab-checkbox:checked');
            const validSelectedTabIds = Array.from(selectedCheckboxes).map(checkbox => Number(checkbox.dataset.tabId));

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
                // Check if processing was cancelled before handling the next tab
                if (!isProcessingTabs) {
                    console.log("[Window Script]: Processing cancelled by user.");
                    break; // If it was cancelled, exit the loop
                }

                try {
                    let tab = null;
                    try {
                        tab = await chrome.tabs.get(tabId);
                    } catch (getError) {
                        console.warn(
                            `[Window Script]: Tab ${tabId} no longer exists or cannot be accessed:`,
                            getError
                        );
                        displayErrorInUI(
                            `Tab ${tabId} no longer exists or cannot be accessed: ${getError.message}`,
                            `chrome-extension://tab-id/${tabId}`,
                            `Tab ${tabId}`
                        );
                        continue; // Skip to next tab
                    }

                    if (!tab) {
                        console.warn(
                            `[Window Script]: Tab ${tabId} no longer exists (after get check).`
                        );
                        displayErrorInUI(
                            `Tab ${tabId} no longer exists.`,
                            `chrome-extension://tab-id/${tabId}`,
                            `Tab ${tabId}`
                        );
                        continue; // Skip to next tab
                    }

                    // Activate the tab
                    try {
                        await chrome.tabs.update(tabId, { active: true });
                        // Get the updated tab object after activation
                        tab = await chrome.tabs.get(tabId); // Re-fetch to get updated status/properties
                    } catch (updateError) {
                        console.error(
                            `[Window Script]: Failed to activate or get updated tab ${tabId}:`,
                            updateError
                        );
                        displayErrorInUI(
                            `Failed to activate tab ${tabId}: ${updateError.message}`,
                            tab.url,
                            tab.title
                        );
                        continue; // Skip to next tab
                    }

                    // Send message to content script with a timeout
                    const MESSAGE_TIMEOUT_MS = 10000; // 10 seconds

                    const messagePromise = chrome.tabs.sendMessage(tabId, {
                        action: "focusAndFill",
                        text: text,
                    });

                    const timeoutPromise = new Promise((resolve, reject) => {
                        const id = setTimeout(() => {
                            clearTimeout(id);
                            reject(new Error("Error: Message to tab timed out."));
                        }, MESSAGE_TIMEOUT_MS);
                    });

                    const response = await Promise.race([messagePromise, timeoutPromise]);

                    // If response is an object with success: false, it's an error from content.js
                    if (response && response.success === false) {
                        throw new Error(response.error || "Unknown error from content script.");
                    }

                    // Add delay between tabs
                    await new Promise((resolve) => setTimeout(resolve, 500));

                    console.log(
                        "[Window Script]: Successfully processed tab:",
                        tab.id,
                        tab.url
                    );
                } catch (error) {
                    console.error(
                        `[Window Script]: Failed to process tab ${tabId}:`,
                        error
                    );
                    displayErrorInUI(
                        `Failed to process tab ${tabId}: ${error.message}`,
                        `chrome-extension://tab-id/${tabId}`,
                        `Tab ${tabId}`
                    );
                }
            }

            // After all tabs are processed, check the setting to clear the input field
            const { clearInputFieldAfterSend = false } =
                await chrome.storage.local.get("clearInputFieldAfterSend");
            if (clearInputFieldAfterSend) {
                elements.inputText.value = ""; // Clear the input field
                console.log("[Window Script]: Input field cleared after sending.");
            }

        } catch (error) {
            console.error(
                "[Window Script]: Error in send button handler:",
                error
            );
        } finally {
            // Reset processing flag
            isProcessingTabs = false;
            // Update UI state at the end of processing
            updateUIState(elements);
        }
    });
    console.log("[Window Script]: Send button listener set up.");
}

/**
 * FUNC - Event listeners for right panel toggle buttons.
 * @param {object} elements - Object containing references to DOM elements.
 */
function setupRightPanelListeners(elements) {
    console.log("[Window Script]: Setting up right panel listeners.");

    elements.supportedSitesButton.addEventListener("click", () =>
        toggleRightPanel("supportedSites", elements.supportedSitesButton)
    );
    elements.historyButton.addEventListener("click", () =>
        toggleRightPanel("history", elements.historyButton)
    );
    elements.savedPromptsButton.addEventListener("click", () =>
        toggleRightPanel("saved", elements.savedPromptsButton)
    );
    elements.settingsButton.addEventListener("click", () =>
        toggleRightPanel("settings", elements.settingsButton)
    );
    console.log("[Window Script]: Right panel listeners set up.");
}

/**
 * FUNC - Loads initial settings from storage and applies them to the UI.
 * Also sets up the change listener for the tab activation setting checkbox.
 * @param {object} elements - Object containing references to DOM elements.
 */
async function loadAndApplyInitialSettings(elements) {
    console.log("[Window Script]: Loading and applying initial settings.");

    // ANCHOR - Load settings
    const {
        areTabsRecentlyUpdated = false,
        savedSortDirection = "desc",
        clearInputFieldAfterSend = false,
        displayTabDateTime: loadedDisplayTabDateTime = false,
        hideUnsupportedTabs = false,
    } = await chrome.storage.local.get([
        "areTabsRecentlyUpdated",
        "savedSortDirection",
        "clearInputFieldAfterSend",
        "displayTabDateTime",
        "hideUnsupportedTabs",
    ]);

    // Apply sort direction from storage
    if (savedSortDirection) {
        sortDirection = savedSortDirection;
    }

    // Set initial button text based on sort direction and activation order setting
    if (areTabsRecentlyUpdated) {
        elements.sortButton.textContent = "⇵ Sorted by newest activated";
    } else {
        elements.sortButton.textContent = sortDirection === "desc" ? "⇵ Sorted by newest opened" : "⇵ Sorted by oldest opened";
    }

    // Disable sort button if "Display tabs in activation order" is enabled
    if (areTabsRecentlyUpdated) {
        console.log("[Window Script]: Tab activation order is enabled");
        elements.sortButton.disabled = true;
        elements.sortButton.classList.add("disabled");
    } else {
        console.log("[Window Script]: Using standard sorting");
        elements.sortButton.disabled = false;
        elements.sortButton.classList.remove("disabled");
    }

    // Display checkbox status from storage for tab activation order
    elements.areTabsRecentlyActivatedCheckbox.checked = areTabsRecentlyUpdated;
    console.log(
        "[Window Script]: Initial 'Display tabs in activation order' setting loaded:",
        areTabsRecentlyUpdated
    );

    displayTabDateTime = loadedDisplayTabDateTime;
    if (elements.displayTabDateTimeCheckbox) {
        elements.displayTabDateTimeCheckbox.checked = displayTabDateTime;
    }
    console.log(
        "[Window Script]: Initial 'Display date in time of tab creation/activation' setting loaded:",
        displayTabDateTime
    );

    if (elements.hideUnsupportedTabsCheckbox) {
        elements.hideUnsupportedTabsCheckbox.checked = hideUnsupportedTabs;
    }
    console.log(
        "[Window Script]: Initial 'Hide unsupported tabs' setting loaded:",
        hideUnsupportedTabs
    );

    // Set up the event handler for the tab activation order checkbox
    elements.areTabsRecentlyActivatedCheckbox.addEventListener(
        "change",
        async (e) => {
            const isEnabled = e.target.checked;

            console.log(
                "[Window Script]: Saving tab activation setting:",
                isEnabled
            );

            try {
                // Update the setting in storage
                await chrome.storage.local.set({
                    areTabsRecentlyUpdated: isEnabled,
                });

                // Verify the setting was saved
                const { areTabsRecentlyUpdated: verifiedSetting } =
                    await chrome.storage.local.get("areTabsRecentlyUpdated");
                console.log(
                    "[Window Script]: Verified saved setting:",
                    verifiedSetting
                );

                console.log(
                    "[Window Script]: Tab activation sorting changed to:",
                    isEnabled
                );

                // Disable sort button if the checkbox is checked
                elements.sortButton.disabled = isEnabled;
                elements.sortButton.classList.toggle("disabled", isEnabled);

                // Update button text based on the new state
                if (isEnabled) {
                    elements.sortButton.textContent = "⇵ Sorted by newest activated";
                } else {
                    elements.sortButton.textContent = sortDirection === "desc" ? "⇵ Sorted by newest opened" : "⇵ Sorted by oldest opened";
                }

                // Re-initialize tab data to ensure activation times are up-to-date
                await initializeTabData();

                // After checkbox status change, update the tabs list
                await setTabsList();
            } catch (error) {
                console.error(
                    "[Window Script]: Error saving setting or updating tabs list:",
                    error
                );
                displayErrorInUI(
                    `Failed to save setting: ${error.message}`,
                    "N/A",
                    "Extension Window"
                );
            }
        }
    );

    // Display checkbox status from storage for clear input field
    elements.clearInputFieldCheckbox.checked = clearInputFieldAfterSend;
    console.log(
        "[Window Script]: Initial 'Clear input field after sending' setting loaded:",
        clearInputFieldAfterSend
    );

    // Set up the event handler for the clear input field checkbox
    elements.clearInputFieldCheckbox.addEventListener("change", async (e) => {
        const isEnabled = e.target.checked;
        console.log(
            "[Window Script]: Saving 'Clear input field after sending' setting:",
            isEnabled
        );
        try {
            await chrome.storage.local.set({ clearInputFieldAfterSend: isEnabled });
            const { clearInputFieldAfterSend: verifiedSetting } =
                await chrome.storage.local.get("clearInputFieldAfterSend");
            console.log(
                "[Window Script]: Verified saved 'Clear input field after sending' setting:",
                verifiedSetting
            );
        } catch (error) {
            console.error(
                "[Window Script]: Error saving 'Clear input field after sending' setting:",
                error
            );
            displayErrorInUI(
                `Failed to save 'Clear input field' setting: ${error.message}`,
                "N/A",
                "Extension Window"
            );
        }
    });

    // Set up the event handler for the display tab date/time checkbox
    if (elements.displayTabDateTimeCheckbox) {
        elements.displayTabDateTimeCheckbox.addEventListener('change', async (e) => {
            displayTabDateTime = e.target.checked;
            console.log(
                "[Window Script]: Saving 'Display date in time of tab creation/activation' setting:",
                displayTabDateTime
            );
            try {
                await chrome.storage.local.set({ displayTabDateTime: displayTabDateTime });
                const { displayTabDateTime: verifiedSetting } =
                    await chrome.storage.local.get("displayTabDateTime");
                console.log(
                    "[Window Script]: Verified saved 'Display date in time of tab creation/activation' setting:",
                    verifiedSetting
                );
                await setTabsList();
            } catch (error) {
                console.error(
                    "[Window Script]: Error saving 'Display date in time of tab creation/activation' setting:",
                    error
                );
                displayErrorInUI(
                    `Failed to save 'Display date/time' setting: ${error.message}`,
                    "N/A",
                    "Extension Window"
                );
            }
        });
    }

    // Set up the event handler for the hide unsupported tabs checkbox
    if (elements.hideUnsupportedTabsCheckbox) {
        elements.hideUnsupportedTabsCheckbox.addEventListener('change', async (e) => {
            const isEnabled = e.target.checked;
            console.log(
                "[Window Script]: Saving 'Hide unsupported tabs' setting:",
                isEnabled
            );
            try {
                await chrome.storage.local.set({ hideUnsupportedTabs: isEnabled });
                const { hideUnsupportedTabs: verifiedSetting } =
                    await chrome.storage.local.get("hideUnsupportedTabs");
                console.log(
                    "[Window Script]: Verified saved 'Hide unsupported tabs' setting:",
                    verifiedSetting
                );
                await setTabsList();
            } catch (error) {
                console.error(
                    "[Window Script]: Error saving 'Hide unsupported tabs' setting:",
                    error
                );
                displayErrorInUI(
                    `Failed to save 'Hide unsupported tabs' setting: ${error.message}`,
                    "N/A",
                    "Extension Window"
                );
            }
        });
    }

    console.log("[Window Script]: Initial settings loaded and applied.");
}

/**
 * FUNC - Event listeners for error message UI elements.
 * @param {object} elements - Object containing references to DOM elements.
 */
function setupErrorHandlingListeners(elements) {
    console.log("[Window Script]: Setting up error handling listeners.");

    // Add event listener for the error message close button
    elements.errorMessageCloseButton.addEventListener("click", () => {
        elements.errorMessageContainer.classList.add("hidden"); // Hide current message
        if (errorQueue.length > 0) {
            errorQueue.shift(); // Remove current error from queue
        }
        displayNextError(); // Display next error if available
    });

    // Listener for copying error message to clipboard on click
    elements.errorMessageText.addEventListener("click", async () => {
        const textToCopy = elements.errorMessageText.textContent;
        try {
            await navigator.clipboard.writeText(textToCopy);
            console.log(
                "[Window Script]: Error message copied to clipboard:",
                textToCopy
            );
        } catch (err) {
            console.error(
                "[Window Script]: Failed to copy error message:",
                err
            );
        }
    });
    console.log("[Window Script]: Error handling listeners set up.");
}

/**
 * FUNC - Initializes and returns references to main UI elements.
 * @returns {object} An object containing references to all necessary DOM elements.
 */
async function initializeUIElements() {
    console.log("[Window Script]: Initializing UI elements.");

    // Initialize tabsListElement
    tabsListElement = document.getElementById("tabsList");

    // Get references to all other elements
    const sendButton = document.getElementById("sendButton");
    const inputText = document.getElementById("inputText");
    const errorMessageContainerElement = document.getElementById(
        "errorMessageContainer"
    );
    const errorMessageTextElement = errorMessageContainerElement.querySelector(
        ".error-message-text"
    );
    const errorMessageCloseButtonElement =
        errorMessageContainerElement.querySelector(
            ".error-message-close-button"
        );
    const savePromptButton = document.getElementById("savePromptButton");
    const sortButton = document.querySelector(".sort-button");
    const exportPromptsButton = document.getElementById("exportPromptsButton");
    const importPromptsButton = document.getElementById("importPromptsButton");
    const updateButton = document.getElementById("updateButton");
    const supportedSitesButton = document.getElementById(
        "openSupportedSitesButton"
    );
    const historyButton = document.getElementById("openHistoryButton");
    const savedPromptsButton = document.getElementById(
        "openSavedPromptsButton"
    );
    const settingsButton = document.getElementById("openSettingsButton");
    const stopProcessingButton = document.getElementById("stopProcessingButton");
    const areTabsRecentlyActivatedCheckbox = document.getElementById(
        "recentlyUpdatedCheckbox"
    );
    const clearInputFieldCheckbox = document.getElementById(
        "clearInputFieldCheckbox"
    );
    const displayTabDateTimeCheckbox = document.getElementById(
        "displayTabDateTimeCheckbox"
    );
    const hideUnsupportedTabsCheckbox = document.getElementById(
        "hideUnsupportedTabsCheckbox"
    );

    console.log("[Window Script]: UI elements initialized.");

    return {
        tabsListElement,
        sendButton,
        inputText,
        errorMessageContainer: errorMessageContainerElement,
        errorMessageText: errorMessageTextElement,
        errorMessageCloseButton: errorMessageCloseButtonElement,
        savePromptButton,
        sortButton,
        exportPromptsButton,
        importPromptsButton,
        updateButton,
        supportedSitesButton,
        historyButton,
        savedPromptsButton,
        settingsButton,
        areTabsRecentlyActivatedCheckbox,
        clearInputFieldCheckbox,
        stopProcessingButton,
        displayTabDateTimeCheckbox,
        hideUnsupportedTabsCheckbox,
    };
}

/**
 * FUNC - Helper function for initializing tab data.
 * Retrieves and cleans up tab activation times from local storage.
 * Ensures that only data for currently existing tabs is kept.
 * @returns {Promise<object>} A promise that resolves with the updated tab activation times object.
 */
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

        // Assign a timestamp "0" for tabs that don't have activation times. This ensures they appear at the end when sorting by most recent (desc)
        tabs.forEach((tab) => {
            if (!(tab.id in tabActivationTimes)) {
                // Check if the key exists
                tabActivationTimes[tab.id] = 0;
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

//SECTION - UI Panel Functions

//SECTION - Main panel functions

/**
 * FUNC - Handles tab activation events.
 * Updates the activation timestamp for the newly active tab in local storage
 * and refreshes the displayed tabs list.
 * @param {object} activeInfo - Information about the tab that was activated.
 * @param {number} activeInfo.tabId - The ID of the tab that became active.
 */
async function handleTabActivatedChromeAPI(activeInfo) {
    console.log("[Window Script]: Tab activated:", activeInfo.tabId);
    try {
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
    } catch (error) {
        console.error(
            "[Window Script]: Error in tab activation listener:",
            error
        );
        displayErrorInUI(
            `Failed to update tab activation data: ${error.message}`,
            "N/A",
            "Extension Window"
        );
    }
}

chrome.tabs.onActivated.addListener(handleTabActivatedChromeAPI);

/**
 * FUNC - Handles tab creation events.
 * Refreshes the displayed tabs list when a new tab is created.
 */
async function handleTabCreatedChromeAPI() {
    console.log("[Window Script]: Tab created");
    try {
        await setTabsList();
    } catch (error) {
        console.error(
            "[Window Script]: Error in tab creation listener:",
            error
        );
        displayErrorInUI(
            `Failed to update tabs list on tab creation: ${error.message}`,
            "N/A",
            "Extension Window"
        );
    }
}

chrome.tabs.onCreated.addListener(handleTabCreatedChromeAPI);

/**
 * FUNC - Handles tab removal events.
 * Cleans up stored data (selected tabs, activation times) for the removed tab
 * and refreshes the displayed tabs list.
 * @param {number} tabId - The ID of the tab that was removed.
 */
async function handleTabRemovedChromeAPI(tabId) {
    console.log("[Window Script]: Tab removed:", tabId);
    try {
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
    } catch (error) {
        console.error("[Window Script]: Error in tab removal listener:", error);
        displayErrorInUI(
            `Failed to clean up tab data: ${error.message}`,
            "N/A",
            "Extension Window"
        );
    }
}

chrome.tabs.onRemoved.addListener(handleTabRemovedChromeAPI);

/**
 * FUNC - Handles tab update events (e.g., URL changes, loading status).
 * Refreshes the displayed tabs list when a tab's status becomes "complete" or its URL changes.
 * @param {number} tabId - The ID of the tab that was updated.
 * @param {object} changeInfo - An object containing details about the changes to the tab.
 * @param {string} [changeInfo.status] - The tab's loading status (e.g., "complete").
 * @param {string} [changeInfo.url] - The tab's new URL.
 * @param {Tab} tab - The updated tab object.
 */
async function handleTabUpdatedChromeAPI(tabId, changeInfo, tab) {
    // Only update when the tab is fully loaded or URL changes
    if (changeInfo.status === "complete" || changeInfo.url) {
        console.log("[Window Script]: Tab updated:", tabId);
        try {
            await setTabsList();
        } catch (error) {
            console.error(
                "[Window Script]: Error in tab update listener:",
                error
            );
            displayErrorInUI(
                `Failed to update tabs list on tab update: ${error.message}`,
                tab.url,
                tab.title
            );
        }
    }
}

chrome.tabs.onUpdated.addListener(handleTabUpdatedChromeAPI);

/**
 * FUNC - Function to set the tabs list.
 * Retrieves all current tabs, filters out the extension's own window,
 * cleans up stored selected tab data, sorts the tabs based on user settings,
 * and dynamically creates/updates the tab list in the UI.
 */
async function setTabsList() {
    if (isUpdatingTabsList) {
        console.log("[Window Script]: setTabsList already in progress. Skipping.");
        return;
    }
    isUpdatingTabsList = true;
    try {
        console.log("[Window Script]: setTabsList called");
        // Get current settings
        const { areTabsRecentlyUpdated = false } =
            await chrome.storage.local.get("areTabsRecentlyUpdated");
        console.log(
            "[Window Script]: Tab activation order enabled:",
            areTabsRecentlyUpdated
        );

        const tabs = await chrome.tabs.query({});
        const currentTabIds = new Set(tabs.map((tab) => tab.id));

        // Request tab creation times from background script via port
        const tabCreationTimes = await requestTabCreationTimes();

        // Get the URL of the extension's window
        const extensionWindowUrl = chrome.runtime.getURL("src/window.html");
        console.log(
            "[Window Script]: Extension window URL:",
            extensionWindowUrl
        );

        // Get current settings
        const { hideUnsupportedTabs = false } =
            await chrome.storage.local.get("hideUnsupportedTabs");
        console.log(
            "[Window Script]: Hide unsupported tabs setting enabled:",
            hideUnsupportedTabs
        );

        // Filter out the extension's own window and optionally unsupported tabs from the list of tabs
        const filteredTabs = tabs.filter(
            (tab) => tab.url !== extensionWindowUrl && (!hideUnsupportedTabs || isSupportedUrl(tab.url))
        );

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

        // Get current checkbox states from DOM before clearing
        const currentDomSelectedTabs = {};
        const existingCheckboxes =
            tabsListElement.querySelectorAll(".tab-checkbox");
        existingCheckboxes.forEach((checkbox) => {
            const tabId = Number(checkbox.dataset.tabId);
            if (checkbox.checked) {
                currentDomSelectedTabs[tabId] = true;
            }
        });

        // Merge stored selectedTabs with current DOM selectedTabs
        // DOM state takes precedence for currently displayed tabs
        const mergedSelectedTabs = {
            ...cleanedSelectedTabs,
            ...currentDomSelectedTabs,
        };

        await chrome.storage.local.set({ selectedTabs: mergedSelectedTabs });

        // Clear the current list
        tabsListElement.innerHTML = "";

        // Sort the *filtered* tabs
        const sortedTabs = await sortTabs(filteredTabs);

        // Create tab items
        sortedTabs.forEach((tab) => {
            const tabItem = createTabItem(tab, tabCreationTimes[tab.id], mergedSelectedTabs, areTabsRecentlyUpdated);
            tabsListElement.appendChild(tabItem);
        });
    } catch (error) {
        console.error("[Window Script]: Error in setTabsList:", error);
        displayErrorInUI(
            `Failed to update tabs list: ${error.message}`,
            "N/A",
            "Extension Window"
        );
    } finally {
        isUpdatingTabsList = false;
    }
}

/**
 * FUNC - Creates a single tab item in DOM.
 * This function will be modified to include and manage the date/time element.
 * @param {object} tab - The Chrome tab object.
 * @param {number} tabCreationTimestamp - The creation timestamp for the tab.
 * @param {object} mergedSelectedTabs - Object containing selected tab IDs.
 * @returns {HTMLElement} The created tab item element.
 */
function createTabItem(tab, tabCreationTimestamp, mergedSelectedTabs, areTabsRecentlyUpdated) {
    const tabItem = document.createElement("div");
    tabItem.className = "tab-item";

    const isSupported = isSupportedUrl(tab.url);
    tabItem.classList.add(isSupported ? "supported" : "unsupported");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "tab-checkbox";
    // Use the merged state for setting the checkbox's checked status
    checkbox.checked =
        isSupported && (mergedSelectedTabs[tab.id] || false);
    checkbox.dataset.tabId = tab.id;
    checkbox.disabled = !isSupported;

    const title = document.createElement("div");
    title.className = "tab-title";
    title.title = tab.title;
    title.textContent = tab.title;

    const urlLink = document.createElement("a");
    urlLink.className = "tab-url-link";
    urlLink.href = tab.url;
    urlLink.textContent = tab.url;
    urlLink.title = tab.url;
    urlLink.target = "_blank";

    urlLink.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            await chrome.tabs.update(tab.id, { active: true });
            await chrome.windows.update(tab.windowId, { focused: true });
            console.log(`[Window Script]: Activated tab ${tab.id}: ${tab.url}`);
        } catch (error) {
            console.error(`[Window Script]: Failed to activate tab ${tab.id}:`, error);
            displayErrorInUI(
                `Failed to activate tab ${tab.title}: ${error.message}`,
                tab.url,
                tab.title
            );
        }
    });

    const favicon = document.createElement("img");
    favicon.className = "tab-favicon";
    favicon.src =
        tab.favIconUrl || chrome.runtime.getURL("icons/globe.svg");
    favicon.alt = `${tab.title} icon`;

    // Error handling for favicon
    favicon.onerror = () => {
        console.log(
            `[Window Script]: Failed to load favicon for tab ${tab.id}. Using placeholder.`
        );
        favicon.src = chrome.runtime.getURL("icons/globe.svg"); // Ensure placeholder is loaded correctly
    };

    const tabInfo = document.createElement("div");
    tabInfo.className = "tab-info";
    tabInfo.appendChild(title);
    tabInfo.appendChild(urlLink);

    // Create and manage date/time element
    const dateTimeSpan = document.createElement('span');
    dateTimeSpan.className = 'tab-date-time'; // Apply base style class

    let timestampToDisplay = 0;
    if (areTabsRecentlyUpdated) {
        timestampToDisplay = tab.lastAccessed;
    } else {
        timestampToDisplay = tabCreationTimestamp;
    }

    // Format and set text
    const formattedDateTime = formatDateTime(timestampToDisplay);
    dateTimeSpan.textContent = formattedDateTime;

    // Manage visibility based on settings and data
    if (displayTabDateTime && formattedDateTime) {
        dateTimeSpan.classList.remove('hidden-by-default');
    } else {
        dateTimeSpan.classList.add('hidden-by-default');
    }

    tabItem.appendChild(checkbox);
    tabItem.appendChild(favicon);
    tabItem.appendChild(tabInfo);
    tabItem.appendChild(dateTimeSpan);

    if (isSupported) {
        tabItem.addEventListener("click", async (event) => {
            // Prevent the click event from propagating if the click was directly on the checkbox or the URL link
            if (event.target === checkbox || event.target === urlLink) {
                return;
            }

            // Toggle the checkbox state
            checkbox.checked = !checkbox.checked;

            // Update storage based on the new checkbox state
            try {
                const { selectedTabs = {} } =
                    await chrome.storage.local.get("selectedTabs");
                if (checkbox.checked) {
                    selectedTabs[tab.id] = true;
                } else {
                    delete selectedTabs[tab.id];
                }
                await chrome.storage.local.set({ selectedTabs });
            } catch (error) {
                console.error(
                    `[Window Script]: Error updating selected tabs for tab ${tab.id}:`,
                    error
                );
                displayErrorInUI(
                    `Failed to update selected tab state for ${tab.title}: ${error.message}`,
                    tab.url,
                    tab.title
                );
            }
        });
    }

    return tabItem;
}

/**
 * FUNC - Function for sorting tabs.
 * Sorts an array of tab objects based on user preferences.
 * Can sort by activation time (most recent first) or by tab ID (ascending/descending).
 * @param {Tab[]} tabs - An array of tab objects to be sorted.
 * @returns {Promise<Tab[]>} A promise that resolves with the sorted array of tab objects.
 */
async function sortTabs(tabs) {
    try {
        const { areTabsRecentlyUpdated } = await chrome.storage.local.get(
            "areTabsRecentlyUpdated"
        );

        if (areTabsRecentlyUpdated) {
            // Sort by activation time (most recent first)
            console.log(
                "[Window Script]: Sorting by activation time (most recent first)."
            );
            const activationTimes = tabActivationTimes || {};

            // Create a map for quick time lookup, defaulting to 0 if not found
            const tabTimeMap = new Map();
            tabs.forEach((tab) => {
                const time = activationTimes[tab.id] || 0;
                tabTimeMap.set(tab.id, time);
                // console.log(`[Window Script]: Tab ${tab.id} mapped time:`, new Date(time).toISOString()); //NOTE - Commented out to avoid spamming the console
            });

            return [...tabs].sort((a, b) => {
                const timeA = tabTimeMap.get(a.id);
                const timeB = tabTimeMap.get(b.id);
                // Sort primarily by time descending, secondarily by ID descending for stability
                return timeB - timeA || b.id - a.id;
            });
        } else {
            // Sort by tab ID using the selected direction
            console.log(
                `[Window Script]: Sorting by ID. Direction: ${sortDirection}`
            );
            return [...tabs].sort((a, b) =>
                sortDirection === "desc" ? b.id - a.id : a.id - b.id
            );
        }
    } catch (error) {
        console.error("[Window Script]: Error in sortTabs:", error);
        throw error; // Re-throw to be caught by caller
    }
}

//!SECTION - Main panel functions

//SECTION - Right panel functions

/**
 * FUNC - Function to toggle the right panel.
 * Toggles the visibility of the right panel and displays the specified section.
 * Manages active button states and loads content for the selected panel.
 * @param {string} panelType - The type of panel to display ("supportedSites", "history", "saved", "settings").
 * @param {HTMLElement} button - The button element that triggered the toggle.
 */
async function toggleRightPanel(panelType, button) {
    const topContainer = document.querySelector(".top-container");
    const rightPanel = document.getElementById("rightPanel");
    const sections = rightPanel.querySelectorAll(".panel-section");

    // If the panel is already visible and the same button is clicked, hide the panel
    if (activeButton === button) {
        topContainer.classList.remove("right-panel-active");
        button.classList.remove("active");
        // Hide all sections when panel is closed
        sections.forEach((section) => (section.style.display = "none"));
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
    sections.forEach((section) => (section.style.display = "none"));

    // Show the target section and load its content
    let targetSection;
    switch (panelType) {
        case "supportedSites":
            targetSection = document.getElementById("supportedSitesSection");
            await setSupportedSitesPanel();
            break;
        case "history":
            targetSection = document.getElementById("historySection");
            await setHistoryPanel();
            break;
        case "saved":
            targetSection = document.getElementById("savedPromptsSection");
            await setSavedPromptsPanel();
            break;
        case "settings":
            targetSection = document.getElementById("settingsSection");
            await setSettingsPanel();
            break;
    }

    if (targetSection) {
        targetSection.style.display = "block";
    }

    // Ensure the main right panel is visible
    topContainer.classList.add("right-panel-active");
}

//SECTION - Supported Sites Functions

/**
 * FUNC - Function to set the supported sites panel.
 * Populates the "Supported Sites" panel with a list of supported chatbot websites.
 * Displays site names, links, and favicons.
 */
async function setSupportedSitesPanel() {
    // Target the specific container for supported sites
    const supportedSitesContainer = document.getElementById(
        "supportedSitesContainer"
    );
    if (!supportedSitesContainer) {
        console.error("[Window Script]: Supported sites container not found!");
        return;
    }

    // Clear the container
    supportedSitesContainer.innerHTML = "";

    const sitesEntries = Object.entries(SUPPORTED_SITES_LINKS);
    if (sitesEntries.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "empty-supported-sites";
        emptyMessage.textContent = "No supported sites";
        supportedSitesContainer.appendChild(emptyMessage);
    } else {
        // Create list of supported sites
        sitesEntries.forEach(([name, url]) => {
            const siteItem = document.createElement("div");
            siteItem.className = "supported-site-item";

            // Extract domain for favicon
            const urlObj = new URL(url);
            const domain = urlObj.hostname;

            // Create favicon element
            const favicon = document.createElement("img");
            favicon.className = "supported-site-icon";
            favicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
            favicon.alt = `${name} icon`;
            favicon.width = 20;
            favicon.height = 20;
            favicon.onerror = () => {
                // If favicon fails to load, use a generic icon
                favicon.src = chrome.runtime.getURL("icons/globe.svg");
                console.log(
                    `[Window Script]: Failed to load favicon for ${domain}. Using placeholder.`
                );
            };

            const siteText = document.createElement("a");
            siteText.className = "supported-site-text";
            siteText.textContent = name;
            siteText.href = url;
            siteText.target = "_blank";
            siteText.title = `Open ${name}`;

            // Add favicon and text to the item
            siteItem.appendChild(favicon);
            siteItem.appendChild(siteText);
            supportedSitesContainer.appendChild(siteItem);
        });
    }
}

//!SECTION - Supported Sites Functions

//SECTION - History Functions

/**
 * FUNC - Function to set the history panel.
 * Populates the "History" panel with the user's past prompts.
 * Displays prompt text, timestamp, and provides a delete option.
 */
async function setHistoryPanel() {
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

            const textAndDateContainer = document.createElement("div");
            textAndDateContainer.className = "history-text-and-date-container";

            const textContainer = document.createElement("div");
            textContainer.className = "history-text";
            textContainer.textContent = item.text;
            textContainer.title = item.text;

            const dateContainer = document.createElement("div");
            dateContainer.className = "history-date";
            dateContainer.textContent = formatDate(item.timestamp);

            textAndDateContainer.appendChild(textContainer);
            textAndDateContainer.appendChild(dateContainer);

            const saveButton = document.createElement("button");
            saveButton.className = "history-save";
            saveButton.innerHTML = "☆";
            saveButton.title = "Save prompt";

            saveButton.addEventListener("click", async (e) => {
                e.stopPropagation();
                await savePrompt(item.text);
                saveButton.innerHTML = "✓"; // Change to checkmark for 1.5 seconds
                setTimeout(() => {
                    saveButton.innerHTML = "☆";
                }, 1500);
            });

            const deleteButton = document.createElement("button");
            deleteButton.className = "history-delete";
            deleteButton.innerHTML = "✕";
            deleteButton.title = "Remove from history";

            deleteButton.addEventListener("click", async (e) => {
                e.stopPropagation();

                // Show confirmation dialog
                const confirmed = confirm(
                    "Are you sure you want to delete this history item?"
                );

                if (confirmed) {
                    const { requestHistory = [] } =
                        await chrome.storage.local.get("requestHistory");
                    const updatedHistory = requestHistory.filter(
                        (h) => h.id !== item.id
                    );
                    await chrome.storage.local.set({
                        requestHistory: updatedHistory,
                    });
                    // Re-render the history panel content
                    setHistoryPanel();
                }
            });

            // Create a container for the save and delete buttons
            const historyButtonsContainer = document.createElement("div");
            historyButtonsContainer.className = "history-buttons-container";
            historyButtonsContainer.appendChild(saveButton);
            historyButtonsContainer.appendChild(deleteButton);

            historyItem.appendChild(textAndDateContainer);
            historyItem.appendChild(historyButtonsContainer);

            // When clicked, copy the text to the input field
            historyItem.addEventListener("click", () => {
                const inputText = document.getElementById("inputText");
                inputText.value = item.text;
            });

            historyContainer.appendChild(historyItem);
        });
    }
}

//!SECTION - History Functions

//SECTION - Saved Prompts Functions

/**
 * FUNC - Function to set the saved prompts panel.
 * Populates the "Saved Prompts" panel with the user's saved prompts.
 * Displays prompt text, timestamp, and provides a delete option.
 */
async function setSavedPromptsPanel() {
    // Target the specific container for saved prompts
    const savedPromptsContainer = document.getElementById(
        "savedPromptsContainer"
    );
    if (!savedPromptsContainer) {
        console.error("[Window Script]: Saved prompts container not found!");
        return;
    }

    const { savedPrompts = [] } = await chrome.storage.local.get(
        "savedPrompts"
    ); // Get the saved prompts from storage

    // Clear only the saved prompts container's content
    savedPromptsContainer.innerHTML = "";

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

                // Show confirmation dialog
                const confirmed = confirm(
                    "Are you sure you want to delete this saved prompt?"
                );

                if (confirmed) {
                    const { savedPrompts = [] } =
                        await chrome.storage.local.get("savedPrompts");
                    const updatedPrompts = savedPrompts.filter(
                        (p) => p.id !== prompt.id
                    );
                    await chrome.storage.local.set({
                        savedPrompts: updatedPrompts,
                    });
                    // Re-render the saved prompts panel content
                    setSavedPromptsPanel();
                }
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
}

// Expose the setSavedPromptsPanel function to window for use in the export-import module
window.setSavedPromptsPanel = setSavedPromptsPanel;

//!SECTION - Saved Prompts Functions

//SECTION - Settings Functions

/**
 * FUNC - Function to set the settings panel.
 * Initializes and manages the "Settings" panel.
 * Handles the checkbox for "Display tabs in activation order" and updates related UI elements.
 * @returns {Promise<void>}
 */
async function setSettingsPanel() {
    try {
        // Target the existing checkbox in HTML
        const areTabsRecentlyActivatedCheckbox = document.getElementById(
            "recentlyUpdatedCheckbox"
        );

        // Display checkbox status from storage
        const { areTabsRecentlyUpdated } = await chrome.storage.local.get(
            "areTabsRecentlyUpdated"
        );
        console.log(
            "[Window Script]: Loading initial setting value:",
            areTabsRecentlyUpdated
        );
        areTabsRecentlyActivatedCheckbox.checked = areTabsRecentlyUpdated;
    } catch (error) {
        console.error("[Window Script]: Error loading initial setting:", error);
        displayErrorInUI(
            `Failed to load settings: ${error.message}`,
            "N/A",
            "Extension Window"
        );
    }
}

//!SECTION - Settings Functions

//!SECTION - Right panel functions

//SECTION - Bottom panel functions

/**
 * FUNC - Function to save the prompt to history.
 * Saves a given text prompt to the user's request history in local storage.
 * Limits the history to a maximum number of items.
 * @param {string} text - The prompt text to save.
 */
async function saveToHistory(text) {
    try {
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

        // Update the history panel if it is currently active using updateHistoryPanel function
        if (currentPanel === "history") {
            await setHistoryPanel();
        }
    } catch (error) {
        console.error("[Window Script]: Error saving to history:", error);
        displayErrorInUI(
            `Failed to save to history: ${error.message}`,
            "N/A",
            "Extension Window"
        );
    }
}

/**
 * FUNC - Function to save the prompt to the saved prompts.
 * Saves a given text prompt to the user's saved prompts in local storage.
 * @param {string} text - The prompt text to save.
 */
async function savePrompt(text) {
    try {
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

        // Update the saved prompts panel if it is currently active using updateSavedPromptsPanel function
        if (currentPanel === "saved") {
            await setSavedPromptsPanel();
        }
    } catch (error) {
        console.error("[Window Script]: Error saving prompt:", error);
        displayErrorInUI(
            `Failed to save prompt: ${error.message}`,
            "N/A",
            "Extension Window"
        );
    }
}

//SECTION - Error handling functions

/**
 * FUNC - Adds an error message to the queue and attempts to display it.
 * @param {string} message - The error message.
 * @param {string} url - The URL of the tab where the error occurred.
 * @param {string} title - The title of the tab where the error occurred.
 */
function displayErrorInUI(message, url, title) {
    // Format the message, URL will be truncated by CSS
    const errorText = `Error on ${title} (${url}): ${message}`;
    errorQueue.push(errorText);
    console.log("[Window Script]: Error added to queue:", errorText);
    if (
        errorMessageContainer &&
        errorMessageContainer.classList.contains("hidden")
    ) {
        displayNextError();
    }
}

/**
 * FUNC - Displays the next error from the queue.
 * If the queue is empty, hides the error message container.
 */
function displayNextError() {
    if (errorQueue.length > 0) {
        const currentErrorText = errorQueue[0];
        errorMessageText.textContent = currentErrorText; // Display the first error
        errorMessageText.title = currentErrorText; // Set tooltip with full error text
        errorMessageContainer.classList.remove("hidden"); // Make container visible
        console.log("[Window Script]: Displaying error:", currentErrorText);
    } else {
        errorMessageText.textContent = ""; // Clear text when no errors
        errorMessageText.title = ""; // Clear tooltip
        errorMessageContainer.classList.add("hidden"); // If queue is empty, hide container
        console.log("[Window Script]: Error queue is empty, hiding container.");
    }
}

//!SECTION - Error handling functions
//!SECTION - Bottom panel functions
//!SECTION - UI Panel Functions
//SECTION - Utility Functions

/**
 * FUNC - Establishes a long-lived connection to the background script.
 * Sets up message listeners for the port.
 */
function connectToBackgroundScript() {
    console.log('[Window Script]: Attempting to connect to background script...');
    backgroundPort = chrome.runtime.connect({ name: 'extension_window_port' });
    console.log('[Window Script]: Port connection initiated.');

    backgroundPort.onMessage.addListener((message) => {
        console.log(`[Window Script]: Message received on port from background script. Action: ${message.action}`);
        if (message.action === 'tabCreationTimesResponse') {
            // This message is handled by the promise in requestTabCreationTimes
        } else if (message.action === 'error') {
            console.error('[Window Script]: Error from background script:', message.message, message.error);
            displayErrorInUI(
                `Background script error: ${message.message} - ${message.error}`,
                "N/A",
                "Extension Window"
            );
        }
    });

    backgroundPort.onDisconnect.addListener(() => {
        console.warn('[Window Script]: Port disconnected from background script. Attempting to reconnect...');
        backgroundPort = null;
        // Attempt to reconnect after a short delay
    setTimeout(connectToBackgroundScript, 1000);
});
}

/**
 * FUNC - Sends a keep-alive message to the background script to prevent it from becoming inactive.
 */
function sendKeepAliveMessage() {
    if (backgroundPort) {
        try {
            backgroundPort.postMessage({ action: 'keepAlive' });
            console.log('[Window Script]: Sent keep-alive message to background script.');
        } catch (error) {
            console.warn('[Window Script]: Error sending keep-alive message, port might be disconnected:', error);
        }
    } else {
        console.warn('[Window Script]: No active port to send keep-alive message. Attempting to reconnect...');
        connectToBackgroundScript();
    }
}

// Set up a periodic keep-alive message every 30 seconds
setInterval(sendKeepAliveMessage, 30000);

/**
 * FUNC - Requests tab creation times from the background script via the long-lived port.
 * @returns {Promise<object>} A promise that resolves with the tab creation times.
 */
async function requestTabCreationTimes() {
    return new Promise((resolve, reject) => {
        if (!backgroundPort) {
            console.error('[Window Script]: No active port to background script. Cannot send message.');
            displayErrorInUI(
                `Failed to get tab data: No connection to background script.`,
                "N/A",
                "Extension Window"
            );
            return reject(new Error('No active port to background script.'));
        }

        const listener = (message) => {
            if (message.action === 'tabCreationTimesResponse') {
                console.log('[Window Script]: Received tab creation times response.');
                backgroundPort.onMessage.removeListener(listener);
                resolve(message.tabCreationTimes);
            } else if (message.action === 'error') {
                console.error('[Window Script]: Error response for tab creation times request:', message.message);
                backgroundPort.onMessage.removeListener(listener);
                reject(new Error(message.message));
            }
        };

        backgroundPort.onMessage.addListener(listener);
        console.log('[Window Script]: Sending getTabCreationTimes message to background script.');
        backgroundPort.postMessage({ action: 'getTabCreationTimes' });
    });
}

/**
 * FUNC - Formats a timestamp into "HH:MM DD.MM.YYYY" string.
 * @param {number} timestamp - The timestamp to format.
 * @returns {string} Formatted date and time string, or empty string if timestamp is invalid/zero.
 */
function formatDateTime(timestamp) {
    // Check for invalid or zero timestamp
    if (!timestamp || timestamp === 0) {
        return '';
    }
    const date = new Date(timestamp);
    // Use Intl.DateTimeFormat for robust formatting
    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    const dateOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };

    const timePart = new Intl.DateTimeFormat('ru-RU', timeOptions).format(date);
    const datePart = new Intl.DateTimeFormat('ru-RU', dateOptions).format(date);

    return `${timePart} ${datePart}`;
}

/**
 * FUNC - Utility function to format the date.
 * Utility function to format an ISO date string into a "YYYY.MM.DD HH:MM" format.
 * @param {string} isoString - The ISO 8601 date string to format.
 * @returns {string} The formatted date string.
 */
function formatDate(isoString) {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}.${month}.${day} ${hours}:${minutes}`;
}

/**
 * FUNC - Function to check if the URL is supported.
 * Checks if a given URL is a supported chatbot site.
 * Compares the hostname of the URL against a predefined list of supported sites.
 * @param {string} url - The URL to check.
 * @returns {boolean} True if the URL's hostname is in the list of supported sites, false otherwise.
 */
function isSupportedUrl(url) {
    try {
        // Check if the URL includes any of the supported site strings
        return SUPPORTED_SITES.some((supportedSite) =>
            url.includes(supportedSite)
        );
    } catch (e) {
        // Handle invalid URLs
        console.error("[Window Script]: Invalid URL:", url, e);
        return false;
    }
}

//!SECTION - Utility Functions
