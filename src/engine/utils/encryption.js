const crypto = require('crypto');
const Config = require('../config');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

class Encryption {
  static getEncryptionKey() {
    const key = Config.getEncryptionKey();
    return crypto.createHash('sha256').update(key).digest();
  }

  static encrypt(text) {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  static decrypt(encryptedText) {
    try {
      const key = this.getEncryptionKey();
      const parts = encryptedText.split(':');
      const iv = Buffer.from(parts.shift(), 'hex');
      const encrypted = parts.join(':');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      throw new Error(`Failed to decrypt: ${error.message}`);
    }
  }

  static validateEncryptedText(encryptedText) {
    if (!encryptedText || typeof encryptedText !== 'string') {
      return false;
    }
    
    const parts = encryptedText.split(':');
    if (parts.length < 2) {
      return false;
    }
    
    try {
      Buffer.from(parts[0], 'hex');
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = Encryption;