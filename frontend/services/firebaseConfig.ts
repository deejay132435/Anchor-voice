import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import {
  getStorage,
  ref as storageRef,
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
  if (auth.currentUser) {
    return auth.currentUser.uid;
  }
  try {
    const credential = await signInAnonymously(auth);
    return credential.user.uid;
  } catch (err) {
    console.log('[Firebase] Auth error, retrying once...', err);
    // One retry — network hiccups on cold start are common
    try {
      const credential = await signInAnonymously(auth);
      return credential.user.uid;
    } catch (retryErr) {
      throw new Error('Firebase authentication failed. Check your connection and try again.');
    }
  }
}

/**
 * Upload a base64 string to Firebase Storage via REST API.
 * The Firebase JS SDK's uploadBytes/uploadString both create Blobs internally,
 * which crashes on React Native ("Creating blobs from ArrayBuffer not supported").
 * This bypasses the SDK entirely and uses a direct REST upload.
 */
export async function uploadBase64ToStorage(
  path: string,
  base64Data: string,
  contentType: string
): Promise<string> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Not authenticated — cannot upload');
  }

  const bucket = firebaseConfig.storageBucket;
  const encodedPath = encodeURIComponent(path);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?uploadType=media`;

  // Write base64 to a temp file, then upload via expo-file-system (no Blob needed)
  const FileSystem = require('expo-file-system/legacy');
  const tmpPath = `${FileSystem.cacheDirectory}upload_${Date.now()}.tmp`;
  await FileSystem.writeAsStringAsync(tmpPath, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const uploadResult = await FileSystem.uploadAsync(url, tmpPath, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    },
  });

  // Clean up temp file
  await FileSystem.deleteAsync(tmpPath, { idempotent: true });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Upload failed (${uploadResult.status}): ${uploadResult.body}`);
  }

  // Parse response to get the download token
  const responseData = JSON.parse(uploadResult.body);
  const downloadToken = responseData.downloadTokens;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

export { app, auth, database, storage, storageRef, getDownloadURL, deleteObject };
