const express = require('express');
const db = require('./config/database');
const adminRouter = require('./routes/admin');
const authRouter = require('./routes/auth');
const postsRouter = require('./routes/posts');

const app = express();

app.locals.db = db;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/admin', adminRouter);
app.use('/api/auth', authRouter);
app.use('/api/posts', postsRouter);

app.get('/', (req, res) => {
  res.json({ message: 'Express server is running.' });
});

app.get('/api/health', (req, res) => {
  const database = db.prepare('SELECT 1 AS connected').get();

  res.status(200).json({
    status: 'ok',
    database: database.connected === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error.' });
});

module.exports = app;
