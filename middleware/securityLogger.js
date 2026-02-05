/**
 * Security logging middleware for monitoring suspicious activities
 */

const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const securityLogFile = path.join(logsDir, 'security.log');

/**
 * Log security events to file
 * @param {string} event - Event type
 * @param {Object} details - Event details
 */
const logSecurityEvent = (event, details) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    ...details
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  fs.appendFile(securityLogFile, logLine, (err) => {
    if (err) {
      console.error('Failed to write security log:', err);
    }
  });
};

/**
 * Middleware to log authentication attempts
 */
const logAuthAttempt = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = function (data) {
    const isLoginOrRegister = req.path.includes('/login') || req.path.includes('/register');

    if (isLoginOrRegister) {
      const event = {
        type: req.path.includes('/login') ? 'LOGIN_ATTEMPT' : 'REGISTRATION_ATTEMPT',
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        email: req.body?.email,
        success: data.success || false,
        statusCode: res.statusCode,
        message: data.message
      };

      if (!data.success) {
        event.failureReason = data.message;
      }

      logSecurityEvent(event.type, event);
    }

    return originalJson(data);
  };

  next();
};

/**
 * Middleware to log suspicious requests
 */
const logSuspiciousActivity = (req, res, next) => {
  const suspiciousPatterns = [
    // SQL Injection attempts
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
    // XSS attempts
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    // Path traversal
    /\.\.[\/\\]/,
    // Command injection
    /[;&|`$()]/
  ];

  const checkString = JSON.stringify(req.body) + JSON.stringify(req.query) + req.path;

  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(checkString));

  if (isSuspicious) {
    logSecurityEvent('SUSPICIOUS_REQUEST', {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      method: req.method,
      path: req.path,
      body: req.body,
      query: req.query,
      headers: {
        referer: req.get('referer'),
        origin: req.get('origin')
      }
    });
  }

  next();
};

/**
 * Middleware to log failed authorization attempts
 */
const logUnauthorizedAccess = (err, req, res, next) => {
  if (err.status === 401 || err.status === 403) {
    logSecurityEvent('UNAUTHORIZED_ACCESS', {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      method: req.method,
      path: req.path,
      userId: req.user?._id,
      statusCode: err.status,
      message: err.message
    });
  }

  next(err);
};

/**
 * Log rate limit violations
 */
const logRateLimitViolation = (req) => {
  logSecurityEvent('RATE_LIMIT_EXCEEDED', {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    path: req.path,
    method: req.method
  });
};

/**
 * Middleware to log password changes
 */
const logPasswordChange = (userId, ip, userAgent, success) => {
  logSecurityEvent('PASSWORD_CHANGE', {
    userId,
    ip,
    userAgent,
    success
  });
};

/**
 * Middleware to log account lockouts
 */
const logAccountLockout = (email, ip, userAgent) => {
  logSecurityEvent('ACCOUNT_LOCKOUT', {
    email,
    ip,
    userAgent,
    reason: 'Multiple failed login attempts'
  });
};

/**
 * Middleware to log privilege escalation attempts
 */
const logPrivilegeEscalation = (req, attemptedAction) => {
  logSecurityEvent('PRIVILEGE_ESCALATION_ATTEMPT', {
    userId: req.user?._id,
    userRole: req.user?.role,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    attemptedAction,
    path: req.path,
    method: req.method
  });
};

/**
 * Get recent security events (for admin dashboard)
 * @param {number} limit - Number of events to retrieve
 * @returns {Promise<Array>} - Array of security events
 */
const getRecentSecurityEvents = async (limit = 100) => {
  return new Promise((resolve, reject) => {
    fs.readFile(securityLogFile, 'utf8', (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          return resolve([]);
        }
        return reject(err);
      }

      const lines = data.trim().split('\n');
      const events = lines
        .slice(-limit)
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(event => event !== null)
        .reverse();

      resolve(events);
    });
  });
};

module.exports = {
  logSecurityEvent,
  logAuthAttempt,
  logSuspiciousActivity,
  logUnauthorizedAccess,
  logRateLimitViolation,
  logPasswordChange,
  logAccountLockout,
  logPrivilegeEscalation,
  getRecentSecurityEvents
};
