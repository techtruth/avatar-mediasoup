/**
 * Wrapper for media server database needs
 * @file Database Wrapper - Handles common server-side database needs.
 * @namespace database
 */

const { cert, initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const {
  getFirestore,
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");

// Importing getAuth or getFirestore will ensure initialization of Firebase app.
// Chcking on getApps count will ensure the app is initialized only once.
if (getApps().length == 0) {
  console.debug("Initializing Default Firebase App");
  initializeApp({
    credential: cert({
      projectId: process.env.GOOGLECLOUDSTORAGE_PROJECTID,
      clientEmail: process.env.GOOGLECLOUDSTORAGE_CLIENT_EMAIL,
      privateKey: process.env.GOOGLECLOUDSTORAGE_CREDENTIALS_KEY.replace(
        /\\n/g,
        "\n"
      ),
    }),
    databaseURL: process.env.FIREBASE_DATABASEURL,
  });
}

module.exports = { getAuth, getFirestore, FieldValue, Timestamp };
