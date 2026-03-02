import { ref, set, push, get, onChildAdded, onChildChanged, off, query, orderByChild, limitToLast } from 'firebase/database';
import {
  database,
  storage,
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from './firebaseConfig';
import * as FileSystem from 'expo-file-system/legacy';

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
}

/** Upload audio file and create message record */
export async function sendVoiceMessage(
  pairId: string,
  senderDeviceId: string,
  audioUri: string,
  audioDurationSeconds: number,
  analysisSummary: AnalysisSummary
): Promise<string> {
  // Generate message ID
  const messagesRef = ref(database, `messages/${pairId}`);
  const newMsgRef = push(messagesRef);
  const messageId = newMsgRef.key!;

  // Read the audio file and upload to Firebase Storage
  const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
    encoding: 'base64',
  });
  const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));

  const audioStorageRef = storageRef(storage, `pairs/${pairId}/${messageId}.m4a`);
  await uploadBytes(audioStorageRef, audioBytes, { contentType: 'audio/m4a' });

  const downloadUrl = await getDownloadURL(audioStorageRef);

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
  });

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
  });

  const addedHandler = onChildAdded(messagesRef, (snapshot) => {
    if (snapshot.key && snapshot.val()) {
      onNew(parseMessage(snapshot.key, snapshot.val()));
    }
  });

  const changedHandler = onChildChanged(messagesRef, (snapshot) => {
    if (snapshot.key && snapshot.val()) {
      onUpdated(parseMessage(snapshot.key, snapshot.val()));
    }
  });

  return () => {
    off(messagesRef, 'child_added', addedHandler);
    off(messagesRef, 'child_changed', changedHandler);
  };
}

/** Download a voice message audio to local cache */
export async function downloadVoiceMessage(audioUrl: string, messageId: string): Promise<string> {
  const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
  const localPath = `${cacheDir}message_${messageId}.m4a`;

  // Check if already cached
  const fileInfo = await FileSystem.getInfoAsync(localPath);
  if (fileInfo.exists) {
    return localPath;
  }

  const downloadResult = await FileSystem.downloadAsync(audioUrl, localPath);
  return downloadResult.uri;
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
    // Delete audio from Firebase Storage
    try {
      const audioRef = storageRef(storage, `pairs/${pairId}/${messageId}.m4a`);
      await deleteObject(audioRef);
    } catch {
      // File may already be deleted
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
    });
  });

  return messages.sort((a, b) => a.timestamp - b.timestamp);
}
