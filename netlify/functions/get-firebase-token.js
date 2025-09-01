// This function securely exchanges a Netlify user's token for a Firebase custom token.
// It includes debugging logs to help diagnose environment variable issues.

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
// This block will only run once when the function is first loaded.
if (!admin.apps.length) {
  try {
    // --- IMPORTANT: Environment Variables ---
    // You MUST set these in your Netlify site's "Build & deploy" > "Environment" settings:
    // FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
    // -----------------------------------------
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // The private key needs to be formatted with '\\n' for newlines.
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    // This will catch errors during initialization, like a malformed private key.
    console.error("CRITICAL: Firebase Admin SDK initialization failed.", error);
    // We throw the error to ensure the function doesn't proceed with a broken state.
    throw error;
  }
}

exports.handler = async (event, context) => {
  // --- ADDED FOR DEBUGGING ---
  console.log("--- DEBUGGING LOGS: Checking environment variables ---");
  console.log("FIREBASE_PROJECT_ID is set:", !!process.env.FIREBASE_PROJECT_ID);
  console.log("FIREBASE_CLIENT_EMAIL is set:", !!process.env.FIREBASE_CLIENT_EMAIL);
  
  if (process.env.FIREBASE_PRIVATE_KEY) {
    console.log("FIREBASE_PRIVATE_KEY is set.");
    console.log("Type of private key:", typeof process.env.FIREBASE_PRIVATE_KEY);
    console.log("Length of private key:", process.env.FIREBASE_PRIVATE_KEY.length);
    // Check if the key looks like it's formatted correctly as a single line.
    console.log("Starts with '-----BEGIN PRIVATE KEY-----':", process.env.FIREBASE_PRIVATE_KEY.startsWith('-----BEGIN PRIVATE KEY-----'));
    console.log("Ends with '-----END PRIVATE KEY-----\\n':", process.env.FIREBASE_PRIVATE_KEY.endsWith('-----END PRIVATE KEY-----\\n'));
    console.log("Contains '\\n' characters:", process.env.FIREBASE_PRIVATE_KEY.includes('\\n'));
  } else {
    // This is a critical failure if the key isn't set at all.
    console.error("CRITICAL FAILURE: The FIREBASE_PRIVATE_KEY environment variable is NOT SET.");
  }
  console.log("--- END DEBUGGING LOGS ---");
  // --- END DEBUGGING SECTION ---

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
    return {
      statusCode: 200,
      body: JSON.stringify({ token: firebaseToken }),
    };
  } catch (error) {
    console.error('Error creating Firebase custom token:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create Firebase token.' }),
    };
  }
};

