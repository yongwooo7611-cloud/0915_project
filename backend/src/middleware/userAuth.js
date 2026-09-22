const jwt = require('jsonwebtoken');

function userAuth(req, res, next) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }

  try {
    const user = jwt.verify(token, process.env.USER_JWT_SECRET || process.env.ADMIN_JWT_SECRET);

    if (user.role !== 'user') {
      throw new Error('Invalid user token');
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: '로그인이 만료되었거나 유효하지 않습니다.' });
  }
}

module.exports = userAuth;
