// Explicit operator-only export. Never run this in a browser or commit its output.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { createDecipheriv } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

const [jobId, output] = process.argv.slice(2)
if (!/^[a-f0-9-]{36}$/i.test(jobId || '') || !output) throw new Error('Usage: node scripts/export-backup.mjs <job-id> <new-private-output-directory>')
const root = resolve(output)
// Refuse existing directories to avoid silently overwriting a previous export.
await mkdir(root, { recursive: false, mode: 0o700 })
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const job = await db.from('service_backup_jobs').select('prefix,status').eq('id', jobId).single()
if (job.error || job.data.status !== 'completed') throw new Error('A completed backup is required')
async function download(path) {
  const result = await db.storage.from('service-backups').download(path)
  if (result.error) throw result.error
  return Buffer.from(await result.data.arrayBuffer())
}
const envelope = await download(`${job.data.prefix}/database.json.gz.enc`)
const secret = await db.rpc('service_backup_key')
if (secret.error) throw secret.error
const key = Buffer.from(secret.data, 'hex')
const decipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(0, 12))
decipher.setAuthTag(envelope.subarray(-16))
const payload = gunzipSync(Buffer.concat([decipher.update(envelope.subarray(12, -16)), decipher.final()]))
JSON.parse(payload.toString()) // Verify the export before saving it.
await writeFile(resolve(root, 'database.json'), payload, { mode: 0o600, flag: 'wx' })
await writeFile(resolve(root, 'database.json.gz.enc'), envelope, { mode: 0o600, flag: 'wx' })
await writeFile(resolve(root, 'encryption-key.txt'), key.toString('hex'), { mode: 0o600, flag: 'wx' })
const manifest = await download(`${job.data.prefix}/manifest.json`)
await writeFile(resolve(root, 'manifest.json'), manifest, { mode: 0o600, flag: 'wx' })
let count = 0
for (const file of JSON.parse(manifest).files) {
  // Storage names are user-controlled: never trust them as local filesystem paths.
  if (!file.destination.startsWith(`${job.data.prefix}/storage/`)) throw new Error('Invalid backup path')
  const target = resolve(root, 'objects', String(count).padStart(8, '0'))
  if (!target.startsWith(root + sep)) throw new Error('Invalid export path')
  await mkdir(resolve(root, 'objects'), { recursive: true, mode: 0o700 })
  const bytes = await download(file.destination)
  if (bytes.length !== Number(file.size)) throw new Error('Backup object size mismatch')
  await writeFile(target, bytes, { mode: 0o600, flag: 'wx' })
  count++
}
await writeFile(resolve(root, 'object-map.json'), JSON.stringify(JSON.parse(manifest).files.map((file, index) => ({ file: `objects/${String(index).padStart(8, '0')}`, bucket: file.bucket, path: file.path })), null, 2), { mode: 0o600, flag: 'wx' })
console.log(`Export verified: database and ${count} Storage objects. Contains private user data and encryption key; keep offline and out of Git.`)
