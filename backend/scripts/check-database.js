require('dotenv').config({ quiet: true });

const db = require('../src/config/database');

const tables = db
  .prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `)
  .all();

console.log(`SQLite connected: ${tables.map(({ name }) => name).join(', ')}`);
db.close();
