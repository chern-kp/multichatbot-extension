//This file is injected into the webpage by the function processTab() in window.js

// Set a global marker to indicate that the script has been loaded
if (window.__contentScriptLoaded) {
    console.log("[content.js] Script already loaded, skipping initialization");
} else {
    window.__contentScriptLoaded = true;
    console.log("[content.js] Script loaded and running!");

    //SECTION - Utility functions for handlers
    //NOTE - Function to find the first matching text field element from a list of selectors
    function findTextFieldElement(selectors) {
        // Add logging for debugging
        console.log("[content.js] Attempting to find text field with selectors:", selectors);

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                // Log which selector worked
                console.log(`[content.js] Text field found with selector: "${selector}"`, element);
                return element; // Return the first found element
            }
        }

        // Log if the field is not found
        console.log("[content.js] Text field not found with any of the selectors.");
        return null; // Return null if nothing is found
    }
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
        const textFieldSelectors = [
            'textarea[name="q"]'
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handleGoogle] Text field not found.");
            return false;
        }

        input.value = text || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        const form = input.closest("form");
        if (form) form.submit();
        return true;
    }

    //NOTE - Handler for ChatGPT.com
    function handleChatGPT(text) {
        const textFieldSelectors = [
            'div#prompt-textarea[contenteditable="true"]'
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handleChatGPT] Text field not found.");
            return false;
        }

        input.innerHTML = ""; // Clear existing content
        const p = document.createElement("p");
        p.textContent = text || "";
        input.appendChild(p);

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        return clickSendButton('button[data-testid="send-button"]');
    }

    //NOTE - Handler for Claude.ai
    function handleClaude(text) {
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

        if (window.location.href.includes("claude.ai")) {
            // Claude needs a small delay for reliable input
            return new Promise((resolve) => {
                setTimeout(async () => {
                    input.innerHTML = ""; // Clear existing content
                    const p = document.createElement("p");
                    p.textContent = text || "";
                    input.appendChild(p);

                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));

                    // Try to click the send button first
                    const sendButtonSelectors = [
                        'button[aria-label="Send message"]',
                        'button[aria-label="Send Message"]',
                        'button[type="button"][aria-label="Send message"]',
                        // Fallbacks if button can't be found by attributes
                        'button.rounded-lg svg[viewBox="0 0 256 256"]', // Try finding by SVG shape
                        "button.bg-accent-main-000", // Try by class
                    ];

                    // Try each button selector in order
                    for (const selector of sendButtonSelectors) {
                        const success = await clickSendButton(selector);
                        if (success) {
                            console.log(
                                `[content.js] Claude message sent using selector: ${selector}`
                            );
                            resolve(true);
                            return;
                        }
                    }

                    // If no button could be found or clicked, try Enter key
                    console.log(
                        "[content.js] Claude message send button not found, trying Enter key"
                    );
                    simulateEnter(input);
                    resolve(true);
                }, 2000);
            });
        }
        return false;
    }

    //NOTE - Handler for Abacus.ai (apps.abacus.ai, chatllm)
    function handleAbacusChat(text) {
        const textFieldSelectors = [
            'textarea[placeholder="Write something..."]'
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handleAbacusChat] Text field not found.");
            return false;
        }

        input.value = text || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        return clickSendButton("button svg.fa-paper-plane")
            .then((button) => {
                if (!button) {
                    simulateEnter(input);
                }
                return true;
            })
            .catch((error) => {
                console.error("Error during Abacus submission:", error);
                return false;
            });
    }

    //NOTE - Handler for deepseek.com
    function handleDeepSeek(text) {
        const textFieldSelectors = [
            "textarea#chat-input"
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handleDeepSeek] Text field not found.");
            return false;
        }

        input.value = text || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        // Search for the send button by its SVG icon
        const sendButton = Array.from(
            document.querySelectorAll('div[role="button"]')
        ).find((button) => {
            const svg = button.querySelector("svg");
            return svg && svg.getAttribute("viewBox") === "0 0 14 16";
        });

        if (
            !sendButton ||
            sendButton.getAttribute("aria-disabled") === "true"
        ) {
            return false;
        }

        sendButton.click();
        return true;
    }

    //NOTE - Handler for HuggingFace Chat
    function handleHuggingFace(text) {
        const textFieldSelectors = [
            'textarea[placeholder="Ask anything"]'
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handleHuggingFace] Text field not found.");
            return false;
        }

        input.value = text || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        const sendButton = document.querySelector(
            'button[aria-label="Send message"]'
        );
        if (!sendButton || sendButton.disabled) {
            simulateEnter(input);
            return true;
        }

        sendButton.click();
        return true;
    }

    //NOTE - Handler for Perplexity
    function handlePerplexity(text) {
        const textFieldSelectors = [
            'textarea[placeholder="Ask anything..."]'
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handlePerplexity] Text field not found.");
            return false;
        }

        input.value = text || "";
        input.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true })
        );
        input.dispatchEvent(new Event("change", { bubbles: true }));

        // Wait for the button to become enabled
        return new Promise((resolve) => {
            setTimeout(() => {
                const button = document.querySelector(
                    'button[aria-label="Submit"]:not([disabled])'
                );

                if (button) {
                    button.click();
                    resolve(true);
                } else {
                    simulateEnter(input);
                    resolve(true);
                }
            }, 300); // Delay before checking the button status
        });
    }

    //NOTE - Handler for Poe.com
    function handlePoe(text) {
        const textFieldSelectors = [
            'textarea.GrowingTextArea_textArea__ZWQbP[placeholder="Message"]'
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][handlePoe] Text field not found.");
            return false;
        }

        input.value = text || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        const sendButton = document.querySelector(
            'button[data-button-send="true"][aria-label="Send message"]'
        );
        if (sendButton && !sendButton.disabled) {
            sendButton.click();
            return true;
        }

        simulateEnter(input);
        return true;
    }

    // NOTE - Handler for Gemini (gemini.google.com)
    function handleGemini(text) {
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

        input.innerHTML = `<p>${text}</p>`;

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        simulateEnter(input);
        return true;
    }

    // NOTE - Handler for Grok.com
    function handleGrokCom(text) {
        console.log("[content.js][GrokCom] Start handler");
        const textFieldSelectors = [
            'textarea[aria-label]',
            'textarea[placeholder]',
            'textarea',
            '[aria-label*="Grok" i]',
            '[placeholder*="Grok" i]',
            '[aria-label]',
            '[placeholder]'
        ];
        const input = findTextFieldElement(textFieldSelectors);

        if (!input) {
            console.error("[content.js][GrokCom] Text field not found.");
            return false;
        }
        input.value = text || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        // Wait 400 ms for the button to activate
        setTimeout(() => {
            // Fallback selectors for send button
            const buttonSelectors = [
                'button[type="submit"]:not([disabled])',
                'button[aria-label*="Send" i]:not([disabled])',
                'button:not([disabled])'
            ];
            let sendButton = null;
            for (const selector of buttonSelectors) {
                sendButton = document.querySelector(selector);
                if (sendButton) break;
            }
            if (!sendButton) {
                console.log("[content.js][GrokCom] No send button found or button is disabled");
                return false;
            }
            sendButton.click();
            console.log("[content.js][GrokCom] Clicked send button");
        }, 400);
        return true;
    }

    // Utility: setNativeValue for React/Preact compatibility
    function setNativeValue(element, value) {
        const valueSetter = Object.getOwnPropertyDescriptor(element.__proto__, 'value')?.set;
        const prototype = Object.getPrototypeOf(element);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
        } else if (valueSetter) {
            valueSetter.call(element, value);
        } else {
            element.value = value;
        }
    }

    // NOTE - Handler for Grok on x.com/i/grok
    function handleGrokX(text) {
        //TODO - Implement Grok on x.com/i/grok
        return false;
    }

    //!SECTION - Site-specific handlers

    //SECTION - Utility functions
    //NOTE - Function to click the send button
    function clickSendButton(buttonSelector, waitTime = 100) {
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log(
                    `[content.js] Attempting to find send button with selector: ${buttonSelector}`
                );
                const button = document.querySelector(buttonSelector);

                if (button && !button.disabled) {
                    console.log(
                        `[content.js] Button found, attempting to click`
                    );
                    // Try to check if the button is visible and clickable
                    const rect = button.getBoundingClientRect();
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
                        button.dispatchEvent(clickEvent);
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
                    if (!button) {
                        console.log(
                            `[content.js] No button found with selector: ${buttonSelector}`
                        );
                    } else if (button.disabled) {
                        console.log(
                            `[content.js] Button found but is disabled`
                        );
                    }
                    resolve(false);
                }
            }, waitTime);
        });
    }

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
    //!SECTION - Utility functions

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
