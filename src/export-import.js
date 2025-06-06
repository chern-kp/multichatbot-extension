/**
 * File for handling import and export of saved prompts
 */
import './debug.js';

/**
 * FUNC - Export saved prompts to a JSON file.
 * Downloads a JSON file containing all saved prompts from local storage.
 * @returns {Promise<boolean>} True if the export was successful, false otherwise.
 */
async function exportSavedPrompts() {
    try {
        // Get saved prompts from storage
        const { savedPrompts = [] } = await chrome.storage.local.get("savedPrompts");

        // Create the export data
        const exportData = {
            version: 1, // For future compatibility
            exportDate: new Date().toISOString(),
            prompts: savedPrompts
        };

        // Convert to JSON string with pretty formatting
        const jsonString = JSON.stringify(exportData, null, 2);

        // Create a Blob with the JSON data
        const blob = new Blob([jsonString], { type: 'application/json' });

        // Create a download URL for the Blob
        const url = URL.createObjectURL(blob);

        // Create a timestamp for the filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = `multichatbot-prompts-${timestamp}.json`;

        // Create a temporary link element to trigger the download
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;

        // Append to the body, click it, and remove it
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // Clean up the URL object
        setTimeout(() => URL.revokeObjectURL(url), 100);

        console.log("[Export] Prompts exported successfully");
        return true;
    } catch (error) {
        console.error("[Export] Error exporting prompts:", error);
        return false;
    }
}

/**
 * FUNC - Import saved prompts from a JSON file.
 * Opens a file dialog, reads the selected JSON file, and imports new prompts into local storage.
 * It handles file selection, JSON parsing, data validation, and prevents importing duplicate prompts.
 * @returns {Promise<Object>} A promise that resolves with the result of the import operation,
 *   including success status, number of imported prompts, total prompts in the file, and a message.
 *   It also indicates if the user cancelled the operation.
 */
async function importSavedPrompts() {
    return new Promise((resolve, reject) => {
        try {
            // Create a file input element
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.style.display = 'none';

            // Add event listener for when a file is selected
            fileInput.addEventListener('change', async (event) => {
                if (!event.target.files || event.target.files.length === 0) {
                    document.body.removeChild(fileInput);
                    resolve({ success: false, error: 'No file selected', userCancelled: true });
                    return;
                }

                const file = event.target.files[0];
                console.log("[Import] Selected file:", file.name);

                try {
                    // Read the file contents
                    const fileContent = await readFileAsText(file);

                    // Parse the JSON content
                    let importData;
                    try {
                        importData = JSON.parse(fileContent);
                    } catch (error) {
                        console.error("[Import] Error parsing JSON:", error);
                        resolve({ success: false, error: 'Invalid JSON format' });
                        return;
                    }

                    // Validate the imported data
                    if (!importData || !importData.prompts || !Array.isArray(importData.prompts)) {
                        console.error("[Import] Invalid data format:", importData);
                        resolve({ success: false, error: 'Invalid data format' });
                        return;
                    }

                    // Get existing prompts
                    const { savedPrompts = [] } = await chrome.storage.local.get("savedPrompts");

                    // Create a set of existing prompt texts for quick lookup
                    const existingPromptsTexts = new Set(savedPrompts.map(prompt => prompt.text));

                    // Filter out prompts that already exist
                    const newPrompts = importData.prompts.filter(prompt =>
                        !existingPromptsTexts.has(prompt.text)
                    );

                    console.log(
                        `[Import] Found ${importData.prompts.length} prompts, ${newPrompts.length} are new`
                    );

                    if (newPrompts.length === 0) {
                        resolve({
                            success: true,
                            imported: 0,
                            total: importData.prompts.length,
                            message: 'All prompts already exist'
                        });
                        return;
                    }

                    // Combine the new prompts with existing ones
                    const updatedPrompts = [...savedPrompts, ...newPrompts];

                    // Sort by timestamp, newest first
                    updatedPrompts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                    // Save the updated prompts
                    await chrome.storage.local.set({ savedPrompts: updatedPrompts });

                    // Update the UI if the saved prompts panel is currently visible
                    if (typeof window.setSavedPromptsPanel === 'function') {
                        await window.setSavedPromptsPanel();
                    }

                    resolve({
                        success: true,
                        imported: newPrompts.length,
                        total: importData.prompts.length,
                        message: `Imported ${newPrompts.length} new prompts`
                    });

                } catch (error) {
                    console.error("[Import] Error processing file:", error);
                    resolve({ success: false, error: error.message });
                } finally {
                    // Clean up the file input
                    document.body.removeChild(fileInput);
                }
            });

            // Add the file input to the DOM and trigger click
            document.body.appendChild(fileInput);
            fileInput.click();

            // Add a click event listener to the window to detect if user clicks outside the file dialog
            const windowClickHandler = () => {
                // Check if input still exists and wasn't handled by the change event
                if (document.body.contains(fileInput)) {
                    // Set a timeout to check if a file was selected
                    setTimeout(() => {
                        if (document.body.contains(fileInput) && (!fileInput.files || fileInput.files.length === 0)) {
                            document.body.removeChild(fileInput);
                            console.log("[Import] File selection likely cancelled by user");
                            resolve({ success: false, error: 'File selection cancelled', userCancelled: true });
                            window.removeEventListener('click', windowClickHandler);
                        }
                    }, 500);
                }
            };

            // Register the handler with a small delay to avoid immediate triggering
            setTimeout(() => {
                window.addEventListener('click', windowClickHandler, { once: true });
            }, 1000);

            // Set a timeout as a fallback for cases when neither change event nor click events help
            setTimeout(() => {
                if (document.body.contains(fileInput)) {
                    document.body.removeChild(fileInput);
                    console.log("[Import] File selection timed out");
                    resolve({ success: false, error: 'File selection timed out', userCancelled: true });
                }
            }, 300000); // 5 minute timeout

        } catch (error) {
            console.error("[Import] Error setting up file input:", error);
            reject(error);
        }
    });
}

/**
 * FUNC - Helper function to read a file as text.
 * Reads the content of a given File object as a plain text string.
 * @param {File} file - The File object to read.
 * @returns {Promise<string>} A promise that resolves with the file's content as text, or rejects on error.
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

// Export functions for use in other files
window.exportImport = {
    exportSavedPrompts,
    importSavedPrompts
};
