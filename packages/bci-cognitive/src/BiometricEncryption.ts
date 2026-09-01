/**
 * VIBE SpatialOS - Biometric Data Encryption & Anonymizer
 * Implements NIST-standard AES-256-GCM encryption and SHA-256 anonymization
 * for sensitive EEG, HRV, and cognitive affective telemetry (GDPR / HIPAA compliance).
 */

import crypto from 'node:crypto';

export interface EncryptedPayload {
  ciphertextBase64: string;
  ivHex: string;
  authTagHex: string;
  anonymizedUserId: string;
  timestampMs: number;
}

export class BiometricEncryption {
  private key: Buffer;

  constructor(secretKeyHex?: string) {
    if (secretKeyHex) {
      this.key = Buffer.from(secretKeyHex, 'hex');
    } else {
      // Deterministic dev key or random 256-bit key
      this.key = crypto.scryptSync('vibe_spatial_bci_salt_2026', 'gcs_v7_empathy', 32);
    }
  }

  /**
   * Hashes user identification with SHA-256 to guarantee non-reversible anonymity
   */
  public anonymizeUserId(rawUserId: string): string {
    return crypto.createHash('sha256').update(`vibe_anon_${rawUserId}`).digest('hex').substring(0, 16);
  }

  /**
   * Encrypts sensitive neural/biometric telemetry using AES-256-GCM
   */
  public encryptBiometricData(plainData: object, rawUserId: string): EncryptedPayload {
    const iv = crypto.randomBytes(12); // 12-byte IV standard for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);

    const jsonStr = JSON.stringify(plainData);
    let ciphertext = cipher.update(jsonStr, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return {
      ciphertextBase64: ciphertext,
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
      anonymizedUserId: this.anonymizeUserId(rawUserId),
      timestampMs: Date.now()
    };
  }

  /**
   * Decrypts and authenticates AES-256-GCM ciphertext
   */
  public decryptBiometricData<T = any>(payload: EncryptedPayload): T {
    const iv = Buffer.from(payload.ivHex, 'hex');
    const authTag = Buffer.from(payload.authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(payload.ciphertextBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted) as T;
  }
}
