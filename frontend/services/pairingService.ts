import { ref, set, get, push, onValue } from 'firebase/database';
import { database } from './firebaseConfig';
import { updateDevicePairId, incrementPairCount, getPairCount } from './deviceService';
import { getPublicKeyBase64 } from './cryptoService';

const MAX_FREE_PAIRINGS = 1;

export interface PairInfo {
  pairId: string;
  deviceA: string;
  deviceB: string;
  createdAt: number;
  publicKeyA?: string;
  publicKeyB?: string;
}

// Characters that aren't ambiguous (no O/0/I/1/l)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/** Create a 6-character pairing code that expires in 1 hour */
export async function createPairingCode(deviceId: string): Promise<string> {
  // Check if device is already paired
  const existingPair = await getPairInfo(deviceId);
  if (existingPair) {
    throw new Error('Already paired. Unpair first to create a new code.');
  }

  // Check if device has exceeded free pairing limit
  const pairCount = await getPairCount(deviceId);
  if (pairCount >= MAX_FREE_PAIRINGS) {
    throw new Error('FREE_LIMIT_REACHED');
  }

  // Generate a unique code
  let code = generateCode();
  let attempts = 0;
  while (attempts < 10) {
    const codeRef = ref(database, `pairing_codes/${code}`);
    const snapshot = await get(codeRef);
    if (!snapshot.exists()) break;
    code = generateCode();
    attempts++;
  }

  const now = Date.now();
  const publicKey = await getPublicKeyBase64();
  const codeRef = ref(database, `pairing_codes/${code}`);
  await set(codeRef, {
    created_by: deviceId,
    created_at: now,
    expires_at: now + 60 * 60 * 1000, // 1 hour
    status: 'pending',
    public_key: publicKey,
  });

  return code;
}

/** Listen for when a pairing code gets redeemed */
export function onCodeRedeemed(
  code: string,
  callback: (pairId: string) => void
): () => void {
  const codeRef = ref(database, `pairing_codes/${code}`);
  const unsubscribe = onValue(codeRef, (snapshot) => {
    const data = snapshot.val();
    if (data?.status === 'used' && data?.pair_id) {
      callback(data.pair_id);
    }
  });
  return unsubscribe;
}

/** Redeem a pairing code — connects two devices */
export async function redeemPairingCode(
  code: string,
  deviceId: string
): Promise<{ success: boolean; pairId?: string; error?: string }> {
  const codeRef = ref(database, `pairing_codes/${code.toUpperCase()}`);
  const snapshot = await get(codeRef);

  if (!snapshot.exists()) {
    return { success: false, error: 'Invalid code. Check and try again.' };
  }

  const data = snapshot.val();

  if (data.status === 'used') {
    return { success: false, error: 'This code has already been used.' };
  }

  if (Date.now() > data.expires_at) {
    return { success: false, error: 'This code has expired. Ask your partner for a new one.' };
  }

  if (data.created_by === deviceId) {
    return { success: false, error: "You can't pair with yourself." };
  }

  // Check if this device is already paired
  const existingPair = await getPairInfo(deviceId);
  if (existingPair) {
    return { success: false, error: 'You are already paired. Unpair first.' };
  }

  // Check if device has exceeded free pairing limit
  const pairCount = await getPairCount(deviceId);
  if (pairCount >= MAX_FREE_PAIRINGS) {
    return { success: false, error: 'FREE_LIMIT_REACHED' };
  }

  // Create the pair (with E2E encryption public keys)
  const pairsRef = ref(database, 'pairs');
  const newPairRef = push(pairsRef);
  const pairId = newPairRef.key!;

  const redeemerPublicKey = await getPublicKeyBase64();
  await set(newPairRef, {
    device_a: data.created_by,
    device_b: deviceId,
    created_at: Date.now(),
    public_key_a: data.public_key || null,
    public_key_b: redeemerPublicKey,
  });

  // Mark code as used
  await set(codeRef, {
    ...data,
    status: 'used',
    pair_id: pairId,
    paired_with: deviceId,
  });

  // Update both devices with the pair ID
  await updateDevicePairId(data.created_by, pairId);
  await updateDevicePairId(deviceId, pairId);

  // Increment pair count for both devices
  await incrementPairCount(data.created_by);
  await incrementPairCount(deviceId);

  return { success: true, pairId };
}

/** Get pair info for a device */
export async function getPairInfo(deviceId: string): Promise<PairInfo | null> {
  // Look up the device's pair_id
  const deviceRef = ref(database, `devices/${deviceId}/pair_id`);
  const deviceSnap = await get(deviceRef);

  if (!deviceSnap.exists() || !deviceSnap.val()) {
    return null;
  }

  const pairId = deviceSnap.val();
  const pairRef = ref(database, `pairs/${pairId}`);
  const pairSnap = await get(pairRef);

  if (!pairSnap.exists()) {
    return null;
  }

  const pair = pairSnap.val();
  return {
    pairId,
    deviceA: pair.device_a,
    deviceB: pair.device_b,
    createdAt: pair.created_at,
    publicKeyA: pair.public_key_a || undefined,
    publicKeyB: pair.public_key_b || undefined,
  };
}

/** Get partner's device ID */
export async function getPartnerDeviceId(deviceId: string): Promise<string | null> {
  const pairInfo = await getPairInfo(deviceId);
  if (!pairInfo) return null;
  return pairInfo.deviceA === deviceId ? pairInfo.deviceB : pairInfo.deviceA;
}

/** Get the partner's E2E public key (base64). Returns null if not available (pre-encryption pair). */
export async function getPartnerPublicKey(deviceId: string): Promise<string | null> {
  const pairInfo = await getPairInfo(deviceId);
  if (!pairInfo) return null;

  if (pairInfo.deviceA === deviceId) {
    return pairInfo.publicKeyB || null;
  } else {
    return pairInfo.publicKeyA || null;
  }
}

/** Get this device's public key from the pair record (to let partner know our key for sender identification) */
export async function getSenderPublicKey(senderDeviceId: string, pairId: string): Promise<string | null> {
  const pairRef = ref(database, `pairs/${pairId}`);
  const pairSnap = await get(pairRef);
  if (!pairSnap.exists()) return null;

  const pair = pairSnap.val();
  if (pair.device_a === senderDeviceId) {
    return pair.public_key_a || null;
  } else {
    return pair.public_key_b || null;
  }
}

/** Unpair — removes the pair and clears both devices */
export async function unpair(deviceId: string): Promise<void> {
  const pairInfo = await getPairInfo(deviceId);
  if (!pairInfo) return;

  // Clear pair_id on both devices
  await updateDevicePairId(pairInfo.deviceA, null);
  await updateDevicePairId(pairInfo.deviceB, null);

  // Remove the pair record
  const pairRef = ref(database, `pairs/${pairInfo.pairId}`);
  await set(pairRef, null);

  // Clean up messages for this pair
  const messagesRef = ref(database, `messages/${pairInfo.pairId}`);
  await set(messagesRef, null);
}
