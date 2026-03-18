import * as ExpoCrypto from 'expo-crypto';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import * as SecureStore from 'expo-secure-store';

// Polyfill PRNG for tweetnacl — React Native lacks crypto.getRandomValues
nacl.setPRNG((x: Uint8Array, n: number) => {
  const randomBytes = ExpoCrypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) {
    x[i] = randomBytes[i];
  }
});

const PUBLIC_KEY_STORE = 'anchor_nacl_public_key';
const SECRET_KEY_STORE = 'anchor_nacl_secret_key';

interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** Get or create a NaCl keypair, persisted in secure storage */
export async function getOrCreateKeyPair(): Promise<KeyPair> {
  const storedPublic = await SecureStore.getItemAsync(PUBLIC_KEY_STORE);
  const storedSecret = await SecureStore.getItemAsync(SECRET_KEY_STORE);

  if (storedPublic && storedSecret) {
    return {
      publicKey: decodeBase64(storedPublic),
      secretKey: decodeBase64(storedSecret),
    };
  }

  const keyPair = nacl.box.keyPair();
  await SecureStore.setItemAsync(PUBLIC_KEY_STORE, encodeBase64(keyPair.publicKey));
  await SecureStore.setItemAsync(SECRET_KEY_STORE, encodeBase64(keyPair.secretKey));

  return keyPair;
}

/** Get this device's public key as base64 (for sharing during pairing) */
export async function getPublicKeyBase64(): Promise<string> {
  const keyPair = await getOrCreateKeyPair();
  return encodeBase64(keyPair.publicKey);
}

/** Encrypt audio bytes for a recipient. Returns nonce + ciphertext concatenated. */
export async function encryptAudio(
  plainBytes: Uint8Array,
  recipientPublicKeyBase64: string
): Promise<Uint8Array> {
  const keyPair = await getOrCreateKeyPair();
  const recipientPublicKey = decodeBase64(recipientPublicKeyBase64);
  const nonce = nacl.randomBytes(nacl.box.nonceLength); // 24 bytes

  const encrypted = nacl.box(plainBytes, nonce, recipientPublicKey, keyPair.secretKey);
  if (!encrypted) {
    throw new Error('Encryption failed');
  }

  // Prepend nonce to ciphertext
  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);
  return result;
}

/** Decrypt audio bytes from a sender. Input is nonce + ciphertext concatenated. */
export async function decryptAudio(
  encryptedBytes: Uint8Array,
  senderPublicKeyBase64: string
): Promise<Uint8Array> {
  const keyPair = await getOrCreateKeyPair();
  const senderPublicKey = decodeBase64(senderPublicKeyBase64);

  const nonce = encryptedBytes.slice(0, nacl.box.nonceLength);
  const ciphertext = encryptedBytes.slice(nacl.box.nonceLength);

  const decrypted = nacl.box.open(ciphertext, nonce, senderPublicKey, keyPair.secretKey);
  if (!decrypted) {
    throw new Error('Decryption failed — message may be tampered or wrong key');
  }

  return decrypted;
}

/** Delete keypair from secure storage (e.g., on account reset) */
export async function deleteKeyPair(): Promise<void> {
  await SecureStore.deleteItemAsync(PUBLIC_KEY_STORE);
  await SecureStore.deleteItemAsync(SECRET_KEY_STORE);
}
