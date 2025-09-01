// Declare Quill instances globally or in a scope accessible by other functions
let reflectionQuill;
let feedbackQuill;

// IndexedDB setup
const DB_NAME = 'ReflectDentDB';
const DB_VERSION = 1;
const STORE_NAME_CONTENT = 'content'; // For text content
const STORE_NAME_MEDIA = 'media';     // For images and videos

let db;

// Function to open/create the IndexedDB database
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            // Create object store for text content
            if (!db.objectStoreNames.contains(STORE_NAME_CONTENT)) {
                db.createObjectStore(STORE_NAME_CONTENT, { keyPath: 'id' });
            }
            // Create object store for media (images/videos)
            if (!db.objectStoreNames.contains(STORE_NAME_MEDIA)) {
                const mediaStore = db.createObjectStore(STORE_NAME_MEDIA, { keyPath: 'id', autoIncrement: true });
                mediaStore.createIndex('type', 'type', { unique: false });
            }
            console.log('IndexedDB upgrade complete');
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('IndexedDB opened successfully');
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.errorCode);
            showAppMessage("Error opening database. Media saving/loading might not work.");
            reject(event.target.error);
        };
    });
}

// Helper functions for IndexedDB transactions
function getObjectStore(storeName, mode) {
    const transaction = db.transaction([storeName], mode);
    return transaction.objectStore(storeName);
}

// --- Media (Images & Videos) IndexedDB Operations ---
async function addMediaToDB(mediaData, mediaType) {
    if (!db) {
        showAppMessage("Database not ready. Cannot save media.");
        return;
    }
    const store = getObjectStore(STORE_NAME_MEDIA, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.add({ type: mediaType, data: mediaData }); // Store raw data (ArrayBuffer)
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => {
            console.error('Error adding media:', e.target.error);
            showAppMessage(`Error saving ${mediaType}. It might be too large.`);
            reject(e.target.error);
        };
    });
}

async function getAllMediaFromDB() {
    if (!db) {
        showAppMessage("Database not ready. Cannot load media.");
        return [];
    }
    const store = getObjectStore(STORE_NAME_MEDIA, 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => {
            console.error('Error getting all media:', e.target.error);
            showAppMessage("Error loading media.");
            reject(e.target.error);
        };
    });
}

async function deleteMediaFromDB(id) {
    if (!db) {
        showAppMessage("Database not ready. Cannot delete media.");
        return;
    }
    const store = getObjectStore(STORE_NAME_MEDIA, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => {
            // Revoke Object URL if associated with this media item
            const mediaElement = document.querySelector(`[data-media-id="${id}"]`);
            if (mediaElement && mediaElement.dataset.objectUrl) {
                URL.revokeObjectURL(mediaElement.dataset.objectUrl);
                console.log(`Revoked Object URL for media ID: ${id}`);
            }
            resolve();
        };
        request.onerror = (e) => {
            console.error('Error deleting media:', e.target.error);
            showAppMessage("Error deleting media.");
            reject(e.target.error);
        };
    });
}

// Function to display messages (e.g., "Copied to clipboard!")
function showAppMessage(messageText) {
    const messageElement = document.getElementById('message');
    messageElement.textContent = messageText;
    messageElement.classList.add('show-message');
    setTimeout(() => {
        messageElement.classList.remove('show-message');
        messageElement.textContent = "";
    }, 3000); // Message disappears after 3 seconds
}

// Helper to convert Quill HTML to plain text for clipboard/share
function getQuillPlainText(quillInstance) {
    if (!quillInstance) return '';
    // Get text, replace multiple newlines with single, then trim
    return quillInstance.getText().replace(/\n{2,}/g, '\n').trim();
}

// Function to copy content to clipboard
async function copyContent() { // Made async to use await with navigator.clipboard.write
    const reflectionHtml = reflectionQuill.root.innerHTML;
    const feedbackHtml = feedbackQuill.root.innerHTML;
    const lastSavedTimestamp = document.getElementById('lastSavedTimestamp').textContent;
    const plainTextReflection = getQuillPlainText(reflectionQuill);
    const plainTextFeedback = getQuillPlainText(feedbackQuill);

    let mediaHtml = '';
    let mediaPlaintext = '';

    const allMedia = await getAllMediaFromDB(); // Fetch all media from IndexedDB
    if (allMedia.length > 0) {
        mediaPlaintext += "\nAttached Media:\n";
        allMedia.forEach((mediaItem, index) => {
            // Convert ArrayBuffer to Base64 for display/HTML embedding in clipboard
            const mimeType = mediaItem.type === 'image' ? 'image/png' : 'video/mp4'; // Assuming png for images, mp4 for videos
            const base64Data = arrayBufferToBase64(mediaItem.data, mimeType);
            
            if (mediaItem.type === 'image') {
                mediaPlaintext += `Image ${index + 1}: [Image Attached]\n`;
                mediaHtml += `<img src="${base64Data}" alt="Uploaded Image ${index + 1}" style="max-width: 100%; height: auto; display: block; margin-bottom: 10px; border-radius: 8px;">`;
            } else if (mediaItem.type === 'video') {
                mediaPlaintext += `Video ${index + 1}: [Video Attached]\n`;
                mediaHtml += `
                    <video controls src="${base64Data}" style="max-width: 100%; height: auto; display: block; margin-bottom: 10px; border-radius: 8px; background-color: #000;">
                        Your browser does not support the video tag.
                    </video>
                `;
            }
        });
    }

    // --- Prepare Plain Text Content for Clipboard Fallback / Non-HTML Paste ---
    let plainTextContent = `My Technical Reflection\n${lastSavedTimestamp}\n\n`;
    plainTextContent += `Reflection:\n${plainTextReflection}\n\n`;
    plainTextContent += `Lecturer Feedback:\n${plainTextFeedback}\n`;
    plainTextContent += mediaPlaintext;

    // --- Prepare HTML Content for Rich Text Clipboard Paste ---
    // Basic styling for the HTML content to be pasted
    // Note: Inline styles are used for maximum compatibility when pasting into different applications.
    const htmlStyle = `font-family: 'Inter', 'Lato', Arial, sans-serif; line-height: 1.65; color: #333;`;
    const headingStyle = `color: #2c3e50; font-size: 2em; font-weight: 600; text-align: center; margin-bottom: 10px;`;
    const subHeadingStyle = `color: #2c3e50; font-size: 1.5em; font-weight: 600; margin-top: 25px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;`;
    const timestampStyle = `font-size: 0.9em; color: #777; text-align: center; display: block; margin-bottom: 25px;`;
    const sectionContainerStyle = `background-color: #fafafa; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px; margin-bottom: 30px;`;
    const quillContentStyle = `margin-top: 15px;`; // For the div containing Quill's HTML output


    const htmlContent = `
        <div style="${htmlStyle}">
            <h1 style="${headingStyle}">My Technical Reflection</h1>
            <span style="${timestampStyle}">${lastSavedTimestamp}</span>
            
            <div style="${sectionContainerStyle}">
                <h2 style="${subHeadingStyle}">Your Reflection:</h2>
                <div style="${quillContentStyle}">${reflectionHtml}</div>
            </div>

            ${mediaHtml ? `<div style="${sectionContainerStyle}">
                <h2 style="${subHeadingStyle}">Attached Media:</h2>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 15px;">${mediaHtml}</div>
            </div>` : ''}

            <div style="${sectionContainerStyle}">
                <h2 style="${subHeadingStyle}">Lecturer Feedback:</h2>
                <div style="${quillContentStyle}">${feedbackHtml}</div>
            </div>
        </div>
    `;

    // Attempt to copy rich text first using Clipboard API
    if (navigator.clipboard && navigator.clipboard.write) {
        try {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([htmlContent], { type: 'text/html' }),
                    'text/plain': new Blob([plainTextContent], { type: 'text/plain' })
                })
            ]);
            showAppMessage("Content copied to clipboard with formatting. Paste into Word or rich text editor.");
        } catch (error) {
            console.error('Failed to copy rich text using Clipboard API:', error);
            // Fallback to plain text if rich text copy fails (e.g., permissions, iframe restrictions)
            copyPlainTextFallback(plainTextContent);
            showAppMessage("Content copied as plain text. Use 'Download as HTML File' for full content and media.");
        }
    } else {
        // Fallback for older browsers or if navigator.clipboard.write is not supported
        copyPlainTextFallback(plainTextContent);
        showAppMessage("Content copied as plain text. Use 'Download as HTML File' for full content and media.");
    }
}

// Helper function for plain text clipboard fallback
function copyPlainTextFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed'; // Prevents scrolling to the bottom
    textarea.style.left = '-9999px'; // Moves element off-screen
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
    } catch (err) {
        console.error('Failed to copy plain text via execCommand:', err);
    } finally {
        document.body.removeChild(textarea);
    }
}

// Functions for showing/hiding instructions
function showInstructions(text) {
    const instructionsContainer = document.getElementById('instructions-container');
    const instructionText = document.getElementById('instruction-text');
    instructionText.textContent = text;
    instructionsContainer.classList.remove('instructions-hidden');
    instructionsContainer.classList.add('instructions-visible');
}

function hideInstructions() {
    const instructionsContainer = document.getElementById('instructions-container');
    instructionsContainer.classList.remove('instructions-visible');
    instructionsContainer.classList.add('instructions-hidden');
}

// Function to trigger browser print dialog (for PDF saving)
function printPage() {
    hideInstructions();
    window.print();
    showInstructions(
        "To save as PDF: In the print dialog, select 'Save as PDF' (or similar option) instead of a printer. Note: Videos will not be visible in PDF."
    );
}

// Function to share content using Web Share API
function shareContent() {
    const reflectionText = getQuillPlainText(reflectionQuill);
    const feedbackText = getQuillPlainText(feedbackQuill);
    const lastSavedTimestamp = document.getElementById('lastSavedTimestamp').textContent;

    const shareSubject = 'My Technical Reflection';
    const shareBody = `My Technical Reflection\n${lastSavedTimestamp}\n\nReflection:\n${reflectionText}\n\nLecturer Feedback:\n${feedbackText}\n\nNote: Images and Videos are not included in direct sharing. Please use 'Download as HTML File' for full content.`;
    
    const appUrl = window.location.href;

    if (navigator.share) {
        navigator.share({
            title: shareSubject,
            text: shareBody,
            url: appUrl,
        })
        .then(() => {
            console.log('Content shared successfully');
            showInstructions("Content shared via your device's native sharing options!");
        })
        .catch((error) => {
            console.error('Error sharing:', error);
            if (error.name !== 'AbortError') {
                    showInstructions("Sharing failed. Your device might not support sharing this content directly, or an error occurred.");
            } else {
                    showInstructions("Sharing canceled. You closed the sharing menu.");
            }
        });
    } else {
        showInstructions(
            "Your browser does not support direct sharing. You can use 'Copy to Clipboard' or 'Print / Save as PDF' instead."
        );
    }
}


// --- Download as HTML File Function ---
async function downloadAsHtml() {
    const reflectionHtml = reflectionQuill.root.innerHTML;
    const feedbackHtml = feedbackQuill.root.innerHTML;
    const lastSavedTimestamp = document.getElementById('lastSavedTimestamp').textContent;

    let mediaHtml = '';
    const allMedia = await getAllMediaFromDB(); // Fetch all media
    allMedia.forEach(mediaItem => {
        const mimeType = mediaItem.type === 'image' ? 'image/png' : 'video/mp4'; // Assuming png for images, mp4 for videos
        const base64Data = arrayBufferToBase64(mediaItem.data, mimeType); // Convert ArrayBuffer to Base64 for embedding
        if (mediaItem.type === 'image') {
            mediaHtml += `<img src="${base64Data}" alt="Attached Image" style="max-width: 100%; height: auto; display: block; margin-bottom: 10px; border-radius: 8px;">`;
        } else if (mediaItem.type === 'video') {
            mediaHtml += `
                <video controls src="${base64Data}" style="max-width: 100%; height: auto; display: block; margin-bottom: 10px; border-radius: 8px; background-color: #000;">
                    Your browser does not support the video tag.
                </video>
            `;
        }
    });

    const fullHtmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Technical Reflection Export</title>
    <style>
        body { font-family: 'Inter', 'Lato', Arial, sans-serif; line-height: 1.65; color: #333; margin: 20px; background-color: #f8f8f8; }
        .container { max-width: 800px; margin: 0 auto; padding: 30px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; text-align: center; margin-bottom: 20px; font-size: 2em; }
        h2 { color: #2c3e50; margin-top: 25px; margin-bottom: 10px; font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 5px; } /* Adjusted to match main heading color */
        p { margin-bottom: 1em; }
        .timestamp { font-size: 0.9em; color: #777; text-align: center; margin-bottom: 20px; }
        .section { background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 10px; padding: 15px; margin-bottom: 20px; } /* Added frame like feedback section */
        .section-content { margin-top: 15px; }
        .quill-content img, .quill-content video { max-width: 100%; height: auto; display: block; margin: 10px auto; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .quill-content p, .quill-content ol, .quill-content ul { margin-bottom: 0.5em; } /* Adjust spacing for Quill content */
        .media-gallery { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 15px; }
        .media-gallery img, .media-gallery video { max-width: 150px; height: auto; border: 1px solid #ddd; border-radius: 5px; }

        /* Print specific styling for lecturer feedback */
        @media print {
            .lecturer-feedback-section h2 {
                color: #2c3e50; /* Darker heading for feedback in print, matching main title */
                background-color: #f2f2f2; /* Light grey background for heading bar */
                padding: 5px 10px;
                border-radius: 5px;
                border: 1px solid #ccc;
            }
            .lecturer-feedback-section .section-content {
                background-color: #ffffff; /* White background for content within feedback section */
                border: 1px dashed #ccc; /* Dashed border for feedback content */
                padding: 10px;
                border-radius: 5px;
            }
            /* Add print styling for .section by default, ensuring it's framed too */
            .section {
                background-color: #f9f9f9;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 15px;
            }
             h2[data-original-text="Attach Relevant Media (Optional)"]:before {
                content: "Attached Media"; /* Change text for print */
            }
            h2[data-original-text="Attach Relevant Media (Optional)"] {
                content: ""; /* Hide original text */
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>My Technical Reflection</h1>
        <p class="timestamp">${lastSavedTimestamp}</p>

        <div class="section">
            <h2>Your Reflection:</h2>
            <div class="section-content quill-content">
                ${reflectionHtml}
            </div>
        </div>

        ${mediaHtml ? `<div class="section">
            <h2>Attached Media:</h2>
            <div class="media-gallery">
                ${mediaHtml}
            </div>
        </div>` : ''}

        <div class="section lecturer-feedback-section">
            <h2>Lecturer Feedback:</h2>
            <div class="section-content quill-content">
                ${feedbackHtml}
            </div>
        </div>
    </div>
</body>
</html>
    `;

    const blob = new Blob([fullHtmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MyTechnicalReflection.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Revoke the temporary URL
    showAppMessage("Reflection saved as HTML file!");
}


// --- Local Storage Functions (Now mostly for text content and theme) ---
// Kept for compatibility, but media moved to IndexedDB
const LOCAL_STORAGE_KEY_REFLECTION = 'myTechnicalReflection_reflection_quill';
const LOCAL_STORAGE_KEY_FEEDBACK = 'myTechnicalReflection_feedback_quill';
const LOCAL_STORAGE_KEY_TIMESTAMP = 'myTechnicalReflection_timestamp';
const LOCAL_STORAGE_KEY_THEME = 'myTechnicalReflection_theme';

async function saveContentToLocalStorage() {
    // Save Quill HTML content to localStorage (for now, eventually IndexedDB for text too)
    const reflectionHtml = reflectionQuill.root.innerHTML;
    const feedbackHtml = feedbackQuill.root.innerHTML;
    
    localStorage.setItem(LOCAL_STORAGE_KEY_REFLECTION, reflectionHtml);
    localStorage.setItem(LOCAL_STORAGE_KEY_FEEDBACK, feedbackHtml);

    // Save current timestamp
    const now = new Date();
    const timestampString = now.toLocaleString();
    localStorage.setItem(LOCAL_STORAGE_KEY_TIMESTAMP, timestampString);
    updateTimestampDisplay(timestampString);

    // Media are saved instantly when uploaded/removed via handleMediaUpload/deleteMediaFromDB
}

async function loadContentFromLocalStorage() {
    const reflectionHtml = localStorage.getItem(LOCAL_STORAGE_KEY_REFLECTION);
    const feedbackHtml = localStorage.getItem(LOCAL_STORAGE_KEY_FEEDBACK);
    const timestamp = localStorage.getItem(LOCAL_STORAGE_KEY_TIMESTAMP);
    const savedTheme = localStorage.getItem(LOCAL_STORAGE_KEY_THEME);

    // Set Quill content (only if Quill instances exist)
    if (reflectionQuill && reflectionHtml) {
        reflectionQuill.root.innerHTML = reflectionHtml;
    }
    if (feedbackQuill && feedbackHtml) {
        feedbackQuill.root.innerHTML = feedbackHtml;
    }

    const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');
    // Clear existing media previews before loading new ones
    // First, revoke all existing object URLs to prevent memory leaks
    mediaPreviewContainer.querySelectorAll('.uploaded-media-preview').forEach(mediaEl => {
        if (mediaEl.dataset.objectUrl) {
            URL.revokeObjectURL(mediaEl.dataset.objectUrl);
        }
    });
    mediaPreviewContainer.innerHTML = ''; // Clear all children

    // Create or re-create the noMediaMessage placeholder
    let noMediaMessage = document.getElementById('noMediaMessage');
    if (!noMediaMessage) {
        noMediaMessage = document.createElement('span');
        noMediaMessage.classList.add('no-media-selected');
        noMediaMessage.id = 'noMediaMessage';
        noMediaMessage.textContent = 'No media selected yet.';
        mediaPreviewContainer.appendChild(noMediaMessage);
    } else {
        if (!mediaPreviewContainer.contains(noMediaMessage)) {
            mediaPreviewContainer.appendChild(noMediaMessage);
        }
    }

    const allMedia = await getAllMediaFromDB();
    if (allMedia && allMedia.length > 0) {
        if (noMediaMessage) noMediaMessage.style.display = 'none';
        allMedia.forEach(mediaItem => {
            const mediaBlob = new Blob([mediaItem.data], { type: mediaItem.type === 'image' ? 'image/png' : 'video/mp4' }); // Recreate Blob
            if (mediaItem.type === 'image') {
                createImagePreviewElement(mediaBlob, mediaItem.id); // Pass Blob and ID
            } else if (mediaItem.type === 'video') {
                createVideoPreviewElement(mediaBlob, mediaItem.id); // Pass Blob and ID
            }
        });
    } else {
        if (noMediaMessage) noMediaMessage.style.display = 'block';
    }

    if (timestamp) {
        updateTimestampDisplay(timestamp);
    } else {
        updateTimestampDisplay("Never");
    }

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggle.checked = true;
        } else {
            document.body.classList.remove('dark-mode');
            themeToggle.checked = false;
        }
    }
}

// Helper to convert ArrayBuffer to Base64 string for embedding in HTML exports
function arrayBufferToBase64(buffer, mimeType) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
}

// Helper to convert Blob to ArrayBuffer
function blobToArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
}

// Function to update the timestamp display
function updateTimestampDisplay(timestampString) {
    document.getElementById('lastSavedTimestamp').textContent = `Last saved: ${timestampString}`;
}


// --- Word/Character Count Functions (Adapted for Quill) ---
function updateWordCharCount(quillInstance, wordCountId, charCountId) {
    if (!quillInstance) return; // Ensure Quill is initialized
    const text = quillInstance.getText(); // Get plain text from Quill
    const charCount = text.length - 1; // Subtract 1 for the trailing newline Quill adds
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;

    document.getElementById(wordCountId).textContent = `${wordCount} words`;
    document.getElementById(charCountId).textContent = `${charCount} characters`;
}

// --- Prompt Insertion Function (Adapted for Quill) ---
const reflectionPrompts = {
    well: "What went well during this piece of work? What were the successes and positive outcomes?",
    challenging: "What challenges did you face, and how did you attempt to overcome them? What didn't go as planned?",
    future: "Based on this experience, what specific areas will you focus on for improvement? What will you change or work on in future similar tasks?",
    star: "Situation: Describe the situation or context.\nTask: Explain the task you needed to complete.\nAction: Detail the actions you took to address the task.\nResult: Describe the outcome of your actions and what you learned."
};

function insertPrompt() {
    const promptSelect = document.getElementById('promptSelect');
    const selectedPromptKey = promptSelect.value;

    if (selectedPromptKey && reflectionPrompts[selectedPromptKey] && reflectionQuill) {
        const promptText = reflectionPrompts[selectedPromptKey];
        // Insert text into Quill editor and make it bold
        const currentSelection = reflectionQuill.getSelection();
        const currentIndex = currentSelection ? currentSelection.index : reflectionQuill.getLength(); // Get current cursor position or end of document
        
        reflectionQuill.insertText(currentIndex, promptText, 'user'); // Insert text
        reflectionQuill.formatText(currentIndex, promptText.length, 'bold', true, 'user'); // Apply bold format
        reflectionQuill.insertText(currentIndex + promptText.length, "\n\n", 'user'); // Add newlines after bold text
        
        reflectionQuill.setSelection(currentIndex + promptText.length + 2, 0); // Set cursor after inserted text
        
        reflectionQuill.focus(); // Keep focus on editor
        saveContentToLocalStorage(); // Save after inserting prompt
        updateWordCharCount(reflectionQuill, 'reflectionWordCount', 'reflectionCharCount');
        promptSelect.value = ""; // Reset dropdown after insertion
    }
}

// --- Theme Toggling Function ---
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem(LOCAL_STORAGE_KEY_THEME, isDarkMode ? 'dark' : 'light');
}


// --- Microphone Dictation Functionality (Adapted for Quill) ---
let recognition = null;
let isListening = false;
let activeQuillEditor = null; // To keep track of which Quill editor is being dictated to

function setupSpeechRecognition() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-GB';

        recognition.onstart = () => {
            console.log('Speech recognition started');
            isListening = true;
            const micButton = document.querySelector(`button[data-target="${activeQuillEditor.container.id}"]`);
            if (micButton) micButton.classList.add('listening');
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            
            if (activeQuillEditor) {
                const currentSelection = activeQuillEditor.getSelection();
                const insertIndex = currentSelection ? currentSelection.index : activeQuillEditor.getLength();
                
                // This logic is simplified for Quill. For robust interim results with rich text,
                // you'd typically manage deltas for efficiency.
                // For now, we append text and then update/replace if it's a final segment.
                
                // Check if current text ends with previous interim part
                const currentQuillText = activeQuillEditor.getText();
                if (currentQuillText.endsWith(interimTranscript + '\n')) { // Quill adds a trailing newline
                    activeQuillEditor.deleteText(currentQuillText.length - (interimTranscript.length + 1), interimTranscript.length + 1, 'silent');
                } else if (currentQuillText.endsWith(interimTranscript)) {
                     activeQuillEditor.deleteText(currentQuillText.length - interimTranscript.length, interimTranscript.length, 'silent');
                }


                activeQuillEditor.insertText(insertIndex, finalTranscript || interimTranscript, 'user');
                activeQuillEditor.setSelection(insertIndex + (finalTranscript || interimTranscript).length, 0); // Move cursor to end
                
                saveContentToLocalStorage();
                updateWordCharCount(activeQuillEditor, `${activeQuillEditor.container.id}WordCount`, `${activeQuillEditor.container.id}CharCount`);
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            isListening = false;
            document.querySelectorAll('.microphone-button').forEach(button => button.classList.remove('listening'));
            if (event.error === 'no-speech') {
                showAppMessage('No speech detected. Please try again.');
            } else if (event.error === 'not-allowed') {
                showAppMessage('Microphone access denied. Please allow microphone permissions in your browser settings.');
            } else {
                showAppMessage('An error occurred with speech recognition.');
            }
        };

        recognition.onend = () => {
            console.log('Speech recognition ended');
            isListening = false;
            document.querySelectorAll('.microphone-button').forEach(button => button.classList.remove('listening'));
            saveContentToLocalStorage();
            if (activeQuillEditor) {
                    updateWordCharCount(activeQuillEditor, `${activeQuillEditor.container.id}WordCount`, `${activeQuillEditor.container.id}CharCount`);
            }
            activeQuillEditor = null; // Clear active editor
        };

    } else {
        console.warn('Web Speech API is not supported in this browser.');
        document.querySelectorAll('.microphone-button').forEach(button => button.style.display = 'none');
    }
}

// --- Media Upload Handling (Unified for Images and Videos) ---
const MAX_VIDEO_SIZE_MB = 100; // Example limit for videos (100MB)
const MAX_IMAGE_SIZE_MB = 10; // Example limit for images (10MB)

async function handleMediaUpload(event, mediaType) {
    const files = event.target.files;
    const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');
    const noMediaMessageElement = document.getElementById('noMediaMessage');

    if (files.length === 0) {
        if (mediaPreviewContainer.querySelectorAll('.media-preview-wrapper').length === 0) {
            if (noMediaMessageElement) noMediaMessageElement.style.display = 'block';
        }
        return;
    }

    if (noMediaMessageElement) noMediaMessageElement.style.display = 'none';

    for (const file of files) {
        const fileSizeMB = file.size / (1024 * 1024);
        if (mediaType === 'video' && fileSizeMB > MAX_VIDEO_SIZE_MB) {
            showAppMessage(`Video "${file.name}" is too large (${fileSizeMB.toFixed(2)}MB). Max size: ${MAX_VIDEO_SIZE_MB}MB.`);
            continue;
        }
        if (mediaType === 'image' && fileSizeMB > MAX_IMAGE_SIZE_MB) {
            showAppMessage(`Image "${file.name}" is too large (${fileSizeMB.toFixed(2)}MB). Max size: ${MAX_IMAGE_SIZE_MB}MB.`);
            continue;
        }

        const arrayBuffer = await blobToArrayBuffer(file);
        const mediaId = await addMediaToDB(arrayBuffer, mediaType); // Store raw ArrayBuffer

        // Create Object URL for immediate preview (revoked later)
        const objectUrl = URL.createObjectURL(file);

        if (mediaType === 'image') {
            createImagePreviewElement(objectUrl, mediaId); // Pass objectUrl and ID
        } else if (mediaType === 'video') {
            createVideoPreviewElement(objectUrl, mediaId); // Pass objectUrl and ID
        }
    }
    // No need to call saveContentToLocalStorage here as media are saved immediately
}


// --- Media Preview Element Creation ---
let cropper; // Cropper.js instance
const imageCropperModal = document.getElementById('imageCropperModal');
const imageToCrop = document.getElementById('imageToCrop');
const cropDoneBtn = document.getElementById('cropDoneBtn');
const cropCancelBtn = document.getElementById('cropCancelBtn');

// Helper to create an image preview element
function createImagePreviewElement(objectUrl, id) { // Now accepts objectUrl
    const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');

    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = `Uploaded Image`;
    img.classList.add('uploaded-media-preview'); // Unified class
    img.dataset.mediaId = id; // Store DB ID
    img.dataset.objectUrl = objectUrl; // Store object URL for revocation

    const mediaWrapper = document.createElement('div');
    mediaWrapper.classList.add('media-preview-wrapper'); // Unified class
    mediaWrapper.appendChild(img);

    const removeButton = document.createElement('button');
    removeButton.textContent = 'x';
    removeButton.classList.add('remove-media-button'); // Unified class
    removeButton.title = 'Remove Media';
    removeButton.onclick = async () => {
        // Revoke Object URL before deleting from DB and DOM
        URL.revokeObjectURL(objectUrl);
        console.log(`Revoked Object URL for image preview: ${objectUrl}`);

        await deleteMediaFromDB(id); // This already revokes its own internal object URL if found
        mediaWrapper.remove();
        checkAndToggleNoMediaMessage();
        showAppMessage("Image removed.");
    };
    mediaWrapper.appendChild(removeButton);

    // Event listener for cropping (only for images)
    img.addEventListener('click', () => {
        imageToCrop.src = img.src;
        imageCropperModal.classList.add('active');

        // Destroy previous cropper instance if exists
        if (cropper) {
            cropper.destroy();
        }
        // Initialize Cropper
        cropper = new Cropper(imageToCrop, {
            aspectRatio: 1, // You can change this
            viewMode: 1,    // Restrict the crop box to not exceed the canvas
            autoCropArea: 0.8 // Crop box covers 80% of the image
        });

        // Store a reference to the original image element to update it later
        cropper.originalImageElement = img;
    });

    mediaPreviewContainer.appendChild(mediaWrapper);
}

// Helper to create a video preview element
function createVideoPreviewElement(objectUrl, id) { // Now accepts objectUrl
    const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');

    const video = document.createElement('video');
    video.src = objectUrl;
    video.controls = true; // Show playback controls
    video.classList.add('uploaded-media-preview'); // Unified class
    video.dataset.mediaId = id; // Store DB ID
    video.dataset.objectUrl = objectUrl; // Store object URL for revocation
    video.title = 'Click to play/pause'; // Add a title

    const mediaWrapper = document.createElement('div');
    mediaWrapper.classList.add('media-preview-wrapper'); // Unified class
    mediaWrapper.appendChild(video);

    const removeButton = document.createElement('button');
    removeButton.textContent = 'x';
    removeButton.classList.add('remove-media-button'); // Unified class
    removeButton.title = 'Remove Media';
    removeButton.onclick = async () => {
        // Revoke Object URL before deleting from DB and DOM
        URL.revokeObjectURL(objectUrl);
        console.log(`Revoked Object URL for video preview: ${objectUrl}`);

        await deleteMediaFromDB(id); // This already revokes its own internal object URL if found
        mediaWrapper.remove();
        checkAndToggleNoMediaMessage();
        showAppMessage("Video removed.");
    };
    mediaWrapper.appendChild(removeButton);

    mediaPreviewContainer.appendChild(mediaWrapper);
}


// Function to check if media container is empty and toggle message
function checkAndToggleNoMediaMessage() {
    const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');
    const noMediaMessageElement = document.getElementById('noMediaMessage');
    if (mediaPreviewContainer.querySelectorAll('.media-preview-wrapper').length === 0) {
        if (noMediaMessageElement) noMediaMessageElement.style.display = 'block';
    } else {
        if (noMediaMessageElement) noMediaMessageElement.style.display = 'none';
    }
}


// Cropper.js event listeners
if (cropDoneBtn) {
    cropDoneBtn.addEventListener('click', () => {
        if (cropper) {
            const croppedCanvas = cropper.getCroppedCanvas();
            // Convert cropped canvas to Blob for efficient IndexedDB storage
            croppedCanvas.toBlob(async (blob) => {
                if (blob) {
                    const originalImageElement = cropper.originalImageElement;
                    if (originalImageElement) {
                        const originalId = parseInt(originalImageElement.dataset.mediaId);
                        const arrayBuffer = await blobToArrayBuffer(blob);

                        // Update the entry in IndexedDB
                        const store = getObjectStore(STORE_NAME_MEDIA, 'readwrite');
                        const request = store.put({ id: originalId, type: 'image', data: arrayBuffer });
                        request.onsuccess = () => {
                            // Revoke old object URL if exists
                            if (originalImageElement.dataset.objectUrl) {
                                URL.revokeObjectURL(originalImageElement.dataset.objectUrl);
                                console.log(`Revoked old Object URL after crop: ${originalImageElement.dataset.objectUrl}`);
                            }
                            // Create new object URL for the updated image
                            const newObjectUrl = URL.createObjectURL(blob);
                            originalImageElement.src = newObjectUrl;
                            originalImageElement.dataset.objectUrl = newObjectUrl; // Store new object URL
                            showAppMessage("Image cropped and saved!");
                        };
                        request.onerror = (e) => {
                            console.error("Error updating cropped image in DB:", e.target.error);
                            showAppMessage("Failed to save cropped image.");
                        };
                    }
                } else {
                    showAppMessage("Failed to get blob from cropped canvas.");
                }
            }, 'image/png'); // Specify MIME type
            cropper.destroy();
        }
        imageCropperModal.classList.remove('active');
    });
}

if (cropCancelBtn) {
    cropCancelBtn.addEventListener('click', () => {
        if (cropper) {
            cropper.destroy();
        }
        imageCropperModal.classList.remove('active');
        showAppMessage("Image cropping canceled.");
    });
}

// Cropper control buttons
document.getElementById('rotateLeftBtn')?.addEventListener('click', () => cropper?.rotate(-45));
document.getElementById('rotateRightBtn')?.addEventListener('click', () => cropper?.rotate(45));
document.getElementById('zoomInBtn')?.addEventListener('click', () => cropper?.zoom(0.1));
document.getElementById('zoomOutBtn')?.addEventListener('click', () => cropper?.zoom(-0.1));
document.getElementById('resetCropperBtn')?.addEventListener('click', () => cropper?.reset());


// --- Clear All Data Functions ---
function showConfirmationModal() {
    const modalOverlay = document.getElementById('confirmationModal');
    modalOverlay.classList.add('active'); // Add active class to display modal
}

function hideConfirmationModal() {
    const modalOverlay = document.getElementById('confirmationModal');
    modalOverlay.classList.remove('active'); // Remove active class to hide modal
}

async function clearAppData() {
    // Clear Quill editors
    if (reflectionQuill) reflectionQuill.setText('');
    if (feedbackQuill) feedbackQuill.setText('');

    // Revoke all current Object URLs to prevent memory leaks
    const mediaElements = document.querySelectorAll('.uploaded-media-preview');
    mediaElements.forEach(mediaEl => {
        if (mediaEl.dataset.objectUrl) {
            URL.revokeObjectURL(mediaEl.dataset.objectUrl);
            console.log(`Revoked Object URL during clear: ${mediaEl.dataset.objectUrl}`);
        }
    });

    // Clear media from IndexedDB
    if (db) {
        const store = getObjectStore(STORE_NAME_MEDIA, 'readwrite');
        const request = store.clear(); // Clear all objects from the media store
        request.onsuccess = () => {
            console.log('Media store cleared.');
        };
        request.onerror = (e) => {
            console.error('Error clearing media store:', e.target.error);
        };
    }

    // Clear media display
    const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');
    mediaPreviewContainer.innerHTML = '';
    const newNoMediaMessage = document.createElement('span');
    newNoMediaMessage.classList.add('no-media-selected');
    newNoMediaMessage.id = 'noMediaMessage';
    newNoMediaMessage.textContent = 'No media selected yet.';
    mediaPreviewContainer.appendChild(newNoMediaMessage);
    newNoMediaMessage.style.display = 'block';

    // Clear local storage (text content and timestamp)
    localStorage.removeItem(LOCAL_STORAGE_KEY_REFLECTION);
    localStorage.removeItem(LOCAL_STORAGE_KEY_FEEDBACK);
    localStorage.removeItem(LOCAL_STORAGE_KEY_TIMESTAMP);

    // Reset timestamp and counts
    updateTimestampDisplay("Never");
    updateWordCharCount(reflectionQuill, 'reflectionWordCount', 'reflectionCharCount');
    updateWordCharCount(feedbackQuill, 'feedbackWordCount', 'feedbackCharCount');

    showAppMessage("All data cleared successfully!");
    hideConfirmationModal(); // Hide modal after clearing
}


// --- DOMContentLoaded: All event listeners and initial setup ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize IndexedDB
    await openDatabase(); // Ensure DB is open before trying to load/save content

    // Initialize Quill Editors
    const toolbarOptions = [
        ['bold', 'italic', 'underline', 'strike'],     // toggled buttons
        ['blockquote'],

        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

        [{ 'color': [] }, { 'background': [] }],       // dropdown with defaults from theme
        [{ 'font': [] }],
        [{ 'align': [] }],

        ['clean']                                      // remove formatting button
    ];

    reflectionQuill = new Quill('#reflection', {
        theme: 'snow',
        modules: {
            toolbar: toolbarOptions
        },
        placeholder: 'Type your reflection here...'
    });

    feedbackQuill = new Quill('#feedback', {
        theme: 'snow',
        modules: {
            toolbar: toolbarOptions
        },
        placeholder: 'Type or ask the lecturer to dictate their feedback here...'
    });

    // Load previously saved content and theme preference on page load
    await loadContentFromLocalStorage(); // This will populate Quill editors and media if content exists

    // --- Add event listeners for saving content on Quill text-change ---
    reflectionQuill.on('text-change', () => {
        saveContentToLocalStorage();
        updateWordCharCount(reflectionQuill, 'reflectionWordCount', 'reflectionCharCount');
    });
    feedbackQuill.on('text-change', () => {
        saveContentToLocalStorage();
        updateWordCharCount(feedbackQuill, 'feedbackWordCount', 'feedbackCharCount');
    });

    // Initial update of counts on load (after potential content load from local storage)
    updateWordCharCount(reflectionQuill, 'reflectionWordCount', 'reflectionCharCount');
    updateWordCharCount(feedbackQuill, 'feedbackWordCount', 'feedbackCharCount');


    // --- Media Upload Handling ---
    const imageUploadCamera = document.getElementById('imageUploadCamera');
    const imageUploadGallery = document.getElementById('imageUploadGallery');
    const videoUploadCamera = document.getElementById('videoUploadCamera');
    const videoUploadGallery = document.getElementById('videoUploadGallery');
    
    if (imageUploadCamera) {
        imageUploadCamera.addEventListener('change', (event) => handleMediaUpload(event, 'image'));
    }
    if (imageUploadGallery) {
        imageUploadGallery.addEventListener('change', (event) => handleMediaUpload(event, 'image'));
    }
    if (videoUploadCamera) {
        videoUploadCamera.addEventListener('change', (event) => handleMediaUpload(event, 'video'));
    }
    if (videoUploadGallery) {
        videoUploadGallery.addEventListener('change', (event) => handleMediaUpload(event, 'video'));
    }

    // --- Microphone Dictation Functionality Event Listeners ---
    setupSpeechRecognition(); // Call the setup function once

    const microphoneButtons = document.querySelectorAll('.microphone-button');
    microphoneButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;
            
            if (targetId === 'reflection') {
                activeQuillEditor = reflectionQuill;
            } else if (targetId === 'feedback') {
                activeQuillEditor = feedbackQuill;
            }

            if (isListening && recognition) {
                recognition.stop();
                if (button.classList.contains('listening')) {
                    button.classList.remove('listening');
                    isListening = false;
                    return;
                }
            }

            microphoneButtons.forEach(btn => btn.classList.remove('listening'));
            button.classList.add('listening');
            
            if (recognition && activeQuillEditor) {
                recognition.start();
                activeQuillEditor.focus();
            }
        });
    });

    // --- Prompt Insertion Event Listener ---
    document.getElementById('insertPromptBtn').addEventListener('click', insertPrompt);

    // --- Theme Toggle Event Listener ---
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', toggleTheme);
    }

    // --- Clear All Data Button Event Listener ---
    const clearAllDataBtn = document.getElementById('clearAllDataBtn');
    if (clearAllDataBtn) {
        clearAllDataBtn.addEventListener('click', showConfirmationModal);
    }

    // --- Confirmation Modal Button Event Listeners ---
    const confirmYesBtn = document.getElementById('confirmYes');
    const confirmNoBtn = document.getElementById('confirmNo');
    if (confirmYesBtn) {
        confirmYesBtn.addEventListener('click', clearAppData);
    }
    if (confirmNoBtn) {
        confirmNoBtn.addEventListener('click', hideConfirmationModal);
    }

    // PWA: Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js')
                .then(registration => {
                    console.log('Service Worker registered with scope:', registration.scope);
                })
                .catch(error => {
                    console.error('Service Worker registration failed:', error);
                });
        });
    }
});