import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { ref, set, get } from 'firebase/database';
import { database, ensureAuth } from './firebaseConfig';

const DEVICE_ID_KEY = 'anchor_device_id';

/** Get or create a persistent device ID (stored in secure storage) */
export async function getOrCreateDeviceId(): Promise<string> {
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/** Get the stored device ID (returns null if not yet created) */
export async function getDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

/** Register this device in Firebase (links device ID to anonymous auth uid) */
export async function registerDevice(deviceId: string): Promise<void> {
  const authUid = await ensureAuth();
  const deviceRef = ref(database, `devices/${deviceId}`);
  const snapshot = await get(deviceRef);

  if (!snapshot.exists()) {
    await set(deviceRef, {
      auth_uid: authUid,
      pair_id: null,
      created_at: Date.now(),
    });
  }
}

/** Update the pair_id on the device record */
export async function updateDevicePairId(
  deviceId: string,
  pairId: string | null
): Promise<void> {
  const deviceRef = ref(database, `devices/${deviceId}/pair_id`);
  await set(deviceRef, pairId);
}

/** Increment the pair_count for a device (tracks total pairings) */
export async function incrementPairCount(deviceId: string): Promise<void> {
  const countRef = ref(database, `devices/${deviceId}/pair_count`);
  const snapshot = await get(countRef);
  const current = snapshot.exists() ? snapshot.val() : 0;
  await set(countRef, current + 1);
}

/** Get the pair count for a device */
export async function getPairCount(deviceId: string): Promise<number> {
  const countRef = ref(database, `devices/${deviceId}/pair_count`);
  const snapshot = await get(countRef);
  return snapshot.exists() ? snapshot.val() : 0;
}

/** Get the pair ID for a device */
export async function getDevicePairId(deviceId: string): Promise<string | null> {
  const deviceRef = ref(database, `devices/${deviceId}/pair_id`);
  const snapshot = await get(deviceRef);
  return snapshot.exists() ? snapshot.val() : null;
}
