//This file is injected into the webpage by the function processTab() in window.js

console.log("[content.js] Script loaded and running!");

//NOTE - Site handler mapping
const siteHandlers = {
    'google.com': handleGoogle,
    'chatgpt.com': handleChatGPT,
    'claude.ai': handleClaude,
    'apps.abacus.ai/chatllm': handleAbacusChat,
    'gemini.google.com': handleGemini
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
    const input = document.querySelector('div#prompt-textarea[contenteditable="true"]');
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
    const input = document.querySelector('div[contenteditable="true"].ProseMirror');
    if (!input) return false;

    if (window.location.href.includes("claude.ai")) {
        // Claude needs a small delay for reliable input
        return new Promise(resolve => {
            setTimeout(async () => {
                input.innerHTML = ""; // Clear existing content
                const p = document.createElement("p");
                p.textContent = text || "";
                input.appendChild(p);

                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));

                simulateEnter(input);
                const success = await clickSendButton('button[aria-label="Send Message"]');
                resolve(success);
            }, 2000);
        });
    }
    return false;
}

//NOTE - Handler for Abacus.ai (apps.abacus.ai, chatllm)
function handleAbacusChat(text) {
    const input = document.querySelector('textarea[placeholder="Write something..."]');
    if (!input) return false;

    input.value = text || "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    return clickSendButton("button svg.fa-paper-plane")
        .then(button => {
            if (!button) {
                simulateEnter(input);
            }
            return true;
        })
        .catch(error => {
            console.error("Error during Abacus submission:", error);
            return false;
        });
}


//NOTE - Handler for gemini.google.com
//TODO - Broken. Problem with strict Content Security Policy (CSP) restrictions maybe?
async function handleGemini(text) {
    console.log("[content.js] Handling Gemini input...");

    for (let i = 0; i < 10; i++) {
        const input = document.querySelector("rich-textarea .ql-editor") ||
            (document.querySelector("rich-textarea")?.shadowRoot?.querySelector(".ql-editor"));

        if (input) {
            input.innerHTML = ""; // Clear existing content
            const p = document.createElement("p");
            p.textContent = text || "";
            input.appendChild(p);

            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));

            return clickSendButton(".send-button-container button", 100);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return false;
}

//!SECTION - Site-specific handlers

//SECTION - Utility functions
//NOTE - Function to click the send button
function clickSendButton(buttonSelector, waitTime = 100) {
    return new Promise(resolve => {
        setTimeout(() => {
            const button = document.querySelector(buttonSelector);

            if (button && !button.disabled) {
                const clickEvent = new MouseEvent("click", {
                    bubbles: true,
                    cancelable: true,
                    view: window
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
        composed: true
    });
    input.dispatchEvent(enterEvent);
}

//!SECTION - Utility functions

//NOTE - Listener that receives messages from the background script. Its the way for extension to communicate with the webpage
//Currently, it only listens for the "focusAndFill" action from window.js function processTab()
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    console.log("Message received:", request);

    //If somehow the action is not "focusAndFill", return an error
    if (request.action !== "focusAndFill") {
        sendResponse({ success: false, error: "Unknown action" });
        return true;
    }

    //If no text is provided, return an error
    if (!request.text) {
        sendResponse({ success: false, error: "No text provided" });
        return true;
    }


    //Check the current URL and find the handler for the current site from the siteHandlers object
    //NOTE - If handler is found, call the handler function for specific site from siteHandlers object
    const currentURL = window.location.href;
    const handler = Object.entries(siteHandlers)
        .find(([domain]) => currentURL.includes(domain))?.[1];

    //If no handler is found, return an error
    if (!handler) {
        sendResponse({
            success: false,
            error: "Site not supported",
            url: currentURL
        });
        return true;
    }


    Promise.resolve(handler(request.text))
        .then(success => {
            sendResponse({ success });
        })
        .catch(error => {
            sendResponse({
                success: false,
                error: error.message,
                stack: error.stack
            });
        });

    return true;
});
