const express = require('express');
const db = require('../config/database');
const userAuth = require('../middleware/userAuth');
const optionalUserAuth = require('../middleware/optionalUserAuth');

const router = express.Router();
const PAGE_SIZE = 10;

function serializePost(post) {
  return {
    id: post.id,
    category: post.category,
    title: post.title,
    content: post.content,
    excerpt: post.content.replace(/\s+/g, ' ').slice(0, 100),
    author: post.author,
    userId: post.user_id,
    views: post.view_count,
    comments: post.comment_count,
    likes: post.like_count || 0,
    dislikes: post.dislike_count || 0,
    hidden: Boolean(post.is_hidden),
    createdAt: post.created_at,
    updatedAt: post.updated_at,
  };
}

function parsePostId(value) {
  const postId = Number.parseInt(value, 10);
  return Number.isInteger(postId) && postId > 0 ? postId : null;
}

function validatePostInput(body) {
  const post = {
    category: String(body.category || '').trim(),
    title: String(body.title || '').trim(),
    content: String(body.content || '').trim(),
  };

  if (!post.category || !post.title || !post.content) {
    return { error: '카테고리, 제목, 내용을 모두 입력해 주세요.' };
  }
  if (post.title.length > 80) {
    return { error: '제목은 80자 이하로 입력해 주세요.' };
  }
  return { post };
}

router.get('/', (req, res) => {
  const category = String(req.query.category || '').trim();
  const search = String(req.query.search || '').trim();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const where = ['posts.is_hidden = 0'];
  const params = [];

  if (category && category !== '전체') {
    where.push('posts.category = ?');
    params.push(category);
  }
  if (search) {
    where.push('(posts.title LIKE ? OR posts.content LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS count FROM posts ${whereSql}`).get(...params).count;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = db.prepare(`
    SELECT posts.*, users.nickname AS author,
      (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND comments.is_hidden = 0) AS comment_count,
      (SELECT COUNT(*) FROM post_reactions WHERE post_reactions.post_id = posts.id AND reaction = 'like') AS like_count,
      (SELECT COUNT(*) FROM post_reactions WHERE post_reactions.post_id = posts.id AND reaction = 'dislike') AS dislike_count
    FROM posts
    JOIN users ON users.id = posts.user_id
    ${whereSql}
    ORDER BY posts.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, PAGE_SIZE, (currentPage - 1) * PAGE_SIZE);

  return res.json({ posts: rows.map(serializePost), pagination: { page: currentPage, totalPages, total } });
});

router.post('/', userAuth, (req, res) => {
  const { post, error } = validatePostInput(req.body);
  if (error) return res.status(400).json({ message: error });

  const result = db.prepare(`
    INSERT INTO posts (user_id, category, title, content)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, post.category, post.title, post.content);

  return res.status(201).json({ id: Number(result.lastInsertRowid) });
});

router.get('/:postId/manage', userAuth, (req, res) => {
  const postId = parsePostId(req.params.postId);
  const post = postId ? db.prepare(`
    SELECT posts.*, users.nickname AS author,
      (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND comments.is_hidden = 0) AS comment_count,
      (SELECT COUNT(*) FROM post_reactions WHERE post_reactions.post_id = posts.id AND reaction = 'like') AS like_count,
      (SELECT COUNT(*) FROM post_reactions WHERE post_reactions.post_id = posts.id AND reaction = 'dislike') AS dislike_count
    FROM posts JOIN users ON users.id = posts.user_id
    WHERE posts.id = ?
  `).get(postId) : null;

  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  if (post.user_id !== req.user.id) return res.status(403).json({ message: '작성자만 게시글을 수정할 수 있습니다.' });

  return res.json({ post: serializePost(post) });
});

router.put('/:postId', userAuth, (req, res) => {
  const postId = parsePostId(req.params.postId);
  const existing = postId ? db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId) : null;
  if (!existing) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  if (existing.user_id !== req.user.id) return res.status(403).json({ message: '작성자만 게시글을 수정할 수 있습니다.' });

  const { post, error } = validatePostInput(req.body);
  if (error) return res.status(400).json({ message: error });

  db.prepare(`
    UPDATE posts SET category = ?, title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(post.category, post.title, post.content, postId);

  return res.json({ message: '게시글이 수정되었습니다.', id: postId });
});

router.delete('/:postId', userAuth, (req, res) => {
  const postId = parsePostId(req.params.postId);
  const existing = postId ? db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId) : null;
  if (!existing) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  if (existing.user_id !== req.user.id) return res.status(403).json({ message: '작성자만 게시글을 삭제할 수 있습니다.' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
  return res.json({ message: '게시글이 삭제되었습니다.' });
});

router.post('/:postId/view', userAuth, (req, res) => {
  const postId = parsePostId(req.params.postId);
  if (!postId) {
    return res.status(400).json({ message: '잘못된 조회 요청입니다.' });
  }
  if (!db.prepare('SELECT id FROM posts WHERE id = ? AND is_hidden = 0').get(postId)) {
    return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  }

  const recordView = db.transaction(() => {
    const viewerKey = `user:${req.user.id}`;
    const result = db.prepare(`
      INSERT OR IGNORE INTO post_views (post_id, viewer_key) VALUES (?, ?)
    `).run(postId, viewerKey);
    if (result.changes > 0) {
      db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(postId);
    }
    return db.prepare('SELECT view_count AS views FROM posts WHERE id = ?').get(postId).views;
  });

  return res.json({ views: recordView() });
});

router.get('/:postId', optionalUserAuth, (req, res) => {
  const postId = parsePostId(req.params.postId);
  if (!postId) return res.status(400).json({ message: '잘못된 게시글 번호입니다.' });

  const post = db.prepare(`
    SELECT posts.*, users.nickname AS author,
      (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND comments.is_hidden = 0) AS comment_count,
      (SELECT COUNT(*) FROM post_reactions WHERE post_reactions.post_id = posts.id AND reaction = 'like') AS like_count,
      (SELECT COUNT(*) FROM post_reactions WHERE post_reactions.post_id = posts.id AND reaction = 'dislike') AS dislike_count
    FROM posts JOIN users ON users.id = posts.user_id
    WHERE posts.id = ? AND posts.is_hidden = 0
  `).get(postId);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  const comments = db.prepare(`
    SELECT comments.id, comments.content, comments.created_at, comments.updated_at,
      users.id AS user_id, users.nickname AS author
    FROM comments JOIN users ON users.id = comments.user_id
    WHERE comments.post_id = ? AND comments.is_hidden = 0 ORDER BY comments.created_at ASC
  `).all(postId).map((comment) => ({
    id: comment.id,
    content: comment.content,
    createdAt: comment.created_at,
    userId: comment.user_id,
    author: comment.author,
    updatedAt: comment.updated_at,
  }));

  const reaction = req.user
    ? db.prepare('SELECT reaction FROM post_reactions WHERE post_id = ? AND user_id = ?').get(postId, req.user.id)?.reaction || null
    : null;
  return res.json({ post: { ...serializePost(post), userReaction: reaction }, comments });
});

router.put('/:postId/reaction', userAuth, (req, res) => {
  const postId = parsePostId(req.params.postId);
  const reaction = req.body.reaction;
  if (!postId || !db.prepare('SELECT id FROM posts WHERE id = ? AND is_hidden = 0').get(postId)) {
    return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  }
  if (reaction !== null && reaction !== 'like' && reaction !== 'dislike') {
    return res.status(400).json({ message: '올바른 반응을 선택해 주세요.' });
  }

  const updateReaction = db.transaction(() => {
    db.prepare('DELETE FROM post_reactions WHERE post_id = ? AND user_id = ?').run(postId, req.user.id);
    if (reaction) {
      db.prepare('INSERT INTO post_reactions (post_id, user_id, reaction) VALUES (?, ?, ?)')
        .run(postId, req.user.id, reaction);
    }
    return db.prepare(`
      SELECT
        SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END) AS likes,
        SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END) AS dislikes
      FROM post_reactions WHERE post_id = ?
    `).get(postId);
  });
  const counts = updateReaction();
  return res.json({ reaction, likes: counts.likes || 0, dislikes: counts.dislikes || 0 });
});

router.post('/:postId/comments', userAuth, (req, res) => {
  const postId = parsePostId(req.params.postId);
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ message: '댓글 내용을 입력해 주세요.' });
  if (content.length > 2000) return res.status(400).json({ message: '댓글은 2,000자 이하로 입력해 주세요.' });
  if (!postId || !db.prepare('SELECT id FROM posts WHERE id = ? AND is_hidden = 0').get(postId)) {
    return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  }

  const result = db.prepare(`INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)`)
    .run(postId, req.user.id, content);
  const comment = db.prepare(`
    SELECT comments.id, comments.content, comments.created_at, comments.updated_at,
      users.id AS user_id, users.nickname AS author
    FROM comments JOIN users ON users.id = comments.user_id
    WHERE comments.id = ?
  `).get(result.lastInsertRowid);

  return res.status(201).json({ comment: {
    id: comment.id,
    content: comment.content,
    createdAt: comment.created_at,
    userId: comment.user_id,
    author: comment.author,
    updatedAt: comment.updated_at,
  } });
});

router.put('/:postId/comments/:commentId', userAuth, (req, res) => {
  const postId = parsePostId(req.params.postId);
  const commentId = parsePostId(req.params.commentId);
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ message: '댓글 내용을 입력해 주세요.' });
  if (content.length > 2000) return res.status(400).json({ message: '댓글은 2,000자 이하로 입력해 주세요.' });

  const comment = commentId ? db.prepare('SELECT user_id, is_hidden FROM comments WHERE id = ? AND post_id = ?').get(commentId, postId) : null;
  if (!comment) return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
  if (comment.user_id !== req.user.id) return res.status(403).json({ message: '작성자만 댓글을 수정할 수 있습니다.' });
  if (comment.is_hidden) return res.status(409).json({ message: '숨김 처리된 댓글은 수정할 수 없습니다.' });

  db.prepare('UPDATE comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(content, commentId);
  const updated = db.prepare('SELECT content, updated_at FROM comments WHERE id = ?').get(commentId);
  return res.json({ message: '댓글을 수정했습니다.', content: updated.content, updatedAt: updated.updated_at });
});

router.delete('/:postId/comments/:commentId', userAuth, (req, res) => {
  const postId = parsePostId(req.params.postId);
  const commentId = parsePostId(req.params.commentId);
  const comment = commentId ? db.prepare('SELECT user_id FROM comments WHERE id = ? AND post_id = ?').get(commentId, postId) : null;
  if (!comment) return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
  if (comment.user_id !== req.user.id) return res.status(403).json({ message: '작성자만 댓글을 삭제할 수 있습니다.' });

  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
  return res.json({ message: '댓글을 삭제했습니다.' });
});

module.exports = router;
