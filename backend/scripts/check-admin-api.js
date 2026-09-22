require('dotenv').config({ quiet: true });

const app = require('../src/app');
const db = require('../src/config/database');

const server = app.listen(0, async () => {
  const { port } = server.address();

  try {
    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      }),
    });
    const login = await loginResponse.json();

    if (!loginResponse.ok || !login.token) {
      throw new Error(login.message || 'Admin login failed');
    }

    const dashboardResponse = await fetch(`http://127.0.0.1:${port}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    const dashboard = await dashboardResponse.json();

    if (!dashboardResponse.ok) {
      throw new Error(dashboard.message || 'Admin dashboard request failed');
    }

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/admin/account`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`,
      },
      body: JSON.stringify({
        name: login.admin.name,
        email: login.admin.email,
        currentPassword: process.env.ADMIN_PASSWORD,
        newPassword: '',
      }),
    });
    const account = await accountResponse.json();

    if (!accountResponse.ok || !account.token) {
      throw new Error(account.message || 'Admin account update failed');
    }

    console.log(`Admin API connected: ${login.admin.email}`);
    console.log('Admin account update: ready');
    console.log(`Dashboard stats: users=${dashboard.stats.users}, posts=${dashboard.stats.posts}, comments=${dashboard.stats.comments}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    server.close(() => db.close());
  }
});
