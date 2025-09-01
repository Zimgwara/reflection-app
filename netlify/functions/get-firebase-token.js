// This function securely exchanges a Netlify user's token for a Firebase custom token.
// It requires you to set up environment variables in your Netlify site settings.

const admin = require('firebase-admin');

// --- IMPORTANT: Environment Variables ---
// You MUST set these in your Netlify site's "Build & deploy" > "Environment" settings:
// FIREBASE_PROJECT_ID: Your Firebase project ID (e.g., "reflectdent-74d8c")
// FIREBASE_CLIENT_EMAIL: The client email from your Firebase service account JSON file.
// FIREBASE_PRIVATE_KEY: The private key from your Firebase service account JSON file.
// -----------------------------------------

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // The private key needs to be formatted correctly in the environment variable.
      // Replace all newline characters (\n) with \\n in the Netlify UI.
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

exports.handler = async (event, context) => {
  // The user's Netlify JWT is sent in the Authorization header.
  const { user } = context.clientContext;
  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }
  
  // The 'sub' claim in the Netlify JWT is the unique user ID.
  const uid = user.sub;

  try {
    // Create a custom Firebase token for the user.
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
