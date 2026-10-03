import { auth } from './firebase-init.js';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
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

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

export function currentUser() {
  return auth.currentUser;
}
