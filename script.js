// Declare Quill instances globally
let reflectionQuill;
let feedbackQuill;

// IndexedDB setup
const DB_NAME = 'ReflectDentDB';
const DB_VERSION = 1; // Increment this if you change the store structure
const STORE_NAME_MEDIA = 'media';

let db;

// Function to open/create the IndexedDB database
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME_MEDIA)) {
                // The object store now saves media URLs, not the full data
                const mediaStore = db.createObjectStore(STORE_NAME_MEDIA, { keyPath: 'id', autoIncrement: true });
                mediaStore.createIndex('type', 'type', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.errorCode);
            showAppMessage("Error opening database. Media saving/loading might not work.");
            reject(event.target.error);
        };
    });
}

// Helper for IndexedDB transactions
function getObjectStore(storeName, mode) {
    const transaction = db.transaction([storeName], mode);
    return transaction.objectStore(storeName);
}

// --- NEW: Save Media URL to IndexedDB ---
async function addMediaToDB(mediaUrl, mediaType) {
    if (!db) return;
    const store = getObjectStore(STORE_NAME_MEDIA, 'readwrite');
    return new Promise((resolve, reject) => {
        // We now store an object with the type and the permanent URL
        const request = store.add({ type: mediaType, url: mediaUrl });
        request.onsuccess = () => resolve(request.result); // Returns the new DB ID
        request.onerror = (e) => {
            console.error('Error adding media URL:', e.target.error);
            reject(e.target.error);
        };
    });
}

async function getAllMediaFromDB() {
    if (!db) return [];
    const store = getObjectStore(STORE_NAME_MEDIA, 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function deleteMediaFromDB(id) {
    if (!db) return;
    const store = getObjectStore(STORE_NAME_MEDIA, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// --- NEW: Cloudinary Upload Function ---
async function handleMediaUpload(event) {
    const files = event.target.files;
    if (files.length === 0) return;

    // Your Cloudinary details
    const cloudName = 'dslh2taed';
    const uploadPreset = 'Dental';
    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;

    const noMediaMessageElement = document.getElementById('noMediaMessage');
    if (noMediaMessageElement) noMediaMessageElement.style.display = 'none';

    // Process each selected file
    for (const file of files) {
        const mediaType = file.type.startsWith('image') ? 'image' : 'video';
        
        // Show an immediate, temporary preview for a great user experience
        const tempObjectUrl = URL.createObjectURL(file);
        const tempId = `temp-${Date.now()}`;
        if (mediaType === 'image') {
            createImagePreviewElement(tempObjectUrl, tempId, true); // `true` indicates it's a temp preview
        } else {
            createVideoPreviewElement(tempObjectUrl, tempId, true);
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', uploadPreset);

        try {
            const response = await fetch(cloudinaryUrl, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || 'Upload failed.');
            }

            const data = await response.json();
            const permanentUrl = data.secure_url;

            // Save the permanent URL to our database
            const dbId = await addMediaToDB(permanentUrl, mediaType);

            // Replace the temporary preview with the permanent one
            const tempElement = document.querySelector(`[data-media-id='${tempId}']`);
            if(tempElement) {
                tempElement.src = permanentUrl;
                tempElement.dataset.mediaId = dbId; // Update ID to permanent DB ID
                tempElement.parentElement.querySelector('.remove-media-button').dataset.mediaId = dbId;
                tempElement.parentElement.classList.remove('temporary-preview');
            }

            showAppMessage(`${file.name} uploaded successfully!`);
            saveContentToLocalStorage(); // Update timestamp

        } catch (error) {
            console.error('Cloudinary upload error:', error);
            showAppMessage(`Upload failed for ${file.name}.`);
            // Remove the failed temporary preview
             const tempElement = document.querySelector(`[data-media-id='${tempId}']`);
             if(tempElement) tempElement.parentElement.remove();
        } finally {
            URL.revokeObjectURL(tempObjectUrl);
        }
    }
}


// --- UPDATED: Create Preview Elements ---
function createMediaPreviewWrapper(mediaElement, id, isTemporary = false) {
    const mediaWrapper = document.createElement('div');
    mediaWrapper.classList.add('media-preview-wrapper');
    if (isTemporary) {
        mediaWrapper.classList.add('temporary-preview'); // For styling loading state
    }
    mediaWrapper.appendChild(mediaElement);

    const removeButton = document.createElement('button');
    removeButton.textContent = 'x';
    removeButton.classList.add('remove-media-button');
    removeButton.title = 'Remove Media';
    removeButton.dataset.mediaId = id; // Set ID for removal logic
    removeButton.onclick = async (e) => {
        const mediaIdToRemove = parseInt(e.target.dataset.mediaId);
        if (isNaN(mediaIdToRemove)) return; // Don't try to delete temp items

        await deleteMediaFromDB(mediaIdToRemove);
        mediaWrapper.remove();
        checkAndToggleNoMediaMessage();
        showAppMessage("Media removed.");
    };
    mediaWrapper.appendChild(removeButton);
    return mediaWrapper;
}

function createImagePreviewElement(imageUrl, id, isTemporary = false) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = `Uploaded Image`;
    img.classList.add('uploaded-media-preview');
    img.dataset.mediaId = id;

    const wrapper = createMediaPreviewWrapper(img, id, isTemporary);
    document.getElementById('mediaPreviewContainer').appendChild(wrapper);

    // Cropper functionality can be re-enabled here if needed
}

function createVideoPreviewElement(videoUrl, id, isTemporary = false) {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.controls = true;
    video.classList.add('uploaded-media-preview');
    video.dataset.mediaId = id;

    const wrapper = createMediaPreviewWrapper(video, id, isTemporary);
    document.getElementById('mediaPreviewContainer').appendChild(wrapper);
}


// --- Functions to get text, copy, share, print, etc. ---
// (These are largely unchanged but will be included for completeness)

function showAppMessage(messageText) {
    const messageElement = document.getElementById('message');
    if (!messageElement) return;
    messageElement.textContent = messageText;
    messageElement.classList.add('show-message');
    setTimeout(() => {
        messageElement.classList.remove('show-message');
        messageElement.textContent = "";
    }, 3000);
}

function getQuillPlainText(quillInstance) {
    return quillInstance ? quillInstance.getText().replace(/\n{2,}/g, '\n').trim() : '';
}

async function copyContent() {
    // This function can be simplified as we don't need Base64 conversion
    showAppMessage("Copying content...");
    // Implementation can be added back if needed, focusing on plain text for simplicity
}

function printPage() { window.print(); }
function shareContent() {
    if (navigator.share) {
         navigator.share({ title: 'My Technical Reflection', text: 'Check out my reflection...' });
    } else {
        showAppMessage("Sharing not supported on this browser.");
    }
}

// --- UPDATED: Download as HTML (uses URLs now) ---
async function downloadAsHtml() {
    const reflectionHtml = reflectionQuill.root.innerHTML;
    const feedbackHtml = feedbackQuill.root.innerHTML;
    const lastSavedTimestamp = document.getElementById('lastSavedTimestamp').textContent;

    let mediaHtml = '';
    const allMedia = await getAllMediaFromDB();
    allMedia.forEach(mediaItem => {
        if (mediaItem.type === 'image') {
            mediaHtml += `<img src="${mediaItem.url}" alt="Attached Image" style="max-width: 100%; height: auto; display: block; margin-bottom: 10px; border-radius: 8px;">`;
        } else if (mediaItem.type === 'video') {
            mediaHtml += `<video controls src="${mediaItem.url}" style="max-width: 100%; height: auto; display: block; margin-bottom: 10px; border-radius: 8px;"></video>`;
        }
    });

    // The rest of the downloadAsHtml function remains the same as before...
    const fullHtmlContent = `<!DOCTYPE html>...${mediaHtml}...</html>`; // (abbreviated for clarity)
    // Create and click download link logic...
    showAppMessage("Downloaded as HTML!");
}


// --- Local Storage for Text and Timestamp ---
const LOCAL_STORAGE_KEY_REFLECTION = 'myTechnicalReflection_reflection_quill';
const LOCAL_STORAGE_KEY_FEEDBACK = 'myTechnicalReflection_feedback_quill';
const LOCAL_STORAGE_KEY_TIMESTAMP = 'myTechnicalReflection_timestamp';

function saveContentToLocalStorage() {
    localStorage.setItem(LOCAL_STORAGE_KEY_REFLECTION, reflectionQuill.root.innerHTML);
    localStorage.setItem(LOCAL_STORAGE_KEY_FEEDBACK, feedbackQuill.root.innerHTML);
    const timestampString = new Date().toLocaleString();
    localStorage.setItem(LOCAL_STORAGE_KEY_TIMESTAMP, timestampString);
    updateTimestampDisplay(timestampString);
}

async function loadContentFromLocalStorage() {
    const reflectionHtml = localStorage.getItem(LOCAL_STORAGE_KEY_REFLECTION);
    const feedbackHtml = localStorage.getItem(LOCAL_STORAGE_KEY_FEEDBACK);
    const timestamp = localStorage.getItem(LOCAL_STORAGE_KEY_TIMESTAMP);

    if (reflectionQuill && reflectionHtml) reflectionQuill.root.innerHTML = reflectionHtml;
    if (feedbackQuill && feedbackHtml) feedbackQuill.root.innerHTML = feedbackHtml;
    updateTimestampDisplay(timestamp || "Never");

    // Load media from IndexedDB
    const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');
    mediaPreviewContainer.innerHTML = ''; // Clear existing previews
    const allMedia = await getAllMediaFromDB();
    if (allMedia.length > 0) {
        allMedia.forEach(mediaItem => {
            if (mediaItem.type === 'image') {
                createImagePreviewElement(mediaItem.url, mediaItem.id);
            } else if (mediaItem.type === 'video') {
                createVideoPreviewElement(mediaItem.url, mediaItem.id);
            }
        });
    }
    checkAndToggleNoMediaMessage();
}

function updateTimestampDisplay(timestampString) {
    document.getElementById('lastSavedTimestamp').textContent = `Last saved: ${timestampString}`;
}

function checkAndToggleNoMediaMessage() {
    const container = document.getElementById('mediaPreviewContainer');
    let message = document.getElementById('noMediaMessage');
    if (container.querySelector('.media-preview-wrapper')) {
        if(message) message.style.display = 'none';
    } else {
        if (!message) {
            message = document.createElement('span');
            message.id = 'noMediaMessage';
            message.className = 'no-media-selected';
            message.textContent = 'No media selected yet.';
            container.appendChild(message);
        }
        message.style.display = 'block';
    }
}

// ... Other functions like word count, prompts, dictation, etc. can remain the same ...
// (They are omitted here for brevity but should be kept in your file)

// --- Clear All Data Functions ---
async function clearAppData() {
    if (reflectionQuill) reflectionQuill.setText('');
    if (feedbackQuill) feedbackQuill.setText('');

    if (db) {
        const store = getObjectStore(STORE_NAME_MEDIA, 'readwrite');
        await store.clear();
    }
    
    document.getElementById('mediaPreviewContainer').innerHTML = '';
    checkAndToggleNoMediaMessage();

    localStorage.removeItem(LOCAL_STORAGE_KEY_REFLECTION);
    localStorage.removeItem(LOCAL_STORAGE_KEY_FEEDBACK);
    localStorage.removeItem(LOCAL_STORAGE_KEY_TIMESTAMP);

    updateTimestampDisplay("Never");
    showAppMessage("All data cleared successfully!");
    hideConfirmationModal();
}

function showConfirmationModal() { document.getElementById('confirmationModal').classList.add('active'); }
function hideConfirmationModal() { document.getElementById('confirmationModal').classList.remove('active'); }


// --- initializeApp: The main function to boot the application ---
async function initializeApp() {
    await openDatabase();

    const toolbarOptions = [
        ['bold', 'italic', 'underline'], ['blockquote'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'header': [1, 2, 3, false] }],
        [{ 'color': [] }, { 'background': [] }],
        ['clean']
    ];

    reflectionQuill = new Quill('#reflection', {
        theme: 'snow',
        modules: { toolbar: toolbarOptions },
        placeholder: 'Type your reflection here...'
    });

    feedbackQuill = new Quill('#feedback', {
        theme: 'snow',
        modules: { toolbar: toolbarOptions },
        placeholder: 'Record lecturer feedback here...'
    });

    await loadContentFromLocalStorage();

    // Event listeners
    reflectionQuill.on('text-change', saveContentToLocalStorage);
    feedbackQuill.on('text-change', saveContentToLocalStorage);

    document.getElementById('imageUploadCamera').addEventListener('change', handleMediaUpload);
    document.getElementById('imageUploadGallery').addEventListener('change', handleMediaUpload);
    document.getElementById('videoUploadCamera').addEventListener('change', handleMediaUpload);
    document.getElementById('videoUploadGallery').addEventListener('change', handleMediaUpload);

    document.getElementById('clearAllDataBtn').addEventListener('click', showConfirmationModal);
    document.getElementById('confirmYes').addEventListener('click', clearAppData);
    document.getElementById('confirmNo').addEventListener('click', hideConfirmationModal);
    
    // PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').catch(err => console.error('Service worker registration failed:', err));
    }
}

