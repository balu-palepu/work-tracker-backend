const crypto = require('crypto');

// AES-256-GCM encryption
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

class Encryption {
  constructor() {
    if (!process.env.ENCRYPTION_KEY) {
      throw new Error('ENCRYPTION_KEY must be set in environment variables');
    }
    this.masterKey = process.env.ENCRYPTION_KEY;
  }

  // Derive key from master key and salt
  deriveKey(salt) {
    return crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LENGTH, 'sha256');
  }

  // Encrypt sensitive data
  encrypt(text) {
    if (!text) return text;

    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = this.deriveKey(salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine salt + iv + tag + encrypted data
    return salt.toString('hex') + ':' + 
           iv.toString('hex') + ':' + 
           tag.toString('hex') + ':' + 
           encrypted;
  }

  // Decrypt sensitive data
  decrypt(encryptedData) {
    if (!encryptedData) return encryptedData;

    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 4) {
        throw new Error('Invalid encrypted data format');
      }

      const salt = Buffer.from(parts[0], 'hex');
      const iv = Buffer.from(parts[1], 'hex');
      const tag = Buffer.from(parts[2], 'hex');
      const encrypted = parts[3];

      const key = this.deriveKey(salt);
      
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error.message);
      return null;
    }
  }

  // Hash sensitive data (one-way, for comparison only)
  hash(text) {
    return crypto
      .createHash('sha256')
      .update(text)
      .digest('hex');
  }
}

module.exports = new Encryption();
