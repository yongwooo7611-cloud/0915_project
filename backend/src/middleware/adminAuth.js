const jwt = require('jsonwebtoken');

function adminAuth(req, res, next) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: '관리자 인증이 필요합니다.' });
  }

  try {
    req.admin = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: '관리자 인증이 만료되었거나 유효하지 않습니다.' });
  }
}

module.exports = adminAuth;
