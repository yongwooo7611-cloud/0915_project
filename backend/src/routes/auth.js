const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const userAuth = require('../middleware/userAuth');

const router = express.Router();

function publicUser(record) {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    nickname: record.nickname,
    bio: record.bio || '',
    createdAt: record.created_at,
  };
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: 'user' },
    process.env.USER_JWT_SECRET || process.env.ADMIN_JWT_SECRET,
    { expiresIn: '7d' },
  );
}

router.post('/signup', (req, res) => {
  const name = String(req.body.name || '').trim();
  const nickname = String(req.body.nickname || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!name || !nickname || !email || !password) {
    return res.status(400).json({ message: '모든 필수 정보를 입력해 주세요.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: '비밀번호는 8자 이상이어야 합니다.' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, name, nickname)
      VALUES (?, ?, ?, ?)
    `).run(email, bcrypt.hashSync(password, 12), name, nickname);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: '이미 사용 중인 이메일 또는 닉네임입니다.' });
    }
    throw error;
  }
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const record = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!record || !bcrypt.compareSync(password, record.password_hash)) {
    return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }

  return res.json({ token: createToken(record), user: publicUser(record) });
});

router.get('/me', userAuth, (req, res) => {
  const record = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  if (!record) {
    return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
  }

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM posts WHERE user_id = ?) AS posts,
      (SELECT COUNT(*) FROM comments WHERE user_id = ?) AS comments
  `).get(record.id, record.id);
  const posts = db.prepare(`
    SELECT posts.id, posts.category, posts.title, posts.created_at, posts.updated_at,
      posts.is_hidden,
      posts.view_count,
      (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) AS comment_count
    FROM posts
    WHERE posts.user_id = ?
    ORDER BY posts.created_at DESC
  `).all(record.id);

  return res.json({ user: publicUser(record), stats, posts });
});

module.exports = router;
