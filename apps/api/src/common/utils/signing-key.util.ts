import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// ─── Cifrado de claves privadas de firma (2026-08-24) ───────────────────────
// AES-256-GCM con ENCRYPTION_KEY (env) como llave maestra — primer uso real de
// esa variable en el repo (existía provisionada pero sin consumir). scrypt
// deriva una clave de 32 bytes a partir del passphrase; la sal es fija a
// propósito (el secreto real es ENCRYPTION_KEY, no la sal — la aleatoriedad
// por-registro viene del IV, que sí es random en cada llamada a encrypt()).
const ALGORITHM = 'aes-256-gcm';
const KDF_SALT = 'auditmind-signing-key-v1';
const IV_LENGTH = 12; // recomendado para GCM

function deriveKey(masterKey: string): Buffer {
  return scryptSync(masterKey, KDF_SALT, 32);
}

/** Cifra un texto plano (ej. una clave privada PEM) para guardar en la BD. */
export function encryptSecret(plaintext: string, masterKey: string): string {
  const key = deriveKey(masterKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
}

/** Descifra un valor producido por encryptSecret(). Lanza si el authTag no valida (dato alterado o llave incorrecta). */
export function decryptSecret(payload: string, masterKey: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Formato de secreto cifrado inválido');
  }
  const key = deriveKey(masterKey);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}
