# Security Documentation

## Overview
This document outlines the security measures implemented in the Work Tracker application to protect user data and prevent common vulnerabilities.

## Security Measures Implemented

### 1. Authentication & Authorization

#### Password Security
- **Hashing**: Passwords are hashed using bcrypt with 12 salt rounds
- **Minimum Requirements**:
  - At least 8 characters
  - Must contain uppercase letters
  - Must contain lowercase letters
  - Must contain numbers
  - Must contain special characters
  - Cannot be common/compromised passwords
  - No sequential characters (abc, 123)
  - No repeated characters (aaa, 111)

#### Account Protection
- **Account Lockout**: After 5 failed login attempts, accounts are locked for 2 hours
- **Token Expiration**: JWT tokens expire based on configured duration
- **Password Change Detection**: Tokens are invalidated when password is changed
- **Active Account Check**: Deactivated accounts cannot log in

#### JWT Security
- Tokens are signed with a secret key
- Include expiration time
- Validated on every protected route
- Tokens invalidated on password change

### 2. Input Validation & Sanitization

#### Backend Protection
- **MongoDB Injection**: `express-mongo-sanitize` prevents NoSQL injection attacks
- **XSS Protection**: `xss-clean` sanitizes user input to prevent XSS attacks
- **Email Validation**: Uses `validator` library for email format validation
- **Password Validation**: Custom validation with strength requirements

#### Frontend Protection
- **Input Sanitization Utility** ([src/utils/sanitize.js](src/utils/sanitize.js)):
  - `sanitizeInput()`: Removes script tags and event handlers
  - `sanitizeObject()`: Recursively sanitizes object properties
  - `escapeHtml()`: Escapes HTML special characters
  - `sanitizeUrl()`: Validates and sanitizes URLs
  - `sanitizeFilename()`: Prevents path traversal attacks

### 3. Rate Limiting

#### General API Protection
- **Global Limit**: 600 requests per 15 minutes per IP
- **Window**: 15-minute sliding window
- **Response**: 429 Too Many Requests status code

#### Authentication Routes
- **Stricter Limit**: 5 attempts per 15 minutes
- **Skip on Success**: Successful logins don't count against limit
- **Applies to**: `/api/auth/login` and `/api/auth/register`

### 4. HTTP Security Headers

#### Helmet Configuration
- **XSS Filter**: Enabled to prevent reflected XSS attacks
- **noSniff**: Prevents MIME type sniffing
- **HSTS**: Enforces HTTPS connections (production)
- **Referrer Policy**: Controls referrer information leakage

### 5. CORS (Cross-Origin Resource Sharing)

#### Current Configuration
- **Origin**: Wildcard (*) - allows all origins
- **Credentials**: Enabled for cookie support
- **Methods**: Standard HTTP methods allowed

⚠️ **Note**: For production, restrict origins to specific domains:
```javascript
origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://yourdomain.com']
```

### 6. Security Logging

#### Monitored Events
All security events are logged to `logs/security.log`:

1. **Authentication Events**
   - Login attempts (success/failure)
   - Registration attempts
   - Account lockouts
   - Password changes

2. **Suspicious Activity**
   - SQL injection attempts
   - XSS attempts
   - Path traversal attempts
   - Command injection attempts

3. **Authorization Failures**
   - Unauthorized access attempts
   - Privilege escalation attempts
   - Failed permission checks

4. **Rate Limiting**
   - Rate limit violations
   - IP addresses exceeding limits

#### Log Format
```json
{
  "timestamp": "2024-02-05T12:00:00.000Z",
  "event": "LOGIN_ATTEMPT",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "email": "user@example.com",
  "success": false,
  "statusCode": 401,
  "failureReason": "Invalid credentials"
}
```

### 7. Data Protection

#### Sensitive Data Handling
- **Password Field**: Excluded from query results by default (`select: false`)
- **Login Attempts**: Not included in user JSON responses
- **Lock Status**: Hidden from API responses
- **Token Storage**: Client uses localStorage (⚠️ consider httpOnly cookies for production)

#### Database Security
- **Connection**: Use connection string with authentication
- **Indexes**: Email field indexed for performance
- **Validation**: Mongoose schema validation enforced

### 8. Error Handling

#### Secure Error Messages
- Generic error messages for production
- No stack traces exposed to clients
- Detailed errors logged server-side only
- Status codes follow HTTP standards

#### Unhandled Errors
- Unhandled promise rejections logged and handled
- Uncaught exceptions cause graceful shutdown
- Error handler middleware catches all errors

## Security Best Practices

### For Developers

1. **Never commit sensitive data**
   - Use `.env` files (never commit `.env`)
   - Use environment variables for secrets
   - Keep `.env.example` updated

2. **Input Validation**
   - Always validate on backend (don't trust frontend)
   - Use whitelist validation when possible
   - Sanitize all user input

3. **Authentication**
   - Use strong JWT secrets (32+ characters)
   - Set appropriate token expiration times
   - Invalidate tokens on logout
   - Consider refresh tokens for long sessions

4. **Authorization**
   - Always check permissions on backend
   - Use role-based access control (RBAC)
   - Implement principle of least privilege

5. **Dependencies**
   - Keep dependencies updated
   - Run `npm audit` regularly
   - Review security advisories

### For Deployment

1. **Environment Variables**
   ```bash
   NODE_ENV=production
   JWT_SECRET=<strong-random-secret>
   MONGODB_URI=<secure-connection-string>
   ```

2. **HTTPS**
   - Always use HTTPS in production
   - Enable HSTS headers
   - Use valid SSL certificates

3. **CORS**
   - Restrict to specific origins
   - Don't use wildcard in production

4. **Monitoring**
   - Monitor security logs regularly
   - Set up alerts for suspicious activity
   - Review failed login attempts

5. **Backups**
   - Regular database backups
   - Encrypted backup storage
   - Test restore procedures

## Known Limitations & Recommendations

### Current Limitations

1. **Token Storage**: Using localStorage (XSS vulnerable)
   - **Recommendation**: Migrate to httpOnly cookies

2. **CORS**: Allows all origins
   - **Recommendation**: Restrict to specific domains in production

3. **Password Breach Check**: Basic local check only
   - **Recommendation**: Integrate with HaveIBeenPwned API

4. **File Upload**: No file upload security implemented yet
   - **Recommendation**: Add file type validation, size limits, virus scanning

### Future Enhancements

1. **Two-Factor Authentication (2FA)**
   - TOTP-based authentication
   - SMS/Email verification

2. **Security Headers**
   - Implement Content Security Policy (CSP)
   - Add more restrictive headers

3. **API Documentation**
   - Document all endpoints with security requirements
   - Add OpenAPI/Swagger documentation

4. **Penetration Testing**
   - Regular security audits
   - Automated vulnerability scanning

5. **Session Management**
   - Add session timeout
   - Implement refresh tokens
   - Track active sessions

## Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** open a public issue
2. Email security concerns to: [your-security-email]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

## Compliance

### Data Protection
- User passwords are never stored in plain text
- Sensitive data is not logged
- User data can be deleted on request

### Logging
- Only security-relevant events are logged
- Personal data in logs is minimized
- Logs are rotated and retained per policy

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [MongoDB Security Checklist](https://docs.mongodb.com/manual/administration/security-checklist/)

## Last Updated
February 5, 2025
