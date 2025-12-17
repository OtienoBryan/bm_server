const jwt = require('jsonwebtoken');

/**
 * Middleware to extract user information from request
 * This helps with audit logging by providing user context
 */
function extractUserInfo(req) {
  // Try to get user info from various sources
  let staffId = null;
  let staffName = null;
  let staffUsername = null;

  // From request body (for some endpoints)
  if (req.body.userId) {
    staffId = req.body.userId;
  }
  if (req.body.userName) {
    staffUsername = req.body.userName;
    staffName = req.body.userName;
  }

  // From query params
  if (req.query.userId) {
    staffId = req.query.userId;
  }

  // From JWT token via req.user (if middleware set it)
  if (req.user) {
    staffId = req.user.id || staffId;
    staffUsername = req.user.username || staffUsername;
    staffName = req.user.username || staffName;
  }

  // Try to decode JWT token from Authorization header if req.user is not set
  if (!staffId && !staffUsername) {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        if (decoded) {
          staffId = decoded.userId || decoded.id || staffId;
          staffUsername = decoded.username || staffUsername;
          staffName = decoded.username || staffName;
        }
      }
    } catch (error) {
      // Token is invalid or expired, ignore silently
      // This is expected for some requests
    }
  }

  // Get IP address - try multiple methods
  let ipAddress = null;
  
  // First try req.ip (works when trust proxy is enabled)
  if (req.ip) {
    ipAddress = req.ip;
  }
  // Try x-forwarded-for header (common in proxies/load balancers)
  else if (req.headers['x-forwarded-for']) {
    // x-forwarded-for can contain multiple IPs, get the first one (original client)
    const forwarded = req.headers['x-forwarded-for'];
    ipAddress = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0];
  }
  // Try x-real-ip header (nginx proxy)
  else if (req.headers['x-real-ip']) {
    ipAddress = req.headers['x-real-ip'];
  }
  // Try socket remote address
  else if (req.socket && req.socket.remoteAddress) {
    ipAddress = req.socket.remoteAddress;
  }
  // Fallback to connection remote address
  else if (req.connection && req.connection.remoteAddress) {
    ipAddress = req.connection.remoteAddress;
  }
  
  // Clean up IPv6 mapped IPv4 addresses (::ffff:192.168.1.1 -> 192.168.1.1)
  if (ipAddress && ipAddress.startsWith('::ffff:')) {
    ipAddress = ipAddress.substring(7);
  }
  
  // Handle localhost IPv6 (::1 -> 127.0.0.1 for consistency)
  if (ipAddress === '::1') {
    ipAddress = '127.0.0.1';
  }

  // Get user agent
  const userAgent = req.headers['user-agent'] || null;

  // Debug logging (can be removed in production)
  if (process.env.NODE_ENV !== 'production') {
    console.log('User info extracted:', {
      staffId,
      staffName,
      staffUsername,
      ipAddress,
      hasUser: !!req.user,
      hasToken: !!req.headers['authorization'],
      reqBody: { userId: req.body?.userId, userName: req.body?.userName }
    });
  }

  return {
    staffId,
    staffName,
    staffUsername,
    ipAddress,
    userAgent
  };
}

module.exports = {
  extractUserInfo
};

