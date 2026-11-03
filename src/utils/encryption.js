import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const rawKey =
  process.env.ENCRYPTION_KEY ||
  '0ae66180ecd12c71fe5a9e207745752e6f59f9d1243cbf3e0798b6470ebabac6';

// Derive 32-byte key for AES-256-GCM
let keyBuffer;
if (rawKey.length === 64) {
  keyBuffer = Buffer.from(rawKey, 'hex');
} else {
  keyBuffer = crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypt sensitive plain text using AES-256-GCM
 * @param {string} text - Plaintext to encrypt
 * @returns {string} iv:authTag:encryptedHex
 */
export const encrypt = (text) => {
  if (!text) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

/**
 * Decrypt cipher text using AES-256-GCM
 * @param {string} cipherText - iv:authTag:encryptedHex
 * @returns {string} Plaintext
 */
export const decrypt = (cipherText) => {
  if (!cipherText || typeof cipherText !== 'string' || !cipherText.includes(':')) {
    return cipherText;
  }
  try {
    const [ivHex, authTagHex, encryptedHex] = cipherText.split(':');
    if (!ivHex || !authTagHex || !encryptedHex) return cipherText;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Encryption] Decryption error:', err.message);
    return null;
  }
};

/**
 * Mask sensitive numbers (consumer/account number) keeping only last 4 digits
 * Example: '100029384756' -> '•••• •••• 4756'
 */
export const maskNumber = (value, visibleDigits = 4) => {
  if (!value) return '';
  const str = String(value).trim();
  if (str.length <= visibleDigits) {
    return '•'.repeat(str.length);
  }
  const last = str.slice(-visibleDigits);
  const hiddenCount = str.length - visibleDigits;
  const groupsOfFour = Math.ceil(hiddenCount / 4);
  const dots = Array(groupsOfFour).fill('••••').join(' ');
  return `${dots} ${last}`;
};

export default {
  encrypt,
  decrypt,
  maskNumber,
};

