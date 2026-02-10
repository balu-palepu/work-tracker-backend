/**
 * Email security utilities for protecting user email addresses
 */

/**
 * Mask an email address for display
 * Example: john.doe@example.com -> j***e@e***.com
 * @param {string} email - Email to mask
 * @param {Object} options - Masking options
 * @param {number} options.showFirstChars - Number of first chars to show in local part (default: 1)
 * @param {number} options.showLastChars - Number of last chars to show in local part (default: 1)
 * @param {boolean} options.maskDomain - Whether to mask the domain (default: true)
 * @returns {string} - Masked email
 */
const maskEmail = (email, options = {}) => {
  if (!email || typeof email !== 'string') {
    return '';
  }

  const {
    showFirstChars = 1,
    showLastChars = 1,
    maskDomain = true
  } = options;

  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) {
    return email;
  }

  // Mask local part
  let maskedLocal;
  if (localPart.length <= showFirstChars + showLastChars) {
    maskedLocal = localPart[0] + '***';
  } else {
    const firstPart = localPart.substring(0, showFirstChars);
    const lastPart = localPart.substring(localPart.length - showLastChars);
    maskedLocal = `${firstPart}***${lastPart}`;
  }

  // Mask domain if required
  let maskedDomain = domain;
  if (maskDomain) {
    const domainParts = domain.split('.');
    if (domainParts.length >= 2) {
      const tld = domainParts.pop();
      const domainName = domainParts.join('.');
      maskedDomain = domainName.length > 2
        ? `${domainName[0]}***${domainName[domainName.length - 1]}.${tld}`
        : `${domainName[0]}***.${tld}`;
    }
  }

  return `${maskedLocal}@${maskedDomain}`;
};

/**
 * Check if user can view full email
 * Admin can see all emails, users can see their own email
 * @param {string} viewerId - ID of user viewing
 * @param {string} emailOwnerId - ID of user who owns the email
 * @param {string} viewerRole - Role of the viewer
 * @returns {boolean}
 */
const canViewFullEmail = (viewerId, emailOwnerId, viewerRole) => {
  // Admin can see all emails
  if (viewerRole === 'admin') {
    return true;
  }

  // Users can see their own email
  if (viewerId && emailOwnerId && viewerId.toString() === emailOwnerId.toString()) {
    return true;
  }

  return false;
};

/**
 * Process user object to mask email based on permissions
 * @param {Object} user - User object with email
 * @param {string} viewerId - ID of user viewing
 * @param {string} viewerRole - Role of the viewer
 * @returns {Object} - User object with potentially masked email
 */
const processUserEmail = (user, viewerId, viewerRole) => {
  if (!user || !user.email) {
    return user;
  }

  const userObj = user.toObject ? user.toObject() : { ...user };

  if (!canViewFullEmail(viewerId, user._id, viewerRole)) {
    userObj.email = maskEmail(userObj.email);
    userObj.emailMasked = true;
  } else {
    userObj.emailMasked = false;
  }

  return userObj;
};

/**
 * Process array of users to mask emails based on permissions
 * @param {Array} users - Array of user objects
 * @param {string} viewerId - ID of user viewing
 * @param {string} viewerRole - Role of the viewer
 * @returns {Array} - Array of users with potentially masked emails
 */
const processUsersEmails = (users, viewerId, viewerRole) => {
  if (!Array.isArray(users)) {
    return users;
  }

  return users.map(user => processUserEmail(user, viewerId, viewerRole));
};

/**
 * Sanitize email for logging (always mask for security)
 * @param {string} email - Email to sanitize
 * @returns {string} - Sanitized email
 */
const sanitizeEmailForLog = (email) => {
  return maskEmail(email, { showFirstChars: 2, showLastChars: 0, maskDomain: true });
};

module.exports = {
  maskEmail,
  canViewFullEmail,
  processUserEmail,
  processUsersEmails,
  sanitizeEmailForLog
};
