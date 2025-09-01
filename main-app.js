// Import the configuration from your new config file
import { firebaseConfig } from './firebase-config.js';

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithCustomToken, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- MAIN APPLICATION LOGIC ---

// Global variables
let reflectionQuill, feedbackQuill;
let db, auth;
let currentUserId = null;
let currentReflectionId = null;
const reflectionsCache = new Map();

function initializeMainApp(userId) {
    currentUserId = userId;
    console.log("Main app initialized for user:", userId);

    const toolbarOptions = [
        ['bold', 'italic', 'underline'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['clean']
    ];

    reflectionQuill = new Quill('#reflection', { theme: 'snow', modules: { toolbar: toolbarOptions } });
    feedbackQuill = new Quill('#feedback', { theme: 'snow', modules: { toolbar: toolbarOptions } });

    document.getElementById('newReflectionBtn').addEventListener('click', showEditorForNewReflection);
    document.getElementById('saveReflectionBtn').addEventListener('click', saveCurrentReflection);
    document.getElementById('deleteReflectionBtn').addEventListener('click', () => showConfirmationModal(currentReflectionId));
    document.getElementById('mediaUpload').addEventListener('change', handleMediaUpload);
    document.querySelector('.print-btn').addEventListener('click', printPage);

    listenForReflections();
}

const reflectionsListContainer = document.getElementById('reflectionsListContainer');
const reflectionEditorContainer = document.getElementById('reflectionEditorContainer');

function showListView() {
    reflectionsListContainer.classList.remove('hidden');
    reflectionEditorContainer.classList.add('hidden');
    currentReflectionId = null;
}

function showEditorView() {
    reflectionsListContainer.classList.add('hidden');
    reflectionEditorContainer.classList.remove('hidden');
}

function showEditorForNewReflection() {
    currentReflectionId = null;
    document.getElementById('reflectionTitle').value = '';
    reflectionQuill.setText('');
    feedbackQuill.setText('');
    document.getElementById('mediaPreviewContainer').innerHTML = '';
    document.getElementById('lastSavedTimestamp').textContent = 'Last saved: Never';
    showEditorView();
}

function listenForReflections() {
    if (!currentUserId) return;
    const reflectionsCol = collection(db, 'users', currentUserId, 'reflections');
    const q = query(reflectionsCol, orderBy('updatedAt', 'desc'));

    onSnapshot(q, (snapshot) => {
        const reflectionsList = document.getElementById('reflectionsList');
        reflectionsList.innerHTML = '';
        snapshot.docs.forEach(doc => {
            const reflection = { id: doc.id, ...doc.data() };
            reflectionsCache.set(reflection.id, reflection);
            const li = document.createElement('li');
            li.textContent = reflection.title || 'Untitled Reflection';
            li.dataset.id = reflection.id;
            li.addEventListener('click', () => loadReflectionIntoEditor(reflection.id));
            reflectionsList.appendChild(li);
        });
    });
}

function loadReflectionIntoEditor(reflectionId) {
    const reflection = reflectionsCache.get(reflectionId);
    if (!reflection) return;

    currentReflectionId = reflectionId;
    document.getElementById('reflectionTitle').value = reflection.title || '';
    reflectionQuill.root.innerHTML = reflection.reflectionContent || '';
    feedbackQuill.root.innerHTML = reflection.feedbackContent || '';

    const timestamp = reflection.updatedAt?.toDate().toLocaleString() || 'Never';
    document.getElementById('lastSavedTimestamp').textContent = `Last saved: ${timestamp}`;

    const mediaContainer = document.getElementById('mediaPreviewContainer');
    mediaContainer.innerHTML = '';
    if (reflection.mediaUrls && reflection.mediaUrls.length > 0) {
        reflection.mediaUrls.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            mediaContainer.appendChild(img);
        });
    }
    showEditorView();
}

async function saveCurrentReflection() {
    if (!currentUserId) return;

    const reflectionData = {
        title: document.getElementById('reflectionTitle').value || 'Untitled Reflection',
        reflectionContent: reflectionQuill.root.innerHTML,
        feedbackContent: feedbackQuill.root.innerHTML,
        mediaUrls: Array.from(document.querySelectorAll('#mediaPreviewContainer img')).map(img => img.src),
        updatedAt: serverTimestamp()
    };

    try {
        if (currentReflectionId) {
            const docRef = doc(db, 'users', currentUserId, 'reflections', currentReflectionId);
            await updateDoc(docRef, reflectionData);
            showAppMessage('Reflection updated!');
        } else {
            const collectionRef = collection(db, 'users', currentUserId, 'reflections');
            await addDoc(collectionRef, reflectionData);
            showAppMessage('Reflection saved!');
        }
        showListView();
    } catch (error) {
        console.error("Error saving reflection: ", error);
        showAppMessage('Error: Could not save reflection.');
    }
}

async function deleteReflection(reflectionId) {
    if (!currentUserId || !reflectionId) return;
    try {
        const docRef = doc(db, 'users', currentUserId, 'reflections', reflectionId);
        await deleteDoc(docRef);
        showAppMessage('Reflection deleted.');
        showListView();
    } catch (error) {
        console.error("Error deleting reflection: ", error);
        showAppMessage('Error: Could not delete reflection.');
    }
}

async function handleMediaUpload(event) {
    const files = event.target.files;
    const cloudName = 'dslh2taed';
    const uploadPreset = 'Dental';
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;
    const mediaContainer = document.getElementById('mediaPreviewContainer');

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', uploadPreset);
        try {
            const response = await fetch(url, { method: 'POST', body: formData });
            const data = await response.json();
            const img = document.createElement('img');
            img.src = data.secure_url;
            mediaContainer.appendChild(img);
        } catch (error) {
            console.error('Error uploading media:', error);
            showAppMessage('Error uploading media.');
        }
    }
}

const confirmationModal = document.getElementById('confirmationModal');
const confirmYesBtn = document.getElementById('confirmYes');
const confirmNoBtn = document.getElementById('confirmNo');

function showConfirmationModal(reflectionId) {
    if (!reflectionId) return;
    confirmationModal.classList.add('active');
    confirmYesBtn.onclick = () => {
        deleteReflection(reflectionId);
        confirmationModal.classList.remove('active');
    };
    confirmNoBtn.onclick = () => confirmationModal.classList.remove('active');
}

function showAppMessage(messageText) {
    const messageElement = document.getElementById('message');
    messageElement.textContent = messageText;
    messageElement.classList.add('show-message');
    setTimeout(() => messageElement.classList.remove('show-message'), 3000);
}

function printPage() {
    window.print();
}

// --- FIREBASE AUTH & NETLIFY IDENTITY BRIDGE ---

let appInitialized = false;

try {
    document.addEventListener('DOMContentLoaded', () => {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const savedTheme = localStorage.getItem('myTechnicalReflection_theme') || 'light';
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
                themeToggle.checked = true;
            }
            themeToggle.addEventListener('change', () => {
                document.body.classList.toggle('dark-mode');
                const isDarkMode = document.body.classList.contains('dark-mode');
                localStorage.setItem('myTechnicalReflection_theme', isDarkMode ? 'dark' : 'light');
            });
        }
    });
    
    console.log("Attempting to initialize Firebase...");
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase initialized successfully!");

    async function authenticateWithFirebase() {
        const netlifyUser = netlifyIdentity.currentUser();
        if (!netlifyUser) return;
        try {
            const response = await fetch('/.netlify/functions/get-firebase-token', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${netlifyUser.token.access_token}` }
            });
            if (!response.ok) throw new Error(`Function returned status: ${response.status}`);
            const data = await response.json();
            await signInWithCustomToken(auth, data.token);
        } catch (error) {
            console.error("Firebase auth bridge failed:", error);
        }
    }

    onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
            document.getElementById('app-content').style.display = 'block';
            if (!appInitialized) {
                initializeMainApp(firebaseUser.uid);
                appInitialized = true;
            }
        }
    });

    netlifyIdentity.on('login', () => { netlifyIdentity.close(); authenticateWithFirebase(); });
    netlifyIdentity.on('logout', async () => {
        if (auth) await signOut(auth);
        window.location.reload();
    });
    netlifyIdentity.on('init', (user) => { if (user) authenticateWithFirebase(); });

} catch (error) {
    console.error("A FATAL ERROR OCCURRED DURING FIREBASE INITIALIZATION.", error);
    document.body.innerHTML = `<div style="padding: 40px; font-family: sans-serif; text-align: center;"><h1>Application Error</h1><p>Could not initialize the database. Please check the browser console for a specific error message.</p></div>`;
}
