require('dotenv').config({ quiet: true });

const bcrypt = require('bcryptjs');
const db = require('../src/config/database');

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');
const name = String(process.env.ADMIN_NAME || '관리자').trim();

if (!email || !password) {
  console.error('ADMIN_EMAIL과 ADMIN_PASSWORD를 .env에 입력해 주세요.');
  db.close();
  process.exit(1);
}

if (password.length < 8) {
  console.error('ADMIN_PASSWORD는 8자 이상이어야 합니다.');
  db.close();
  process.exit(1);
}

const existing = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
const passwordHash = existing && bcrypt.compareSync(password, existing.password_hash)
  ? existing.password_hash
  : bcrypt.hashSync(password, 12);

db.prepare(`
  INSERT INTO admins (email, password_hash, name)
  VALUES (?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET
    password_hash = excluded.password_hash,
    name = excluded.name,
    updated_at = CURRENT_TIMESTAMP
`).run(email, passwordHash, name);

console.log(`관리자 계정이 데이터베이스에 ${existing ? '갱신' : '등록'}되었습니다.`);
db.close();
