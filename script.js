// Firebase functions are imported in the HTML, this script uses the passed 'db' instance.
import { collection, addDoc, query, where, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Global variables
let reflectionQuill;
let feedbackQuill;
let db; // Firestore instance, will be passed in
let currentUserId;
let currentReflectionId = null;

// --- UI Element References ---
const editorView = document.getElementById('editor-view');
const listView = document.getElementById('reflections-list-view');
const reflectionsListContainer = document.getElementById('reflections-list-container');
const reflectionTitleInput = document.getElementById('reflectionTitle');
const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');
const lastSavedTimestamp = document.getElementById('lastSavedTimestamp');
const deleteModal = document.getElementById('deleteConfirmationModal');
const messageElement = document.getElementById('message');

// --- Firestore Database Functions ---

async function saveReflection() {
    if (!currentUserId) return showAppMessage("Error: Not logged in.");
    const title = reflectionTitleInput.value.trim();
    if (!title) return showAppMessage("Please enter a title for your reflection.");

    const reflectionData = {
        title: title,
        reflectionContent: reflectionQuill.root.innerHTML,
        feedbackContent: feedbackQuill.root.innerHTML,
        media: getMediaUrlsFromPreview(),
        userId: currentUserId,
        lastUpdated: serverTimestamp()
    };

    const saveButton = document.getElementById('saveReflectionBtn');
    saveButton.textContent = 'Saving...';
    saveButton.disabled = true;

    try {
        if (currentReflectionId) {
            const docRef = doc(db, "reflections", currentReflectionId);
            await updateDoc(docRef, reflectionData);
            showAppMessage("Reflection updated successfully!");
        } else {
            const docRef = await addDoc(collection(db, "reflections"), reflectionData);
            currentReflectionId = docRef.id;
            showAppMessage("Reflection saved successfully!");
        }
        document.getElementById('deleteReflectionBtn').style.display = 'inline-block';
        await loadUserReflections();
    } catch (error) {
        console.error("Error saving reflection: ", error);
        showAppMessage("Error: Could not save reflection.");
    } finally {
        saveButton.textContent = 'Save Reflection';
        saveButton.disabled = false;
    }
}

async function loadUserReflections() {
    if (!currentUserId) return;
    
    reflectionsListContainer.innerHTML = '<p>Loading reflections...</p>';
    const q = query(collection(db, "reflections"), where("userId", "==", currentUserId), orderBy("lastUpdated", "desc"));
    
    try {
        const querySnapshot = await getDocs(q);
        reflectionsListContainer.innerHTML = '';
        if (querySnapshot.empty) {
            reflectionsListContainer.innerHTML = '<p>You have no saved reflections. Click "+ New Reflection" to start.</p>';
        } else {
            querySnapshot.forEach((doc) => createReflectionListItem(doc.id, doc.data()));
        }
    } catch (error) {
        console.error("Error loading reflections:", error);
        reflectionsListContainer.innerHTML = '<p>Could not load reflections. Please refresh the page.</p>';
    }
}

function handleDeleteRequest() {
    if (!currentReflectionId) return;
    deleteModal.classList.add('active');
}

async function executeDelete() {
    try {
        await deleteDoc(doc(db, "reflections", currentReflectionId));
        showAppMessage("Reflection deleted.");
        await loadUserReflections();
        switchToListView();
    } catch (error) {
        console.error("Error deleting reflection:", error);
        showAppMessage("Error: Could not delete reflection.");
    } finally {
        deleteModal.classList.remove('active');
    }
}

// --- UI and View Management ---

function switchToEditorView(reflectionId = null, data = {}) {
    currentReflectionId = reflectionId;
    
    reflectionTitleInput.value = data.title || '';
    reflectionQuill.root.innerHTML = data.reflectionContent || '<p></p>';
    feedbackQuill.root.innerHTML = data.feedbackContent || '<p></p>';
    lastSavedTimestamp.textContent = data.lastUpdated ? `Last saved: ${data.lastUpdated.toDate().toLocaleString()}` : 'Not saved yet';
    
    mediaPreviewContainer.innerHTML = '';
    if (data.media && data.media.length > 0) {
        data.media.forEach(mediaItem => {
             if (mediaItem.type === 'image') createImagePreviewElement(mediaItem.url, mediaItem.url);
             if (mediaItem.type === 'video') createVideoPreviewElement(mediaItem.url, mediaItem.url);
        });
    }
    checkAndToggleNoMediaMessage();

    document.getElementById('deleteReflectionBtn').style.display = reflectionId ? 'inline-block' : 'none';

    listView.style.display = 'none';
    editorView.style.display = 'block';
}

function switchToListView() {
    editorView.style.display = 'none';
    listView.style.display = 'block';
    currentReflectionId = null;
}

function createReflectionListItem(id, data) {
    const item = document.createElement('div');
    item.className = 'reflection-list-item';
    item.innerHTML = `
        <h3>${data.title}</h3>
        <p>Last updated: ${data.lastUpdated ? data.lastUpdated.toDate().toLocaleDateString() : 'N/A'}</p>
    `;
    item.onclick = () => switchToEditorView(id, data);
    reflectionsListContainer.appendChild(item);
}

// --- Cloudinary and Media Handling ---

function getMediaUrlsFromPreview() {
    const media = [];
    mediaPreviewContainer.querySelectorAll('.media-preview-wrapper').forEach(wrapper => {
        const mediaElement = wrapper.querySelector('.uploaded-media-preview');
        if (mediaElement && mediaElement.src) {
            const isImage = mediaElement.tagName === 'IMG';
            media.push({ type: isImage ? 'image' : 'video', url: mediaElement.src });
        }
    });
    return media;
}

async function handleMediaUpload(event) {
    const files = event.target.files;
    if (files.length === 0) return;

    const cloudName = 'dslh2taed';
    const uploadPreset = 'Dental';
    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;

    checkAndToggleNoMediaMessage(true);

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', uploadPreset);

        try {
            const response = await fetch(cloudinaryUrl, { method: 'POST', body: formData });
            if (!response.ok) throw new Error('Upload to Cloudinary failed.');
            
            const data = await response.json();
            const mediaType = data.resource_type;
            
            if (mediaType === 'image') createImagePreviewElement(data.secure_url, data.secure_url);
            if (mediaType === 'video') createVideoPreviewElement(data.secure_url, data.secure_url);

        } catch (error) {
            console.error('Upload error:', error);
            showAppMessage(`Failed to upload ${file.name}.`);
        }
    }
}

function createMediaPreviewWrapper(mediaElement, id) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('media-preview-wrapper');
    wrapper.appendChild(mediaElement);

    const removeButton = document.createElement('button');
    removeButton.textContent = 'x';
    removeButton.classList.add('remove-media-button');
    removeButton.onclick = () => {
        wrapper.remove();
        checkAndToggleNoMediaMessage();
    };
    wrapper.appendChild(removeButton);
    return wrapper;
}

function createImagePreviewElement(imageUrl, id) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.classList.add('uploaded-media-preview');
    img.dataset.mediaId = id;
    mediaPreviewContainer.appendChild(createMediaPreviewWrapper(img, id));
}

function createVideoPreviewElement(videoUrl, id) {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.controls = true;
    video.classList.add('uploaded-media-preview');
    video.dataset.mediaId = id;
    mediaPreviewContainer.appendChild(createMediaPreviewWrapper(video, id));
}

function checkAndToggleNoMediaMessage(forceHide = false) {
    const message = document.getElementById('noMediaMessage');
    if (!message) return;
    if (forceHide || mediaPreviewContainer.querySelector('.media-preview-wrapper')) {
        message.style.display = 'none';
    } else {
        message.style.display = 'block';
    }
}

// --- Utility Functions ---
function showAppMessage(text) {
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.classList.add('show-message');
    setTimeout(() => {
        messageElement.classList.remove('show-message');
    }, 3000);
}

function printPage() {
    window.print();
}

// --- Main App Initialization ---
window.initializeApp = async (database, userId) => {
    if (!database || !userId) {
        console.error("Initialization failed: Missing DB or User ID.");
        return;
    }
    db = database;
    currentUserId = userId;
    
    const toolbarOptions = [['bold', 'italic', 'underline'], ['blockquote'],[{'list': 'ordered'}, {'list': 'bullet'}],[{'header': [1, 2, 3, false]}],['clean']];
    reflectionQuill = new Quill('#reflection', { theme: 'snow', modules: { toolbar: toolbarOptions }});
    feedbackQuill = new Quill('#feedback', { theme: 'snow', modules: { toolbar: toolbarOptions }});

    // Event listeners
    document.getElementById('newReflectionBtn').addEventListener('click', () => switchToEditorView());
    document.getElementById('backToListBtn').addEventListener('click', switchToListView);
    document.getElementById('saveReflectionBtn').addEventListener('click', saveReflection);
    document.getElementById('deleteReflectionBtn').addEventListener('click', handleDeleteRequest);
    document.getElementById('confirmDeleteBtn').addEventListener('click', executeDelete);
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => deleteModal.classList.remove('active'));
    
    document.getElementById('imageUploadCamera').addEventListener('change', handleMediaUpload);
    document.getElementById('imageUploadGallery').addEventListener('change', handleMediaUpload);
    document.getElementById('videoUploadCamera').addEventListener('change', handleMediaUpload);
    document.getElementById('videoUploadGallery').addEventListener('change', handleMediaUpload);

    // Initial load
    await loadUserReflections();
    switchToListView();
};

