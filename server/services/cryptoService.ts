import crypto from 'crypto';

/**
 * Hossidev Water Monitor - Cryptographic Service
 * Secure AES-256-GCM encryption for user SMTP passwords at rest.
 * Protects credentials stored in database. Never logs plaintext credentials.
 */

const SECRET_SALT = 'hossidev-scada-kizomba-smtp-encryption-v1';

function getEncryptionKey(): Buffer {
  const rawKey = process.env.SMTP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'hossidev-water-monitor-secure-smtp-key-32b';
  return crypto.createHash('sha256').update(rawKey + SECRET_SALT).digest();
}

/**
 * Encrypts a plaintext password using AES-256-GCM.
 * Output format: iv:authTag:encryptedPayload
 */
export function encryptPassword(plainText: string): string {
  if (!plainText) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV standard for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext.
 * Returns null if authentication tag fails or input is corrupted.
 */
export function decryptPassword(cipherText: string | null | undefined): string | null {
  if (!cipherText || typeof cipherText !== 'string') return null;

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      return null;
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    // Authentication tag mismatch or corrupted ciphertext
    return null;
  }
}
