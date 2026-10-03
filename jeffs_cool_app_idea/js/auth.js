import { auth } from './firebase-init.js';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  reload,
} from 'firebase/auth';

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signUp(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  return cred.user;
}

export async function signOutUser() {
  await signOut(auth);
}

export async function resendVerificationEmail() {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser);
  }
}

// A user's ID token is a JWT whose claims (including email_verified) are
// fixed at issuance. Verifying the email server-side doesn't retroactively
// patch an already-cached token or the locally-cached User object —
// reload() re-fetches the profile (so user.emailVerified is current) and
// getIdToken(true) forces a fresh token (so Firestore rules checking
// request.auth.token.email_verified see it too). Call this right before
// anything gated on verification status, rather than waiting for the SDK's
// normal ~hourly refresh cycle.
export async function refreshAuthToken() {
  if (auth.currentUser) {
    await reload(auth.currentUser);
    await auth.currentUser.getIdToken(true);
  }
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

export function currentUser() {
  return auth.currentUser;
}
