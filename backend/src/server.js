require('dotenv').config({ quiet: true });

const app = require('./app');
const db = require('./config/database');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
