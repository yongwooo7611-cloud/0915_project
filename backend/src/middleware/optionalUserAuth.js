const jwt = require('jsonwebtoken');

function optionalUserAuth(req, res, next) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (token) {
    try {
      const user = jwt.verify(token, process.env.USER_JWT_SECRET || process.env.ADMIN_JWT_SECRET);
      if (user.role === 'user') req.user = user;
    } catch {
      // Public post reads remain available when an expired or invalid token is sent.
    }
  }
  next();
}

module.exports = optionalUserAuth;
