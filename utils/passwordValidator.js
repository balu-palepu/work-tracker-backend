/**
 * Password validation utilities for enhanced security
 */

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
const validatePasswordStrength = (password) => {
  const errors = [];

  // Minimum length check
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  // Lowercase letter check
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Uppercase letter check
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Number check
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Special character check
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check for common weak passwords
  const weakPasswords = [
    'password', 'Password1', '12345678', 'qwerty', 'abc123',
    'password123', 'Password123', 'admin123', 'welcome1', 'letmein'
  ];

  if (weakPasswords.some(weak => password.toLowerCase().includes(weak.toLowerCase()))) {
    errors.push('Password is too common. Please choose a stronger password');
  }

  // Check for sequential characters
  if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(password)) {
    errors.push('Password should not contain sequential characters');
  }

  // Check for repeated characters
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password should not contain repeated characters (e.g., aaa, 111)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Check if password has been compromised (basic check)
 * In production, you would integrate with HaveIBeenPwned API
 * @param {string} password - Password to check
 * @returns {boolean} - True if password appears safe
 */
const checkPasswordCompromised = (password) => {
  // List of most common compromised passwords
  const compromisedPasswords = [
    '123456', 'password', '12345678', 'qwerty', '123456789',
    '12345', '1234', '111111', '1234567', 'dragon',
    '123123', 'baseball', 'iloveyou', 'trustno1', '1234567890',
    'sunshine', 'master', 'welcome', 'shadow', 'ashley',
    'football', 'jesus', 'michael', 'ninja', 'mustang'
  ];

  return !compromisedPasswords.includes(password.toLowerCase());
};

/**
 * Full password validation
 * @param {string} password - Password to validate
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      errors: ['Password is required']
    };
  }

  // Check strength
  const strengthCheck = validatePasswordStrength(password);

  if (!strengthCheck.isValid) {
    return strengthCheck;
  }

  // Check if compromised
  if (!checkPasswordCompromised(password)) {
    return {
      isValid: false,
      errors: ['This password has been found in data breaches. Please choose a different password']
    };
  }

  return {
    isValid: true,
    errors: []
  };
};

module.exports = {
  validatePassword,
  validatePasswordStrength,
  checkPasswordCompromised
};
