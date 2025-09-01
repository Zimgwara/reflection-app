// This function securely exchanges a Netlify user's token for a Firebase custom token.
// It includes advanced debugging and attempts to auto-correct private key formatting.

const admin = require('firebase-admin');

function initializeFirebaseAdmin() {
  // This function will only run if the SDK isn't already initialized.
  if (admin.apps.length > 0) {
    return;
  }

  console.log("--- INITIALIZING FIREBASE ADMIN SDK ---");

  // --- Check for presence of all required environment variables ---
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error("CRITICAL FAILURE: One or more required Firebase environment variables are missing.");
    console.error("Is FIREBASE_PROJECT_ID set?", !!projectId);
    console.error("Is FIREBASE_CLIENT_EMAIL set?", !!clientEmail);
    console.error("Is FIREBASE_PRIVATE_KEY set?", !!privateKey);
    throw new Error("Missing Firebase credentials in environment variables.");
  }
  
  console.log("Successfully retrieved all environment variables.");
  console.log("DEBUG: Project ID:", projectId);
  console.log("DEBUG: Client Email:", clientEmail);

  // --- Auto-correction for the private key formatting ---
  // This is the most common point of failure. We will aggressively clean the key.
  console.log("Attempting to format the private key...");
  try {
    privateKey = privateKey.replace(/\\n/g, '\n');
    console.log("Replaced '\\n' with newline characters.");
  } catch (e) {
      console.error("Could not perform replace operation on private key.", e);
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
      }),
    });
    console.log("--- FIREBASE ADMIN SDK INITIALIZED SUCCESSFULLY ---");
  } catch (error) {
    console.error("CRITICAL: Firebase Admin SDK initialization failed AFTER formatting the key.");
    console.error("This means the key itself or other credentials might be incorrect.");
    console.error("Full Error:", error);
    throw error;
  }
}

// Main handler for the Netlify Function
exports.handler = async (event, context) => {
  try {
    // Ensure Firebase is initialized before proceeding.
    initializeFirebaseAdmin();
  } catch (initError) {
    // If initialization fails, return an internal server error.
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error: Could not initialize Firebase connection.' }),
    };
  }

  const { user } = context.clientContext;
  if (!user) {
    console.error("Function called without a user context.");
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized. No user token provided.' }),
    };
  }
  
  const uid = user.sub;

  try {
    const firebaseToken = await admin.auth().createCustomToken(uid);
    console.log(`Successfully created Firebase token for user: ${uid}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ token: firebaseToken }),
    };
  } catch (error) {
    console.error(`Error creating Firebase custom token for user: ${uid}`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create Firebase token.' }),
    };
  }
};

