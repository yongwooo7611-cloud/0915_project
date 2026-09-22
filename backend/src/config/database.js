const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const databasePath = path.resolve(
  process.cwd(),
  process.env.DATABASE_PATH || './data/community.db',
);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    nickname TEXT NOT NULL UNIQUE,
    bio TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT '자유',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS post_views (
    post_id INTEGER NOT NULL,
    viewer_key TEXT NOT NULL,
    viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, viewer_key),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS post_reactions (
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_posts_created_at
    ON posts(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_comments_post_id
    ON comments(post_id);

  CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id
    ON post_reactions(post_id);
`);

const postColumns = db.prepare('PRAGMA table_info(posts)').all();
if (!postColumns.some((column) => column.name === 'is_hidden')) {
  db.exec('ALTER TABLE posts ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0');
}

const commentColumns = db.prepare('PRAGMA table_info(comments)').all();
if (!commentColumns.some((column) => column.name === 'is_hidden')) {
  db.exec('ALTER TABLE comments ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0');
}

const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admins').get().count;

if (adminCount === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  db.prepare(`
    INSERT INTO admins (email, password_hash, name)
    VALUES (?, ?, ?)
  `).run(
    process.env.ADMIN_EMAIL,
    bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12),
    process.env.ADMIN_NAME || '관리자',
  );
}

module.exports = db;
