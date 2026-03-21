import { ref, set, push, get, onChildAdded, onChildChanged, query, orderByChild, limitToLast } from 'firebase/database';
import {
  database,
  storage,
  storageRef,
  getDownloadURL,
  deleteObject,
  ensureAuth,
  uploadBase64ToStorage,
} from './firebaseConfig';
import * as FileSystem from 'expo-file-system/legacy';
import { getPartnerDeviceId, getPartnerPublicKey, getSenderPublicKey } from './pairingService';
import { getPartnerPushToken, sendPushNotification } from './notificationService';
import { encryptAudio, decryptAudio } from './cryptoService';

// Base64 lookup table for chunk-safe decoding (no atob — crashes on large strings in Hermes)
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64_CHARS.length; i++) B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;

function base64ToBytes(base64: string): Uint8Array {
  // Strip padding
  let len = base64.length;
  while (len > 0 && base64[len - 1] === '=') len--;

  const outLen = (len * 3) >>> 2;
  const bytes = new Uint8Array(outLen);
  let p = 0;

  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[base64.charCodeAt(i)];
    const b = i + 1 < len ? B64_LOOKUP[base64.charCodeAt(i + 1)] : 0;
    const c = i + 2 < len ? B64_LOOKUP[base64.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? B64_LOOKUP[base64.charCodeAt(i + 3)] : 0;

    bytes[p++] = (a << 2) | (b >> 4);
    if (p < outLen) bytes[p++] = ((b & 0x0f) << 4) | (c >> 2);
    if (p < outLen) bytes[p++] = ((c & 0x03) << 6) | d;
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  let result = '';
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;

    result += B64_CHARS[a >> 2];
    result += B64_CHARS[((a & 0x03) << 4) | (b >> 4)];
    result += i + 1 < len ? B64_CHARS[((b & 0x0f) << 2) | (c >> 6)] : '=';
    result += i + 2 < len ? B64_CHARS[c & 0x3f] : '=';
  }
  return result;
}

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
  // Wrapped in try-catch so encryption issues never block sending
  let partnerPublicKey: string | null = null;
  try {
    partnerPublicKey = await getPartnerPublicKey(senderDeviceId);
  } catch (err) {
    console.log('[Messaging] Could not get partner public key, sending unencrypted:', err);
  }
  const isEncrypted = !!partnerPublicKey;

  let downloadUrl: string = '';
  let storageExtension: string = '';

  // Read audio file as base64 (works reliably on React Native, unlike fetch/blob)
  const base64Audio = await FileSystem.readAsStringAsync(audioUri, { encoding: 'base64' });
  if (!base64Audio || base64Audio.length === 0) {
    throw new Error('Audio file is empty or could not be read');
  }

  // Detect content type from file extension
  const isMp3 = audioUri.toLowerCase().endsWith('.mp3');
  const audioContentType = isMp3 ? 'audio/mpeg' : 'audio/mp4';

  let actuallyEncrypted = false;

  if (isEncrypted) {
    try {
      // Encrypt audio bytes, then convert back to base64 for REST upload
      const plainBytes = base64ToBytes(base64Audio);
      const encryptedBytes = await encryptAudio(plainBytes, partnerPublicKey!);
      const encryptedBase64 = bytesToBase64(encryptedBytes);

      storageExtension = '.enc';
      const storagePath = `pairs/${pairId}/${messageId}${storageExtension}`;
      downloadUrl = await uploadBase64ToStorage(storagePath, encryptedBase64, 'application/octet-stream');
      actuallyEncrypted = true;
    } catch (encErr) {
      console.log('[Messaging] Encryption/upload failed, falling back to unencrypted:', encErr);
      // Fall through to unencrypted upload
    }
  }

  if (!actuallyEncrypted) {
    // Upload unencrypted via REST API
    // (Firebase JS SDK uploadBytes/uploadString both crash on RN — Blob not supported)
    const ext = isMp3 ? '.mp3' : '.m4a';
    storageExtension = ext;
    const storagePath = `pairs/${pairId}/${messageId}${storageExtension}`;
    downloadUrl = await uploadBase64ToStorage(storagePath, base64Audio, audioContentType);
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
    is_tts: isMp3,
    deleted: false,
    encrypted: actuallyEncrypted,
    storage_extension: storageExtension,
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
    const encBytes = base64ToBytes(encBase64);

    // Get sender's public key from the pair record
    const senderPublicKey = await getSenderPublicKey(senderDeviceId, pairId);
    if (!senderPublicKey) {
      throw new Error('Cannot decrypt: sender public key not found');
    }

    // Decrypt
    const decryptedBytes = await decryptAudio(encBytes, senderPublicKey);
    const decryptedBase64 = bytesToBase64(decryptedBytes);

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
    // Delete audio from Firebase Storage — try stored extension, then fallbacks
    const storedExt = data.storage_extension;
    const ext = storedExt || (data.encrypted ? '.enc' : '.m4a');
    const fallbackExts = ['.enc', '.m4a', '.mp3'].filter(e => e !== ext);
    try {
      const audioRef = storageRef(storage, `pairs/${pairId}/${messageId}${ext}`);
      await deleteObject(audioRef);
    } catch {
      // Try fallback extensions
      for (const fallbackExt of fallbackExts) {
        try {
          const fallbackRef = storageRef(storage, `pairs/${pairId}/${messageId}${fallbackExt}`);
          await deleteObject(fallbackRef);
          break;
        } catch {
          // Continue trying
        }
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
