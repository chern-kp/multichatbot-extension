//This file is injected into the webpage by the function processTab() in window.js

// Set a global marker to indicate that the script has been loaded
if (window.__contentScriptLoaded) {
    console.log("[content.js] Script already loaded, skipping initialization");
} else {
    window.__contentScriptLoaded = true;
    console.log("[content.js] Script loaded and running!");

    const siteHandlers = {
        "gemini.google.com": handleGemini,
        "aistudio.google.com": handleAistudio,
        "google.com": handleGoogle,
        "chatgpt.com": handleChatGPT,
        "claude.ai": handleClaude,
        "apps.abacus.ai/chatllm": handleAbacusChat,
        "chat.deepseek.com": handleDeepSeek,
        "huggingface.co/chat": handleHuggingFace,
        "perplexity.ai": handlePerplexity,
        "poe.com": handlePoe,
        "grok.com": handleGrokCom,
    };

    //SECTION - Utility functions for handlers
    /**
     * FUNC - Step 1. Finds the first matching text field element from a list of CSS selectors.
     * @param {string[]} selectors - An array of CSS selectors to search for the text field.
     * @returns {HTMLElement|null} The found text field element or null if not found.
     */
    function findTextFieldElement(selectors) {
        console.log(
            "[content.js] Attempting to find text field with selectors:",
            selectors
        );

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                // Log which selector worked
                console.log(
                    `[content.js] Text field found with selector: "${selector}"`,
                    element
                );
                return element; // Return the first found element
            }
        }

        // Log if the field is not found
        console.log(
            "[content.js] Text field not found with any of the selectors."
        );
        throw new Error("Error: Text field not found for current site.");
    }

    /**
     * FUNC - Step 2. Sets the value of a text field element and dispatches necessary events.
     * Supports TEXTAREA, INPUT, and content editable elements.
     * @param {HTMLElement} element - The text field element to set the value for.
     * @param {string} text - The text to set in the field.
     * @returns {boolean} True if the text was set successfully, false otherwise.
     */
    function setTextFieldValue(element, text) {
        const preparedText = text || "";
        let success = false;

        // Ensure the element is focused before setting its value
        element.focus();

        console.log(
            `[content.js] Attempting to set text for element:`,
            element,
            `with text: "${preparedText}"`
        );

        if (element.nodeName === "TEXTAREA") {
            try {
                // Attempt to use the native setter for better compatibility with frameworks like React
                const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    "value"
                ).set;
                nativeTextareaSetter.call(element, preparedText);
                console.log(
                    "[content.js] Set text using HTMLTextAreaElement.prototype.value setter."
                );
                success = true;
            } catch (e) {
                console.warn(
                    "[content.js] Failed to use native textarea setter, falling back to direct assignment.",
                    e
                );
                // Fallback to direct assignment
                element.value = preparedText;
                success = true; // Assume success with direct assignment
            }
        } else if (element.nodeName === "INPUT") {
            try {
                // Attempt to use the native setter for better compatibility with frameworks like React
                const nativeInputSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value"
                ).set;
                nativeInputSetter.call(element, preparedText);
                console.log(
                    "[content.js] Set text using HTMLInputElement.prototype.value setter."
                );
                success = true;
            } catch (e) {
                console.warn(
                    "[content.js] Failed to use native input setter, falling back to direct assignment.",
                    e
                );
                // Fallback to direct assignment
                element.value = preparedText;
                success = true; // Assume success with direct assignment
            }
        } else if (element.isContentEditable) {
            element.innerHTML = ""; // Clear previous content
            element.textContent = preparedText;
            console.log(
                "[content.js] Set text using element.textContent (for contenteditable)."
            );
            success = true;
        } else {
            try {
                element.textContent = preparedText;
                console.log(
                    "[content.js] Set text using element.textContent (fallback)."
                );
                success = true;
            } catch (e) {
                console.error(
                    "[content.js] Failed to set text for element. Unknown element type or read-only.",
                    element,
                    e
                );
                success = false;
            }
        }

        // Dispatch events if text was set successfully
        if (success) {
            try {
                element.dispatchEvent(
                    new Event("input", { bubbles: true, cancelable: true })
                );
                element.dispatchEvent(new Event("change", { bubbles: true }));
                console.log(
                    "[content.js] Dispatched 'input' (cancelable) and 'change' events."
                );
            } catch (e) {
                console.error("[content.js] Error dispatching events:", e);
                // Throw error if events cannot be dispatched
                throw new Error(`Unexpected error: Failed to dispatch events for text field: ${e.message}`);
            }
        } else {
            // Throw error if text was not set successfully
            throw new Error("Unexpected error: Failed to set text value for current site.");
        }
        return success;
    }

    /**
     * FUNC - Step 3. Finds the first matching send button element from a list of CSS selectors.
     * @param {string[]} selectors - An array of CSS selectors to search for the send button.
     * @param {HTMLElement|null} [container=null] - The element within which to search. Defaults to the whole document.
     * @returns {HTMLElement} The found send button element.
     * @throws {Error} If the send button is not found with any of the provided selectors.
     */
    function findSendButtonElement(selectors, container = null) {
        console.log(
            "[content.js] Attempting to find send button with selectors:",
            selectors,
            "within container:",
            container
        );

        // Determine the search context (either the provided container or the whole document)
        const searchContext =
            container instanceof HTMLElement ? container : document;

        for (const selector of selectors) {
            // Use the determined searchContext for querySelector
            const element = searchContext.querySelector(selector);
            if (element) {
                console.log(
                    `[content.js] Text field found with selector: "${selector}"`,
                    element
                );
                return element; // Return the first found element
            }
        }
        console.log(
            "[content.js] Text field not found with any of the selectors."
        );
        throw new Error("Error: Send button not found for current site.");
    }

    /**
     * FUNC - Step 4. Attempts to submit a message by finding and clicking a send button,
     * with a fallback to simulating an Enter key press if the button is not found or clickable.
     * It retries finding the button multiple times.
     * @param {HTMLElement} textFieldElement - The text field element where the message was entered.
     * @param {string[]} buttonSelectors - An array of CSS selectors for the send button.
     * @param {boolean} [useEnterFallback=true] - Whether to simulate Enter key press if button click fails.
     * @param {number} [maxAttempts=5] - Maximum number of attempts to find an active send button.
     * @param {number} [attemptDelay=200] - Delay in milliseconds between attempts to find the button.
     * @param {number} [delayBeforeFindingButton=200] - Initial delay in milliseconds before starting to find the button.
     * @param {HTMLElement|null} [searchContainer=null] - The element within which to search for the button. Defaults to the whole document.
     * @returns {Promise<boolean>} A promise that resolves to true if the message was submitted, false otherwise.
     * @throws {Error} If the message cannot be submitted after all attempts and fallbacks.
     */
    async function attemptSubmit(
        textFieldElement,
        buttonSelectors,
        useEnterFallback = true,
        maxAttempts = 5,
        attemptDelay = 200,
        delayBeforeFindingButton = 200,
        searchContainer = null
    ) {
        let sendButton = null;
        let attempt = 0;
        let buttonFoundAndActive = false;

        // 1. Add an initial delay before starting to find the button
        if (delayBeforeFindingButton > 0) {
            console.log(`[content.js][attemptSubmit] Initial delay of ${delayBeforeFindingButton}ms before finding button.`);
            await new Promise((resolve) => setTimeout(resolve, delayBeforeFindingButton));
        }

        // 2. Attempt to find the active send button
        while (attempt < maxAttempts) {
            try {
                const foundElement = findSendButtonElement(
                    buttonSelectors,
                    searchContainer
                );

                // Check if the found element is an active button
                if (
                    foundElement &&
                    foundElement.tagName.toLowerCase() === "button" &&
                    !foundElement.disabled
                ) {
                    sendButton = foundElement; // Found an active button
                    buttonFoundAndActive = true;
                    console.log(
                        `[content.js][attemptSubmit] Active send button found after ${
                            attempt + 1
                        } attempts.`,
                        sendButton
                    );
                    break; // Button found and active, exit loop
                }
            } catch (error) {
                // findSendButtonElement throws an error if not found, so we catch it here
                console.log(`[content.js][attemptSubmit] findSendButtonElement failed: ${error.message}`);
            }

            console.log(
                `[content.js][attemptSubmit] Attempt ${
                    attempt + 1
                } to find active send button failed. Retrying in ${attemptDelay}ms.`
            );
            await new Promise((resolve) => setTimeout(resolve, attemptDelay));
            attempt++;
        }

        // 3. Attempt to click the button if found and active
        if (buttonFoundAndActive && sendButton) {
            try {
                const clicked = await clickSendButton(sendButton);
                if (clicked) {
                    console.log(
                        `[content.js][attemptSubmit] Message sent by clicking button.`
                    );
                    return true;
                } else {
        throw new Error("Unexpected error: Clicking send button failed unexpectedly.");
                }
            } catch (error) {
                console.error(`[content.js][attemptSubmit] Error clicking button: ${error.message}`);
                throw error;
            }
        } else {
            console.log(
                `[content.js][attemptSubmit] Active send button not found or not active after max attempts.`
            );
        }

        // 4. Fallback to Enter
        if (useEnterFallback) {
            console.log(
                "[content.js][attemptSubmit] Attempting to simulate Enter."
            );
            simulateEnter(textFieldElement);
            console.log("[content.js][attemptSubmit] Simulated Enter.");
            return true;
        }

        // If neither button click nor Enter fallback succeeded, throw an error
        throw new Error("Error: Failed to send message: No send button clicked and Enter fallback disabled or failed.");
    }

    //SECTION - Utility functions
    /**
     * FUNC - Simulates an "Enter" key press on a given input element.
     * This can trigger form submissions or message sends on some sites.
     * @param {HTMLElement} input - The input element to simulate the Enter key press on.
     */
    function simulateEnter(input) {
        const enterEvent = new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true,
        });
        input.dispatchEvent(enterEvent);
    }

    /**
     * FUNC - Attempts to click a given button element after a short delay.
     * Checks if the button is visible and not disabled before clicking.
     * @param {HTMLElement} buttonElement - The button element to click.
     * @param {number} [waitTime=100] - The delay in milliseconds before attempting the click.
     * @returns {Promise<boolean>} A promise that resolves to true if the button was clicked successfully, false otherwise.
     * @throws {Error} If the button is not clickable (not found, disabled, or not visible).
     */
    function clickSendButton(buttonElement, waitTime = 100) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                console.log(
                    `[content.js] Attempting to click button element:`,
                    buttonElement
                );

                if (!buttonElement) {
                    reject(new Error("Unexpected error: No send button element provided or found."));
                    return;
                }

                if (buttonElement.disabled) {
                    reject(new Error("Error: Send button found but is disabled."));
                    return;
                }

                // Try to check if the button is visible and clickable
                const rect = buttonElement.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0;

                if (!isVisible) {
                    reject(new Error("Error: Send button found but not visible."));
                    return;
                }

                try {
                    const clickEvent = new MouseEvent("click", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                    });
                    buttonElement.dispatchEvent(clickEvent);
                    console.log(`[content.js] Button clicked successfully`);
                    resolve(true);
                } catch (error) {
                    console.error(
                        `[content.js] Error dispatching click event:`,
                        error
                    );
                    reject(new Error(`Unexpected error: Failed to dispatch click event for send button: ${error.message}`));
                }
            }, waitTime);
        });
    }

    //!SECTION - Utility functions
    //!SECTION - Utility functions for handlers

    //SECTION - Site-specific handlers
    //FUNC - Handler for Google.com
    function handleGoogle(text) {
        const textFieldSelectors = ['textarea[name="q"]'];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handleGoogle] Text field not found.");
            return false;
        }

        if (!setTextFieldValue(input, text)) {
            console.error(
                "[content.js][handleGoogle] Failed to set text value."
            );
            return false;
        }

        const form = input.closest("form");
        if (form) form.submit();
        return true;
    }

    //FUNC - Handler for ChatGPT.com
    async function handleChatGPT(text) {
        const textFieldSelectors = [
            'div#prompt-textarea[contenteditable="true"]',
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handleChatGPT] Text field not found.");
            return false;
        }

        if (!setTextFieldValue(input, text)) {
            console.error(
                "[content.js][handleChatGPT] Failed to set text value."
            );
            return false;
        }

        const chatGPTButtonSelectors = ['button[data-testid="send-button"]'];
        return await attemptSubmit(input, chatGPTButtonSelectors, true);
    }

    //FUNC - Handler for Claude.ai
    async function handleClaude(text) {
        const textFieldSelectors = [
            'div[contenteditable="true"].ProseMirror',
            'div.ProseMirror[contenteditable="true"]',
            'div[aria-label="Write your prompt to Claude"][contenteditable="true"]',
            'div[contenteditable="true"]',
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handleClaude] Text field not found.");
            return false;
        }

        if (!setTextFieldValue(input, text)) {
            console.error(
                "[content.js][handleClaude] Failed to set text value."
            );
            return false;
        }

        const sendButtonSelectors = [
            'button[aria-label="Send message"]',
            'button[aria-label="Send Message"]',
            'button[type="button"][aria-label="Send message"]',
            'button.rounded-lg svg[viewBox="0 0 256 256"]',
            "button.bg-accent-main-000",
        ];

        return await attemptSubmit(input, sendButtonSelectors, true);
    }

    //FUNC - Handler for Abacus.ai (apps.abacus.ai, chatllm)
    async function handleAbacusChat(text) {
        const textFieldSelectors = [
            'textarea[placeholder="Write something..."]',
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error(
                "[content.js][handleAbacusChat] Text field not found."
            );
            return false;
        }

        if (!setTextFieldValue(input, text)) {
            console.error(
                "[content.js][handleAbacusChat] Failed to set text value."
            );
            return false;
        }

        const sendButtonSelectors = ["button svg.fa-paper-plane"];

        return await attemptSubmit(input, sendButtonSelectors, true);
    }

    //FUNC - Handler for deepseek.com
    async function handleDeepSeek(text) {
        const textFieldSelectors = ["textarea#chat-input"];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handleDeepSeek] Text field not found.");
            return false;
        }

        if (!setTextFieldValue(input, text)) {
            console.error(
                "[content.js][handleDeepSeek] Failed to set text value."
            );
            return false;
        }

        const sendButtonSelectors = [
            'div[role="button"][aria-label="Send"]',
            'div[role="button"] svg[viewBox="0 0 14 16"]',
            'button[type="submit"]',
            'button[aria-label*="send" i]',
        ];

        return await attemptSubmit(input, sendButtonSelectors, true);
    }

    //FUNC - Handler for HuggingFace Chat
    async function handleHuggingFace(text) {
        const textFieldSelectors = ['textarea[placeholder="Ask anything"]'];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error(
                "[content.js][handleHuggingFace] Text field not found."
            );
            return false;
        }

        if (!setTextFieldValue(input, text)) {
            console.error(
                "[content.js][handleHuggingFace] Failed to set text value."
            );
            return false;
        }

        const huggingFaceButtonSelectors = [
            'button[aria-label="Send message"]',
        ];
        return await attemptSubmit(input, huggingFaceButtonSelectors, true);
    }

    //FUNC - Handler for Perplexity
    async function handlePerplexity(text) {
        const textFieldSelectors = [
            "textarea#ask-input",
            'textarea[placeholder="Ask anything…"]',
            'textarea[placeholder*="Ask anything"]',
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error(
                "[content.js][handlePerplexity] Text field not found."
            );
            return false;
        }

        if (!setTextFieldValue(input, text)) {
            console.error(
                "[content.js][handlePerplexity] Failed to set text value."
            );
            return false;
        }

        const sendButtonSelectors = [
            'button[aria-label="Submit"]:not([disabled])',
        ];

        return await attemptSubmit(input, sendButtonSelectors, true);
    }

    //FUNC - Handler for Poe.com
    async function handlePoe(text) {
        const textFieldSelectors = [
            'textarea.GrowingTextArea_textArea__ZWQbP[placeholder="Start a new chat"]',
            'textarea.GrowingTextArea_textArea__ZWQbP[placeholder="Message"]',
            "textarea.GrowingTextArea_textArea__ZWQbP",
            'textarea[placeholder="Start a new chat"]',
            'textarea[placeholder="Message"]',
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handlePoe] Text field not found.");
            return false;
        }

        if (!setTextFieldValue(input, text)) {
            console.error("[content.js][handlePoe] Failed to set text value.");
            return false;
        }

        const poeButtonSelectors = [
            'button[data-button-send="true"][aria-label="Send message"]',
        ];
        return await attemptSubmit(input, poeButtonSelectors, true);
    }

    // FUNC - Handler for Gemini (gemini.google.com)
    async function handleGemini(text) {
        const textFieldSelectors = [
            ".ql-editor",
            '[contenteditable="true"]',
            '[role="textbox"]',
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handleGemini] Text field not found.");
            return false;
        }

        if (!setTextFieldValue(input, text)) {
            console.error(
                "[content.js][handleGemini] Failed to set text value."
            );
            return false;
        }

        // No reliable button selectors for Gemini currently, rely on Enter fallback
        const geminiButtonSelectors = [];
        return await attemptSubmit(input, geminiButtonSelectors, true);
    }

    // FUNC - Handler for Grok.com
    async function handleGrokCom(text) {
        console.log("[content.js][GrokCom] Start handler");
        const textFieldSelectors = [
            "textarea[aria-label]",
            "textarea[placeholder]",
            "textarea",
            '[aria-label*="Grok" i]',
            '[placeholder*="Grok" i]',
            "[aria-label]",
            "[placeholder]",
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][GrokCom] Text field not found.");
            return false;
        }
        if (!setTextFieldValue(input, text)) {
            console.error("[content.js][GrokCom] Failed to set text value.");
            return false;
        }

        const sendButtonSelectors = [
            'button[type="submit"]:not([disabled])',
            'button[aria-label*="Send" i]:not([disabled])',
            "button:not([disabled])",
        ];

        return await attemptSubmit(input, sendButtonSelectors, true);
    }

    // FUNC - Handler for aistudio.google.com
    async function handleAistudio(text) {
        console.log("[content.js][handleAistudio] Start handler");
        const textFieldSelectors = [
            'textarea[aria-label="Type something or tab to choose an example prompt"]',
            "textarea.textarea",
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handleAistudio] Text field not found.");
            return false;
        }
        if (!setTextFieldValue(input, text)) {
            console.error(
                "[content.js][handleAistudio] Failed to set text value."
            );
            return false;
        }

        const sendButtonSelectors = [
            'button[aria-label="Run"][type="submit"]',
            'button.run-button[type="submit"]',
        ];

        return await attemptSubmit(input, sendButtonSelectors, true);
    }

    //!SECTION - Site-specific handlers

    /**
     * LISTENER - Handles messages sent from the background script to this content script.
     * This listener processes "focusAndFill" actions, which instruct the content script
     * to interact with the current tab's webpage. It identifies the target chatbot site
     * based on the current URL and uses the appropriate handler to fill a text field
     * and attempt to send the message.
     * @param {object} request - The message object sent from the background script.
     * @param {string} request.action - The type of action to perform (e.g., "focusAndFill").
     * @param {string} [request.text] - The text to fill into the text field.
     * @param {MessageSender} sender - Details about the sender of the message.
     * @param {function} sendResponse - Function to call (at most once) to send a response back to the sender.
     * @returns {boolean} True if the response will be sent asynchronously, false otherwise.
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log("[content.js] Message received:", request);

        if (request.action !== "focusAndFill") {
            console.log("[content.js] Unknown action:", request.action);
            sendResponse({ success: false, error: "Unexpected error: Unknown action received by content script." });
            return true;
        }

        if (!request.text) {
            console.log("[content.js] No text provided");
            sendResponse({ success: false, error: "Unexpected error: No text provided to content script." });
            return true;
        }

        const currentURL = window.location.href;
        console.log("[content.js] Current URL:", currentURL);

        const handlerEntry = Object.entries(siteHandlers).find(([domain]) =>
            currentURL.includes(domain)
        );

        console.log("[content.js] Handler entry:", handlerEntry);

        if (!handlerEntry) {
            console.log("[content.js] Site not supported");
            sendResponse({
                success: false,
                error: "Error: Site not supported",
                url: currentURL,
            });
            return true;
        }

        const handler = handlerEntry[1];
        console.log("[content.js] Handler found, executing");

        try {
            const result = handler(request.text);
            console.log("[content.js] Handler result:", result);

            // Check if the result is a Promise
            if (result instanceof Promise) {
                // If the result is a Promise, handle it
                result
                    .then((success) => {
                        console.log(
                            "[content.js] Promise resolved with:",
                            success
                        );
                        sendResponse({ success: !!success });
                    })
                    .catch((error) => {
                        console.error("[content.js] Promise rejected:", error);
                        sendResponse({
                            success: false,
                            error: error.message,
                            stack: error.stack,
                            errorName: error.name,
                        });
                    });
                return true; // Indicate that the response will be asynchronous
            } else {
                // If the result is not a Promise, send it immediately
                sendResponse({ success: !!result });
            }
        } catch (error) {
            console.error("[content.js] Handler error:", error);
            sendResponse({
                success: false,
                error: error.message,
                stack: error.stack,
                errorName: error.name,
            });
        }

        return true;
    });
}
