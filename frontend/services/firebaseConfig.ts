import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import {
  getAuth,
  signInAnonymously,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDyitECgRB67OVeh1082D0x9pqQX1mjPB4',
  authDomain: 'anchor-voice.firebaseapp.com',
  databaseURL: 'https://anchor-voice-default-rtdb.firebaseio.com',
  projectId: 'anchor-voice',
  storageBucket: 'anchor-voice.firebasestorage.app',
  messagingSenderId: '270141716280',
  appId: '1:270141716280:web:821516789f22b7aaf673cd',
};

// Initialize Firebase (only once)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Use getAuth instead of initializeAuth to avoid crashes on hot reload
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

/** Sign in anonymously — gives us a uid for security rules without requiring accounts */
export async function ensureAuth(): Promise<string> {
  try {
    if (auth.currentUser) {
      return auth.currentUser.uid;
    }
    const credential = await signInAnonymously(auth);
    return credential.user.uid;
  } catch (err) {
    console.log('[Firebase] Auth error (non-fatal):', err);
    return 'anonymous';
  }
}

export { app, auth, database, storage, storageRef, uploadBytes, getDownloadURL, deleteObject };
