const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate JWT tokens
 * Decodes the token and sets req.user with user information
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    // Don't block the request, just continue without user info
    // This allows some endpoints to work without authentication
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, decoded) => {
    if (err) {
      // Token is invalid, but don't block - just continue without user info
      console.warn('Invalid or expired token:', err.message);
      return next();
    }

    // Set user info from decoded token
    req.user = {
      id: decoded.userId || decoded.id,
      username: decoded.username,
      role: decoded.role
    };

    next();
  });
};

module.exports = {
  authenticateToken
};

