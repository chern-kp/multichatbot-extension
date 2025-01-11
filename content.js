//This file is injected into the webpage by the extension and runs in the context of the webpage

//NOTE - Object to store handlers for different websites
const siteHandlers = {
    //NOTE - Handler for Google.com
    google: {
        matches: (url) => {
            return url.includes('google.com');
        },
        getInputField: () => {
            const input = document.querySelector('textarea[name="q"]');
            return input;
        },
        submitAction: (input) => {
            const form = input.closest('form');
            if (form) {
                form.submit();
            }
        }
    },

    //NOTE - Handler for ChatGPT.com
    chatgpt: {
        matches: (url) => {
            return url.includes('chat.openai.com') || url.includes('chatgpt.com');
        },
        getInputField: () => {
            const input = document.querySelector('div#prompt-textarea[contenteditable="true"]');
            return input;
        },
        submitAction: async (input) => {
            fillInput(input, input.value);
            await clickSendButton('button[data-testid="send-button"]');
        }
    },

    //NOTE - Handler for Claude.ai
    claude: {
        matches: (url) => {
            return url.includes('claude.ai');
        },
        getInputField: () => {
            const input = document.querySelector('div[contenteditable="true"].ProseMirror');
            return input;
        },
        submitAction: async (input) => {
            if (window.location.href.includes('claude.ai/new')) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            fillInput(input, input.value);
            simulateEnter(input);
            await clickSendButton('button[aria-label="Send Message"]');
        }
    },

    //NOTE - Handler for Abacus.ai (apps.abacus.ai, chatllm)
    abacusChat: {
        matches: (url) => {
            return url.includes('apps.abacus.ai/chatllm');
        },
        getInputField: () => {
            const input = document.querySelector('textarea[placeholder="Write something..."]');
            return input;
        },
        submitAction: async (input) => {
            try {
                fillInput(input, input.value);
                const buttonSuccess = await clickSendButton('button svg.fa-paper-plane').closest('button');
                if (!buttonSuccess) {
                    simulateEnter(input);
                }
            } catch (error) {
                console.error('Error during submission:', error);
                throw error;
            }
        }
    }
};

//NOTE - Function to fill input field with text from text field
function fillInput(input, text) {
    console.log('Filling input field');

    // We need to handle textareas and contenteditable divs differently
    if (input.tagName.toLowerCase() === 'textarea') {
        input.value = text || '';
    } else {
        input.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = text || '';
        input.appendChild(p);
    }

    // Trigger input events
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

//NOTE - Function to click the send button
function clickSendButton(buttonSelector, waitTime = 100) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const button = document.querySelector(buttonSelector);
            console.log('Send button found:', button);

            if (button && !button.disabled) {
                console.log('Clicking send button');
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                button.dispatchEvent(clickEvent);
                resolve(true);
            } else {
                console.log('Send button not found or disabled');
                resolve(false);
            }
        }, waitTime);
    });
}

//NOTE - Function to simulate Enter key press
function simulateEnter(input) {
    console.log('Simulating Enter key');
    const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true
    });
    input.dispatchEvent(enterEvent);
}

//NOTE - Listener for messages from the extension
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'focusAndFill') {
        console.log('focusAndFill');
        try {
            const currentURL = window.location.href;
            console.log('Current URL:', currentURL);

            const handler = Object.values(siteHandlers).find(h => h.matches(currentURL));
            if (!handler) {
                sendResponse({ success: false, error: 'Site is not supported' });
                return true;
            }

            const input = handler.getInputField();
            if (!input) {
                sendResponse({ success: false, error: 'Input field not found' });
                return true;
            }

            input.focus();
            input.value = request.text;
            handler.submitAction(input);

            sendResponse({ success: true });
        } catch (error) {
            console.error('Error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    return true;
});