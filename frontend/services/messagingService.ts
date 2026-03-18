import { ref, set, push, get, onChildAdded, onChildChanged, query, orderByChild, limitToLast } from 'firebase/database';
import {
  database,
  storage,
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  ensureAuth,
} from './firebaseConfig';
import * as FileSystem from 'expo-file-system/legacy';
import { getPartnerDeviceId, getPartnerPublicKey, getSenderPublicKey } from './pairingService';
import { getPartnerPushToken, sendPushNotification } from './notificationService';
import { encryptAudio, decryptAudio } from './cryptoService';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

export interface AnalysisSummary {
  severity_level: string;
  primary_emotion: string;
  insights: string[];
}

export interface Message {
  id: string;
  sender: string;
  timestamp: number;
  audioUrl: string;
  audioDurationSeconds: number;
  analysisSummary: AnalysisSummary;
  status: 'sent' | 'listened';
  listenedBySender: boolean;
  listenedByReceiver: boolean;
  isTts: boolean;
  deleted: boolean;
  encrypted: boolean;
}

/** Upload audio file and create message record */
export async function sendVoiceMessage(
  pairId: string,
  senderDeviceId: string,
  audioUri: string,
  audioDurationSeconds: number,
  analysisSummary: AnalysisSummary
): Promise<string> {
  // Ensure Firebase auth before uploading (Storage rules require auth)
  await ensureAuth();

  // Generate message ID
  const messagesRef = ref(database, `messages/${pairId}`);
  const newMsgRef = push(messagesRef);
  const messageId = newMsgRef.key!;

  // Check if E2E encryption is available (partner has a public key)
  const partnerPublicKey = await getPartnerPublicKey(senderDeviceId);
  const isEncrypted = !!partnerPublicKey;

  let downloadUrl: string;
  let storageExtension: string;

  if (isEncrypted) {
    // Read audio as bytes, encrypt, then upload
    const base64Audio = await FileSystem.readAsStringAsync(audioUri, { encoding: 'base64' });
    const plainBytes = decodeBase64(base64Audio);
    const encryptedBytes = await encryptAudio(plainBytes, partnerPublicKey);
    const encryptedBase64 = encodeBase64(encryptedBytes);

    // Convert base64 to blob for upload
    const encBlob = await fetch(`data:application/octet-stream;base64,${encryptedBase64}`).then(r => r.blob());
    storageExtension = '.enc';
    const audioStorageRef = storageRef(storage, `pairs/${pairId}/${messageId}${storageExtension}`);
    await uploadBytes(audioStorageRef, encBlob, { contentType: 'application/octet-stream' });
    downloadUrl = await getDownloadURL(audioStorageRef);
  } else {
    // Fallback: unencrypted upload for pre-encryption pairs
    const response = await fetch(audioUri);
    const blob = await response.blob();
    storageExtension = '.m4a';
    const audioStorageRef = storageRef(storage, `pairs/${pairId}/${messageId}${storageExtension}`);
    await uploadBytes(audioStorageRef, blob, { contentType: 'audio/mp4' });
    downloadUrl = await getDownloadURL(audioStorageRef);
  }

  // Write message metadata
  await set(newMsgRef, {
    sender: senderDeviceId,
    timestamp: Date.now(),
    audio_url: downloadUrl,
    audio_duration_seconds: audioDurationSeconds,
    analysis_summary: {
      severity_level: analysisSummary.severity_level,
      primary_emotion: analysisSummary.primary_emotion,
      insights: analysisSummary.insights,
    },
    status: 'sent',
    listened_by_sender: true,
    listened_by_receiver: false,
    is_tts: false,
    deleted: false,
    encrypted: isEncrypted,
  });

  // Send push notification to partner
  try {
    const partnerDeviceId = await getPartnerDeviceId(senderDeviceId);
    if (partnerDeviceId) {
      const partnerToken = await getPartnerPushToken(partnerDeviceId);
      if (partnerToken) {
        await sendPushNotification(
          partnerToken,
          'Anchor',
          'New voice message from your partner',
          { pairId, messageId }
        );
      }
    }
  } catch (err) {
    // Non-fatal — message was still sent successfully
    console.log('[Messaging] Push notification error:', err);
  }

  return messageId;
}

/** Subscribe to messages for a pair (real-time) */
export function subscribeToMessages(
  pairId: string,
  onNew: (message: Message) => void,
  onUpdated: (message: Message) => void
): () => void {
  const messagesRef = ref(database, `messages/${pairId}`);

  const parseMessage = (id: string, data: any): Message => ({
    id,
    sender: data.sender,
    timestamp: data.timestamp,
    audioUrl: data.audio_url,
    audioDurationSeconds: data.audio_duration_seconds,
    analysisSummary: {
      severity_level: data.analysis_summary?.severity_level || 'low',
      primary_emotion: data.analysis_summary?.primary_emotion || 'calm',
      insights: data.analysis_summary?.insights || [],
    },
    status: data.status,
    listenedBySender: data.listened_by_sender,
    listenedByReceiver: data.listened_by_receiver,
    isTts: data.is_tts || false,
    deleted: data.deleted || false,
    encrypted: data.encrypted || false,
  });

  const unsubAdded = onChildAdded(messagesRef, (snapshot) => {
    if (snapshot.key && snapshot.val()) {
      onNew(parseMessage(snapshot.key, snapshot.val()));
    }
  });

  const unsubChanged = onChildChanged(messagesRef, (snapshot) => {
    if (snapshot.key && snapshot.val()) {
      onUpdated(parseMessage(snapshot.key, snapshot.val()));
    }
  });

  return () => {
    unsubAdded();
    unsubChanged();
  };
}

/** Download a voice message audio to app-private cache, decrypting if E2E encrypted */
export async function downloadVoiceMessage(
  audioUrl: string,
  messageId: string,
  senderDeviceId?: string,
  pairId?: string,
  encrypted?: boolean
): Promise<string> {
  const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
  const localPath = `${cacheDir}message_${messageId}.m4a`;

  // Check if already cached (decrypted)
  const fileInfo = await FileSystem.getInfoAsync(localPath);
  if (fileInfo.exists) {
    return localPath;
  }

  if (encrypted && senderDeviceId && pairId) {
    // Download encrypted file to temp path
    const encPath = `${cacheDir}message_${messageId}.enc`;
    const downloadResult = await FileSystem.downloadAsync(audioUrl, encPath);
    if (downloadResult.status !== 200) {
      throw new Error(`Failed to download message (${downloadResult.status})`);
    }

    // Read encrypted bytes
    const encBase64 = await FileSystem.readAsStringAsync(encPath, { encoding: 'base64' });
    const encBytes = decodeBase64(encBase64);

    // Get sender's public key from the pair record
    const senderPublicKey = await getSenderPublicKey(senderDeviceId, pairId);
    if (!senderPublicKey) {
      throw new Error('Cannot decrypt: sender public key not found');
    }

    // Decrypt
    const decryptedBytes = await decryptAudio(encBytes, senderPublicKey);
    const decryptedBase64 = encodeBase64(decryptedBytes);

    // Write decrypted audio
    await FileSystem.writeAsStringAsync(localPath, decryptedBase64, { encoding: 'base64' });

    // Clean up encrypted temp file
    await FileSystem.deleteAsync(encPath, { idempotent: true });

    return localPath;
  }

  // Unencrypted fallback
  const downloadResult = await FileSystem.downloadAsync(audioUrl, localPath);
  if (downloadResult.status !== 200) {
    throw new Error(`Failed to download message (${downloadResult.status})`);
  }

  return localPath;
}

/** Delete a cached voice message file */
export async function deleteCachedMessage(messageId: string): Promise<void> {
  const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
  const localPath = `${cacheDir}message_${messageId}.m4a`;
  try {
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    }
  } catch {
    // Non-fatal
  }
}

/** Mark a message as listened by the receiver, then check for auto-delete */
export async function markAsListened(
  pairId: string,
  messageId: string,
  deviceId: string
): Promise<void> {
  const msgRef = ref(database, `messages/${pairId}/${messageId}`);
  const snapshot = await get(msgRef);
  if (!snapshot.exists()) return;

  const data = snapshot.val();
  const isSender = data.sender === deviceId;

  if (isSender) {
    await set(ref(database, `messages/${pairId}/${messageId}/listened_by_sender`), true);
  } else {
    await set(ref(database, `messages/${pairId}/${messageId}/listened_by_receiver`), true);
    await set(ref(database, `messages/${pairId}/${messageId}/status`), 'listened');
  }

  // Check auto-delete
  await checkAndAutoDelete(pairId, messageId);
}

/** Auto-delete audio if both parties have listened */
async function checkAndAutoDelete(pairId: string, messageId: string): Promise<void> {
  const msgRef = ref(database, `messages/${pairId}/${messageId}`);
  const snapshot = await get(msgRef);
  if (!snapshot.exists()) return;

  const data = snapshot.val();

  if (data.listened_by_sender && data.listened_by_receiver && !data.deleted) {
    // Delete audio from Firebase Storage (try both encrypted and unencrypted paths)
    const ext = data.encrypted ? '.enc' : '.m4a';
    try {
      const audioRef = storageRef(storage, `pairs/${pairId}/${messageId}${ext}`);
      await deleteObject(audioRef);
    } catch {
      // File may already be deleted — also try the other extension as fallback
      try {
        const fallbackExt = ext === '.enc' ? '.m4a' : '.enc';
        const fallbackRef = storageRef(storage, `pairs/${pairId}/${messageId}${fallbackExt}`);
        await deleteObject(fallbackRef);
      } catch {
        // File already deleted
      }
    }

    // Mark as deleted in database
    await set(ref(database, `messages/${pairId}/${messageId}/deleted`), true);
  }
}

/** Get recent messages for a pair */
export async function getRecentMessages(pairId: string, limit: number = 50): Promise<Message[]> {
  const messagesRef = query(
    ref(database, `messages/${pairId}`),
    orderByChild('timestamp'),
    limitToLast(limit)
  );

  const snapshot = await get(messagesRef);
  if (!snapshot.exists()) return [];

  const messages: Message[] = [];
  snapshot.forEach((child) => {
    const data = child.val();
    messages.push({
      id: child.key!,
      sender: data.sender,
      timestamp: data.timestamp,
      audioUrl: data.audio_url,
      audioDurationSeconds: data.audio_duration_seconds,
      analysisSummary: {
        severity_level: data.analysis_summary?.severity_level || 'low',
        primary_emotion: data.analysis_summary?.primary_emotion || 'calm',
        insights: data.analysis_summary?.insights || [],
      },
      status: data.status,
      listenedBySender: data.listened_by_sender,
      listenedByReceiver: data.listened_by_receiver,
      isTts: data.is_tts || false,
      deleted: data.deleted || false,
      encrypted: data.encrypted || false,
    });
  });

  return messages.sort((a, b) => a.timestamp - b.timestamp);
}
