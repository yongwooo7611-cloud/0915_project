const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email = '', password = '' } = req.body;
  const adminRecord = db.prepare('SELECT * FROM admins WHERE email = ?').get(String(email));

  if (!adminRecord || !bcrypt.compareSync(String(password), adminRecord.password_hash)) {
    return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }

  const admin = {
    id: adminRecord.id,
    email: adminRecord.email,
    name: adminRecord.name,
    role: 'admin',
  };
  const token = jwt.sign(admin, process.env.ADMIN_JWT_SECRET, { expiresIn: '8h' });

  return res.json({ token, admin });
});

router.put('/account', adminAuth, (req, res) => {
  const { name, email, currentPassword, newPassword } = req.body;
  const adminRecord = db
    .prepare('SELECT * FROM admins WHERE id = ? OR email = ?')
    .get(req.admin.id || -1, req.admin.email || '');

  if (!adminRecord || !bcrypt.compareSync(String(currentPassword || ''), adminRecord.password_hash)) {
    return res.status(401).json({ message: '현재 비밀번호가 올바르지 않습니다.' });
  }

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ message: '이름과 이메일을 입력해 주세요.' });
  }

  if (newPassword && newPassword.length < 8) {
    return res.status(400).json({ message: '새 비밀번호는 8자 이상이어야 합니다.' });
  }

  const passwordHash = newPassword
    ? bcrypt.hashSync(newPassword, 12)
    : adminRecord.password_hash;

  try {
    db.prepare(`
      UPDATE admins
      SET name = ?, email = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name.trim(), email.trim(), passwordHash, adminRecord.id);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: '이미 사용 중인 이메일입니다.' });
    }
    throw error;
  }

  const admin = { id: adminRecord.id, name: name.trim(), email: email.trim(), role: 'admin' };
  const token = jwt.sign(admin, process.env.ADMIN_JWT_SECRET, { expiresIn: '8h' });

  return res.json({ message: '관리자 계정 정보가 변경되었습니다.', admin, token });
});

router.get('/dashboard', adminAuth, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const posts = db.prepare('SELECT COUNT(*) AS count FROM posts').get().count;
  const comments = db.prepare('SELECT COUNT(*) AS count FROM comments').get().count;
  const views = db.prepare('SELECT COALESCE(SUM(view_count), 0) AS count FROM posts').get().count;
  const recentPosts = db.prepare(`
    SELECT posts.id, posts.title, posts.category, posts.created_at, posts.is_hidden,
      users.nickname AS author
    FROM posts
    JOIN users ON users.id = posts.user_id
    ORDER BY posts.created_at DESC
    LIMIT 5
  `).all();

  return res.json({
    admin: req.admin,
    stats: { users, posts, comments, views },
    recentPosts,
  });
});

router.get('/posts', adminAuth, (req, res) => {
  const posts = db.prepare(`
    SELECT posts.id, posts.title, posts.category, posts.content, posts.view_count,
      posts.is_hidden, posts.created_at, posts.updated_at,
      users.id AS user_id, users.nickname AS author, users.email AS author_email,
      (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) AS comment_count
    FROM posts
    JOIN users ON users.id = posts.user_id
    ORDER BY posts.created_at DESC
  `).all();

  return res.json({ posts });
});

router.patch('/posts/:postId/visibility', adminAuth, (req, res) => {
  const postId = Number.parseInt(req.params.postId, 10);
  const hidden = req.body.hidden === true ? 1 : 0;
  const result = db.prepare(`
    UPDATE posts SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(hidden, postId);

  if (result.changes === 0) {
    return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  }
  return res.json({ message: hidden ? '게시글이 숨김 처리되었습니다.' : '게시글이 공개되었습니다.' });
});

router.delete('/posts/:postId', adminAuth, (req, res) => {
  const postId = Number.parseInt(req.params.postId, 10);
  const result = db.prepare('DELETE FROM posts WHERE id = ?').run(postId);

  if (result.changes === 0) {
    return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  }
  return res.json({ message: '게시글이 삭제되었습니다.' });
});

router.get('/comments', adminAuth, (req, res) => {
  const comments = db.prepare(`
    SELECT comments.id, comments.content, comments.is_hidden, comments.created_at, comments.updated_at,
      users.id AS user_id, users.nickname AS author, users.email AS author_email,
      posts.id AS post_id, posts.title AS post_title
    FROM comments
    JOIN users ON users.id = comments.user_id
    JOIN posts ON posts.id = comments.post_id
    ORDER BY comments.created_at DESC
  `).all();
  return res.json({ comments });
});

router.patch('/comments/:commentId/visibility', adminAuth, (req, res) => {
  const commentId = Number.parseInt(req.params.commentId, 10);
  const hidden = req.body.hidden === true ? 1 : 0;
  const result = db.prepare(`
    UPDATE comments SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(hidden, commentId);
  if (result.changes === 0) return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
  return res.json({ message: hidden ? '댓글을 숨겼습니다.' : '댓글을 공개했습니다.' });
});

router.delete('/comments/:commentId', adminAuth, (req, res) => {
  const commentId = Number.parseInt(req.params.commentId, 10);
  const result = db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
  if (result.changes === 0) return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
  return res.json({ message: '댓글을 삭제했습니다.' });
});

module.exports = router;
