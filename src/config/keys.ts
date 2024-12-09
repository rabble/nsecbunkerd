import crypto from 'crypto';

/**
 * Encryption utilities for securely storing nsec (private keys)
 */

/**
 * Encrypts an nsec using AES-256-CBC with a key derived from the passphrase
 * @param nsec - The private key to encrypt
 * @param passphrase - User provided passphrase to derive encryption key
 * @returns Object containing initialization vector and encrypted data as hex strings
 */
export function encryptNsec(nsec: string, passphrase: string): { iv: string, data: string } {
    const algorithm = 'aes-256-cbc';
    const key = crypto.createHash('sha256').update(passphrase).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(nsec);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return {
        iv: iv.toString('hex'),
        data: encrypted.toString('hex'),
    };
}

/**
 * Decrypts an encrypted nsec using the original passphrase
 * @param iv - Initialization vector as hex string
 * @param data - Encrypted data as hex string  
 * @param passphrase - Original passphrase used for encryption
 * @returns Decrypted nsec string
 */
export function decryptNsec(iv: string, data: string, passphrase: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.createHash('sha256').update(passphrase).digest();
    const ivBuffer = Buffer.from(iv, 'hex');
    const dataBuffer = Buffer.from(data, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, ivBuffer);
    let decrypted = decipher.update(dataBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}
