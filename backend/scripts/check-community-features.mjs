import 'dotenv/config'

const baseUrl = `${process.env.SUPABASE_URL}/functions/v1/api`
const login = await fetch(`${baseUrl}/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
})
if (!login.ok) throw new Error(`Admin login check failed (${login.status}).`)
const { token } = await login.json()

const checks = [
  { path: '/notices/active', key: 'notices', admin: false },
  { path: '/admin/notices', key: 'notices', admin: true },
  { path: '/admin/inquiries', key: 'inquiries', admin: true },
  { path: '/admin/reports', key: 'reports', admin: true },
]

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, {
    headers: check.admin ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`${check.path} check failed (${response.status}).`)
  const data = await response.json()
  if (!Array.isArray(data[check.key])) throw new Error(`${check.path} returned an invalid response.`)
  console.log(`${check.path}: ok (${data[check.key].length})`)
}
