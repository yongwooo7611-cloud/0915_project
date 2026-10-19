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
  { path: '/admin/payments', key: 'payments', admin: true },
]

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, {
    headers: check.admin ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`${check.path} check failed (${response.status}).`)
  const data = await response.json()
  if (!Array.isArray(data[check.key])) throw new Error(`${check.path} returned an invalid response.`)
  if (check.path === '/admin/payments' && !Array.isArray(data.subscriptions)) {
    throw new Error('/admin/payments returned an invalid subscriptions response.')
  }
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

  const paymentHistory = await fetch(`${baseUrl}/payments/history`, { headers: { Authorization: `Bearer ${userToken}` } })
  if (!paymentHistory.ok) throw new Error(`/payments/history user check failed (${paymentHistory.status}).`)
  const paymentData = await paymentHistory.json()
  if (!Array.isArray(paymentData.payments) || !Array.isArray(paymentData.creditTransactions)) {
    throw new Error('/payments/history returned an invalid response.')
  }
  console.log(`/payments/history (user): ok (${paymentData.payments.length} payments, ${paymentData.creditTransactions.length} credit transactions)`)

  const invalidSubscriptionOrder = await fetch(`${baseUrl}/payments/subscriptions/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId: 'invalid-plan' }),
  })
  if (invalidSubscriptionOrder.status !== 400) {
    throw new Error(`/payments/subscriptions/orders validation check failed (${invalidSubscriptionOrder.status}).`)
  }
  console.log('/payments/subscriptions/orders validation: ok')
} else {
  console.log('/reports (user): skipped (no users)')
}
