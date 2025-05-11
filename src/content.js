//This file is injected into the webpage by the function processTab() in window.js

// Set a global marker to indicate that the script has been loaded
if (window.__contentScriptLoaded) {
    console.log("[content.js] Script already loaded, skipping initialization");
} else {
    window.__contentScriptLoaded = true;
    console.log("[content.js] Script loaded and running!");

    //SECTION - Utility functions for handlers
    //NOTE - Step 1. Function to find the first matching text field element from a list of selectors
    function findTextFieldElement(selectors) {
        // Add logging for debugging
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
        return null; // Return null if nothing is found
    }

    //NOTE - Step 2. Function to set the value of a text field and dispatch events
    function setTextFieldValue(element, text) {
        const preparedText = text || "";
        let success = false;

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
            }
        }
        return success;
    }

    //NOTE - Step 3. Function to find the first matching send button element from a list of selectors
    function findSendButtonElement(selectors) {
        console.log(
            "[content.js] Attempting to find send button with selectors:",
            selectors
        );
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                console.log(
                    `[content.js] Send button found with selector: "${selector}"`,
                    element
                );
                return element;
            }
        }
        console.log(
            "[content.js] Send button not found with any of the selectors."
        );
        return null;
    }

    //NOTE - Step 4. Function to attempt message submission (using find and click/enter)
    async function attemptSubmit(
        textFieldElement,
        buttonSelectors,
        useEnterFallback = true,
        maxAttempts = 5,
        attemptDelay = 200
    ) {
        let sendButton = null;
        let attempt = 0;

        // 1. Attempt to find the send button
        while (attempt < maxAttempts) {
            sendButton = findSendButtonElement(buttonSelectors);
            if (sendButton) {
                console.log(
                    `[content.js] Send button found after ${
                        attempt + 1
                    } attempts.`
                );
                break; // Button found, exit loop
            }
            console.log(
                `[content.js] Attempt ${
                    attempt + 1
                } to find send button failed. Retrying in ${attemptDelay}ms.`
            );
            await new Promise((resolve) => setTimeout(resolve, attemptDelay));
            attempt++;
        }

        // 2. Attempt to click the button if found
        if (sendButton) {
            const clicked = await clickSendButton(sendButton);
            if (clicked) {
                console.log(`[content.js] Message sent by clicking button.`);
                return true; // Successful attempt via button
            } else {
                console.log(`[content.js] Clicking button failed.`);
                // Continue to try fallback
            }
        } else {
            console.log(
                `[content.js] Send button not found after max attempts.`
            );
            // Continue to try fallback
        }

        // 3. If button not found or click failed, and fallback is enabled, try Enter
        if (useEnterFallback) {
            console.log("[content.js] Attempting to simulate Enter.");
            simulateEnter(textFieldElement);
            console.log("[content.js] Simulated Enter.");
            return true; // Successful attempt via Enter
        }

        console.error(
            "[content.js] Failed to send message: No button clicked and Enter fallback disabled or failed."
        );
        return false; // Failed to attempt submission
    }

    //SECTION - Utility functions
    //NOTE - Function to simulate "Enter" key press
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

    //NOTE - Function to click the send button
    function clickSendButton(buttonElement, waitTime = 100) {
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log(
                    `[content.js] Attempting to click button element:`,
                    buttonElement
                );

                if (buttonElement && !buttonElement.disabled) {
                    console.log(
                        `[content.js] Button found, attempting to click`
                    );
                    // Try to check if the button is visible and clickable
                    const rect = buttonElement.getBoundingClientRect();
                    const isVisible = rect.width > 0 && rect.height > 0;

                    if (!isVisible) {
                        console.log(
                            `[content.js] Button found but not visible`
                        );
                        resolve(false);
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
                            `[content.js] Error clicking button:`,
                            error
                        );
                        resolve(false);
                    }
                } else {
                    if (!buttonElement) {
                        console.log(
                            `[content.js] No button element provided or found.`
                        );
                    } else if (buttonElement.disabled) {
                        console.log(
                            `[content.js] Button element found but is disabled`
                        );
                    }
                    resolve(false);
                }
            }, waitTime);
        });
    }

    //!SECTION - Utility functions

    //!SECTION - Utility functions for handlers

    const siteHandlers = {
        "gemini.google.com": handleGemini,
        "chatgpt.com": handleChatGPT,
        "claude.ai": handleClaude,
        "apps.abacus.ai/chatllm": handleAbacusChat,
        "chat.deepseek.com": handleDeepSeek,
        "huggingface.co/chat": handleHuggingFace,
        "perplexity.ai": handlePerplexity,
        "poe.com": handlePoe,
        "google.com": handleGoogle,
        "grok.com": handleGrokCom,
        "x.com/i/grok": handleGrokX,
    };

    //SECTION - Site-specific handlers
    //NOTE - Handler for Google.com
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

    //NOTE - Handler for ChatGPT.com
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

    //NOTE - Handler for Claude.ai
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

    //NOTE - Handler for Abacus.ai (apps.abacus.ai, chatllm)
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

        const sendButtonSelectors = [
            'button svg.fa-paper-plane',
        ];

        return await attemptSubmit(input, sendButtonSelectors, true);
    }

    //NOTE - Handler for deepseek.com
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

    //NOTE - Handler for HuggingFace Chat
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

    //NOTE - Handler for Perplexity
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

    //NOTE - Handler for Poe.com
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

    // NOTE - Handler for Gemini (gemini.google.com)
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

    // NOTE - Handler for Grok.com
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

    // NOTE - Handler for Grok on x.com/i/grok
    function handleGrokX(text) {
        //TODO - Implement Grok on x.com/i/grok
        return false;
    }

    //!SECTION - Site-specific handlers

    //NOTE - Listener that receives messages from the background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log("[content.js] Message received:", request);

        if (request.action !== "focusAndFill") {
            console.log("[content.js] Unknown action:", request.action);
            sendResponse({ success: false, error: "Unknown action" });
            return true;
        }

        if (!request.text) {
            console.log("[content.js] No text provided");
            sendResponse({ success: false, error: "No text provided" });
            return true;
        }

        const currentURL = window.location.href;
        console.log("[content.js] Current URL:", currentURL);

        // Debug each handler match attempt
        for (const [domain, handler] of Object.entries(siteHandlers)) {
            console.log(
                `[content.js] Checking if ${currentURL} includes ${domain}: ${currentURL.includes(
                    domain
                )}`
            );
        }

        const handlerEntry = Object.entries(siteHandlers).find(([domain]) =>
            currentURL.includes(domain)
        );

        console.log("[content.js] Handler entry:", handlerEntry);

        if (!handlerEntry) {
            console.log("[content.js] Site not supported");
            sendResponse({
                success: false,
                error: "Site not supported",
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
            });
        }

        return true;
    });
}
