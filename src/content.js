//This file is injected into the webpage by the function processTab() in window.js

// Set a global marker to indicate that the script has been loaded
if (window.__contentScriptLoaded) {
    console.log("[content.js] Script already loaded, skipping initialization");
} else {
    window.__contentScriptLoaded = true;
    console.log("[content.js] Script loaded and running!");

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
    };

    //SECTION - Site-specific handlers
    //NOTE - Handler for Google.com
    function handleGoogle(text) {
        const input = document.querySelector('textarea[name="q"]');
        if (!input) return false;

        input.value = text || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        const form = input.closest("form");
        if (form) form.submit();
        return true;
    }

    //NOTE - Handler for ChatGPT.com
    function handleChatGPT(text) {
        const input = document.querySelector(
            'div#prompt-textarea[contenteditable="true"]'
        );
        if (!input) return false;

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
        const input = document.querySelector(
            'div[contenteditable="true"].ProseMirror'
        );
        if (!input) return false;

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

                    simulateEnter(input);
                    const success = await clickSendButton(
                        'button[aria-label="Send Message"]'
                    );
                    resolve(success);
                }, 2000);
            });
        }
        return false;
    }

    //NOTE - Handler for Abacus.ai (apps.abacus.ai, chatllm)
    function handleAbacusChat(text) {
        const input = document.querySelector(
            'textarea[placeholder="Write something..."]'
        );
        if (!input) return false;

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
        const input = document.querySelector("textarea#chat-input");
        if (!input) return false;

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
        const input = document.querySelector(
            'textarea[placeholder="Ask anything"]'
        );
        if (!input) return false;

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
        const input = document.querySelector(
            'textarea[placeholder="Ask anything..."]'
        );
        if (!input) return false;

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
        const input = document.querySelector(
            'textarea.GrowingTextArea_textArea__ZWQbP[placeholder="Message"]'
        );
        if (!input) return false;

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
        const possibleInputs = [
            document.querySelector(".ql-editor"),
            document.querySelector('[contenteditable="true"]'),
            document.querySelector('[role="textbox"]'),
        ].filter(Boolean);

        if (possibleInputs.length === 0) return false;

        const input = possibleInputs[0];
        input.innerHTML = `<p>${text}</p>`;

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        simulateEnter(input);
        return true;
    }

    //!SECTION - Site-specific handlers

    //SECTION - Utility functions
    //NOTE - Function to click the send button
    function clickSendButton(buttonSelector, waitTime = 100) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const button = document.querySelector(buttonSelector);

                if (button && !button.disabled) {
                    const clickEvent = new MouseEvent("click", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                    });
                    button.dispatchEvent(clickEvent);
                    resolve(true);
                } else {
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
                        console.log("[content.js] Promise resolved with:", success);
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
