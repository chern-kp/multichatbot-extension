//This file is injected into the webpage by the function processTab() in window.js

console.log("[content.js] Script loaded and running!");
//NOTE - Object to store handlers for different websites
if (typeof siteHandlers === "undefined") {
    console.log("[content.js] Initializing siteHandlers...");
    const siteHandlers = {
        //NOTE - Handler for Google.com
        google: {
            matches: (url) => {
                return url.includes("google.com");
            },
            getInputField: () => {
                const input = document.querySelector('textarea[name="q"]');
                return input;
            },
            submitAction: (input) => {
                const form = input.closest("form");
                if (form) {
                    form.submit();
                }
            },
        },

        //NOTE - Handler for ChatGPT.com
        chatgpt: {
            matches: (url) => {
                return (
                    url.includes("chat.openai.com") ||
                    url.includes("chatgpt.com")
                );
            },
            getInputField: () => {
                const input = document.querySelector(
                    'div#prompt-textarea[contenteditable="true"]'
                );
                return input;
            },
            submitAction: async (input) => {
                fillInput(input, input.value);
                await clickSendButton('button[data-testid="send-button"]');
            },
        },

        //NOTE - Handler for Claude.ai
        claude: {
            matches: (url) => {
                return url.includes("claude.ai");
            },
            getInputField: () => {
                const input = document.querySelector(
                    'div[contenteditable="true"].ProseMirror'
                );
                return input;
            },
            submitAction: async (input) => {
                if (window.location.href.includes("claude.ai")) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }

                fillInput(input, input.value);
                simulateEnter(input);
                await clickSendButton('button[aria-label="Send Message"]');
            },
        },

        //NOTE - Handler for Abacus.ai (apps.abacus.ai, chatllm)
        abacusChat: {
            matches: (url) => {
                return url.includes("apps.abacus.ai/chatllm");
            },
            getInputField: () => {
                const input = document.querySelector(
                    'textarea[placeholder="Write something..."]'
                );
                return input;
            },
            submitAction: async (input) => {
                try {
                    fillInput(input, input.value);
                    const buttonSuccess = await clickSendButton(
                        "button svg.fa-paper-plane"
                    ).closest("button");
                    if (!buttonSuccess) {
                        simulateEnter(input);
                    }
                } catch (error) {
                    console.error("Error during submission:", error);
                    throw error;
                }
            },
        },
        //NOTE - Handler for gemini.google.com
        gemini: {
            matches: (url) => {
                return url.includes("gemini.google.com");
            },
            getInputField: async () => {
                //TODO - Broken. Problem with strict Content Security Policy (CSP) restrictions maybe?
                console.log("[content.js] Calling getInputField for Gemini...");
                console.log("[content.js] Current URL:", window.location.href);

                // Retry mechanism
                for (let i = 0; i < 10; i++) { // Retry up to 10 times
                    console.log(`[content.js] Attempt ${i + 1}: Searching for input field...`);

                    // Check for the input field in the regular DOM
                    const input = document.querySelector("rich-textarea .ql-editor");
                    if (input) {
                        console.log("[content.js] Input field found in regular DOM:", input);
                        return input;
                    }

                    // Check for the input field inside a shadow DOM
                    const container = document.querySelector("rich-textarea");
                    if (container && container.shadowRoot) {
                        const shadowInput = container.shadowRoot.querySelector(".ql-editor");
                        if (shadowInput) {
                            console.log("[content.js] Input field found inside shadow DOM:", shadowInput);
                            return shadowInput;
                        }
                    }

                    console.log(`[content.js] Input field not found. Retrying... (${i + 1}/10)`);
                    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 500ms before retrying
                }

                console.log("[content.js] Input field not found after retries. Using MutationObserver...");

                // Fallback to MutationObserver
                return new Promise((resolve) => {
                    const observer = new MutationObserver((mutations, obs) => {
                        const input = document.querySelector("rich-textarea .ql-editor");
                        if (input) {
                            console.log("[content.js] Input field detected by MutationObserver:", input);
                            obs.disconnect(); // Stop observing
                            resolve(input);
                        }
                    });

                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                    });

                    // Timeout after 10 seconds
                    setTimeout(() => {
                        console.log("[content.js] MutationObserver timeout: Input field not found.");
                        observer.disconnect();
                        resolve(null);
                    }, 10000);
                });
            },
            submitAction: async (input) => {
                fillInput(input, input.value);
                await clickSendButton(".send-button-container button", 100);
            },
        },
    };

    //NOTE - Function to fill input field with text from text field
    function fillInput(input, text) {
        console.log("Filling input field");

        // Clear the input field
        input.innerHTML = "";

        // Handle different types of input fields
        if (input.tagName.toLowerCase() === "textarea") {
            // For textarea elements, set the value directly
            input.value = text || "";
        } else if (input.isContentEditable) {
            // For contenteditable elements, create a new paragraph and append it
            const p = document.createElement("p");
            p.textContent = text || "";
            input.appendChild(p);
        } else {
            // For other input types, set the value directly if possible
            input.value = text || "";
        }

        // Trigger input events
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    //NOTE - Function to click the send button
    function clickSendButton(buttonSelector, waitTime = 100) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const button = document.querySelector(buttonSelector);
                console.log("Send button found:", button);

                if (button && !button.disabled) {
                    console.log("Clicking send button");
                    const clickEvent = new MouseEvent("click", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                    });
                    button.dispatchEvent(clickEvent);
                    resolve(true);
                } else {
                    console.log("Send button not found or disabled");
                    resolve(false);
                }
            }, waitTime);
        });
    }

    //NOTE - Function to simulate Enter key press
    function simulateEnter(input) {
        console.log("Simulating Enter key");
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

    //NOTE - Listener that receives messages from the background script. Its the way for extension to communicate with the webpage
    //Currently, it only listens for the "focusAndFill" action from window.js function processTab()
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        //request variable contains the action (focusAndFill) and the text from the text field of the extension
        console.log("Message received:", request);

        if (request.action === "focusAndFill") {
            handleFocusAndFill(request, sendResponse); // if the action is "focusAndFill", call the function handleFocusAndFill
        } else {
            console.warn("Unknown action received:", request.action);
            sendResponse({ success: false, error: "Unknown action" });
        }
        return true;
    });

    //NOTE - Function to handle the focus (selecting the input field) and fill (filling the input field with text) actions
    async function handleFocusAndFill(request, sendResponse) {
        try {
            if (!request.text) {
                console.error("No text provided in request");
                sendResponse({ success: false, error: "No text provided" });
                return;
            }

            const currentURL = window.location.href;
            console.log("Processing request for URL:", currentURL);

            const handler = Object.values(siteHandlers).find((h) => h.matches(currentURL));
            console.log("[content.js] Handler found:", handler);

            if (!handler) {
                console.error("No handler found for URL:", currentURL);
                sendResponse({
                    success: false,
                    error: "Site is not supported",
                    url: currentURL
                });
                return;
            }

            // Retry mechanism for input field
            console.log("[content.js] Waiting for input field...");
            const input = await handler.getInputField();
            console.log("Input field search result:", input ? "Found" : "Not found");

            if (!input) {
                console.error("Input field not found after multiple attempts");
                console.log("[content.js] Current DOM:", document.body.innerHTML);
                sendResponse({
                    success: false,
                    error: "Input field not found after multiple attempts",
                    handler: handler.constructor.name
                });
                return;
            }

            console.log("Focusing input field...");
            input.focus();

            console.log("Setting text:", request.text);
            input.value = request.text;

            console.log("Executing submit action...");
            await handler.submitAction(input);

            sendResponse({ success: true });
        } catch (error) {
            console.error("Error in handleFocusAndFill:", error);
            sendResponse({ success: false, error: error.message, stack: error.stack });
        }
    }
}
