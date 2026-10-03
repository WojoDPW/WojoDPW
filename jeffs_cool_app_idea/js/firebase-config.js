// Paste your Firebase project's web app config here. Firebase Console ->
// Project settings -> General -> "Your apps" -> Web app -> SDK setup and
// configuration -> Config.
//
// This is NOT a secret — it's a public client identifier, safe to commit
// and safe to serve from a public GitHub Pages site. Actual access control
// is enforced by firestore.rules / storage.rules, not by hiding this object.
// (Same pattern this repo's draft_board app already uses for its Firebase
// config.)

export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
