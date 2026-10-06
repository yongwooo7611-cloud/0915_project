import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

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

const database = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const userResult = await database.from('users').select('id,email').limit(1).maybeSingle()
if (userResult.error) throw userResult.error
if (userResult.data) {
  const userToken = await new SignJWT({ id: userResult.data.id, email: userResult.data.email, role: 'user' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.USER_JWT_SECRET))
  const response = await fetch(`${baseUrl}/reports`, { headers: { Authorization: `Bearer ${userToken}` } })
  if (!response.ok) throw new Error(`/reports user check failed (${response.status}).`)
  const data = await response.json()
  if (!Array.isArray(data.reports)) throw new Error('/reports returned an invalid response.')
  console.log(`/reports (user): ok (${data.reports.length})`)
} else {
  console.log('/reports (user): skipped (no users)')
}
