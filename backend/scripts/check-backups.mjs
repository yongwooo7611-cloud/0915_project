import 'dotenv/config'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { createHmac, createDecipheriv, randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const base = `${process.env.SUPABASE_URL}/functions/v1/api`
const admin = await db.from('admins').select('id,email').limit(1).single()
assert.ifError(admin.error)
const token = await new SignJWT({ ...admin.data, role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.ADMIN_JWT_SECRET))
const machine = createHmac('sha256', process.env.ADMIN_JWT_SECRET).update(`service-backup-worker:${process.env.SUPABASE_URL}`).digest('hex')
async function call(path, method = 'GET', body, expected = 200, auth = token) {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: ${data.message || ''}`)
  return data
}
await call('/admin/backups', 'GET', undefined, 401, '')
await call('/internal/backups/tick', 'POST', {}, 401, '')
const users = await db.from('users').select('id,email').limit(1)
if (users.data?.length) {
  const user = await new SignJWT({ ...users.data[0], role: 'user' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(process.env.USER_JWT_SECRET))
  await call('/admin/backups', 'GET', undefined, 401, user)
}
await call('/admin/backups/setup', 'POST', {})
const before = await call('/admin/backups')
await call('/admin/backups/settings', 'PUT', { ...before.settings, retain_count: 0 }, 400)
await call('/admin/backups/settings', 'PUT', before.settings)
const fixture = `2099/01/01/backup-check/${randomUUID()}/original.txt`
const sample = 'Bodramdbo backup integrity verification'
const inserted = await db.storage.from('post-attachments').upload(fixture, sample, { contentType: 'text/plain' })
assert.ifError(inserted.error)
try {
  const result = await call('/admin/backups', 'POST', {}, 202)
  await call('/admin/backups', 'POST', {}, 409)
  let job
  for (let i = 0; i < 30; i++) {
    await call('/internal/backups/tick', 'POST', {}, 200, machine)
    job = (await call('/admin/backups')).jobs.find(j => j.id === result.id)
    if (['completed','failed'].includes(job?.status)) break
  }
  assert.equal(job.status, 'completed', `Backup failed: ${job.error_message || job.status}`)
  const links = await call(`/admin/backups/${job.id}/downloads`)
  const envelope = Buffer.from(await (await fetch(links.downloads[0].url)).arrayBuffer())
  assert.notEqual(envelope[0], '{'.charCodeAt(0), 'DB must be encrypted')
  const key = await db.rpc('service_backup_key')
  assert.ifError(key.error)
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key.data, 'hex'), envelope.subarray(0,12))
  decipher.setAuthTag(envelope.subarray(-16))
  const payload = JSON.parse(gunzipSync(Buffer.concat([decipher.update(envelope.subarray(12,-16)), decipher.final()])))
  assert.ok(Array.isArray(payload.public.users))
  assert.ok(Array.isArray(payload.auth.users))
  const manifest = await (await fetch(links.downloads[1].url)).json()
  const item = manifest.files.find(f => f.path === fixture && f.bucket === 'post-attachments')
  assert.ok(item, 'Storage fixture must be included')
  assert.ok(!manifest.files.some(f => f.bucket === 'service-backups'), 'Must not recursively back up backups')
  const copy = await db.storage.from('service-backups').download(item.destination)
  assert.ifError(copy.error)
  assert.equal(await copy.data.text(), sample)
  const direct = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/service-backups/${item.destination}`)
  assert.notEqual(direct.status, 200)
  const exposed = await createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY).rpc('service_backup_key')
  assert.ok(exposed.error, 'Anonymous users must not access encryption keys')
  console.log(`Backup E2E passed: admin-only access, scheduler setup, duplicate prevention, encrypted DB decryption, Storage copy integrity, private bucket. Initial backup: ${job.id}`)
} finally {
  const removed = await db.storage.from('post-attachments').remove([fixture])
  assert.ifError(removed.error)
}
