import { db, assertDatabase } from '../_shared/database.ts'
import { requireSession } from '../_shared/auth.ts'
import { bodyJson, HttpError, json } from '../_shared/http.ts'
import { getSupabaseUrl, requiredEnv } from '../_shared/env.ts'
import { cleanAttachments } from './attachment-routes.ts'

const bucket = db.storage.from('service-backups')
const encoder = new TextEncoder()
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
async function rpc(name: string, args = {}) {
  const result = await db.rpc(name, args)
  assertDatabase(result.error)
  return result.data
}
async function workerToken() {
  const key = await crypto.subtle.importKey('raw', encoder.encode(requiredEnv('ADMIN_JWT_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`service-backup-worker:${getSupabaseUrl()}`))), b => b.toString(16).padStart(2, '0')).join('')
}
async function configure() {
  await rpc('configure_service_backup_worker', { p_url: `${getSupabaseUrl()}/functions/v1/api/internal/backups/tick`, p_token: await workerToken() })
}
async function upload(path: string, data: Uint8Array | string, contentType: string) {
  const result = await bucket.upload(path, data, { contentType, upsert: true })
  if (result.error) throw new Error('BACKUP_WRITE_FAILED')
}
async function files(job: string) {
  const all = []
  for (let offset = 0; ; offset += 500) {
    const result = await db.from('service_backup_files').select('*').eq('job_id', job).order('bucket').order('path').range(offset, offset + 499)
    assertDatabase(result.error)
    all.push(...result.data || [])
    if ((result.data?.length || 0) < 500) return all
  }
}
async function retention() {
  assertDatabase((await db.from('service_backup_jobs').update({ status: 'deleting' }).eq('status', 'failed').lt('completed_at', new Date(Date.now() - 7 * 86400000).toISOString())).error)
  const settings = await db.from('service_backup_settings').select('retain_count').eq('id', 1).single()
  assertDatabase(settings.error)
  const expired = await db.from('service_backup_jobs').select('id').eq('status', 'completed').order('completed_at', { ascending: false }).range(settings.data!.retain_count, settings.data!.retain_count + 29)
  assertDatabase(expired.error)
  if (expired.data?.length) assertDatabase((await db.from('service_backup_jobs').update({ status: 'deleting' }).in('id', expired.data.map(j => j.id))).error)
  const deleting = await db.from('service_backup_jobs').select('id,prefix').eq('status', 'deleting').limit(1)
  assertDatabase(deleting.error)
  for (const job of deleting.data || []) {
    const batch = await db.from('service_backup_files').select('bucket,path,destination').eq('job_id', job.id).limit(40)
    assertDatabase(batch.error)
    const paths = (batch.data || []).map(f => f.destination)
    if (paths.some(p => !p.startsWith(`${job.prefix}/storage/`))) throw new Error('INVALID_BACKUP_PREFIX')
    if (paths.length) {
      if ((await bucket.remove(paths)).error) throw new Error('BACKUP_RETENTION_FAILED')
      for (const file of batch.data!) assertDatabase((await db.from('service_backup_files').delete().eq('job_id', job.id).eq('bucket', file.bucket).eq('path', file.path)).error)
    } else {
      if ((await bucket.remove([`${job.prefix}/database.json.gz.enc`, `${job.prefix}/manifest.json`])).error) throw new Error('BACKUP_RETENTION_FAILED')
      assertDatabase((await db.from('service_backup_jobs').update({ status: 'deleted' }).eq('id', job.id).eq('status', 'deleting')).error)
      assertDatabase((await db.from('service_backup_payloads').delete().eq('job_id', job.id)).error)
    }
  }
}

export async function backupTick() {
  const token = crypto.randomUUID()
  const claimed = await rpc('claim_service_backup', { p_token: token })
  const job = claimed?.[0]
  if (!job) {
    await retention()
    await cleanAttachments()
    return
  }
  const started = Date.now()
  const update = async (values: Record<string, unknown>) => {
    const result = await db.from('service_backup_jobs').update(values).eq('id', job.id).eq('lease_token', token).select('id')
    assertDatabase(result.error)
    if (!result.data?.length) throw new Error('BACKUP_LEASE_LOST')
  }
  try {
    if (!job.snapshot_done) {
      const payload = await rpc('prepare_service_backup', { p_job: job.id, p_token: token })
      const secret = await rpc('service_backup_key')
      const keyBytes = new Uint8Array(secret.match(/.{2}/g).map((b: string) => parseInt(b, 16)))
      const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const compressed = await new Response(new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
      const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed))
      // Envelope = 12-byte IV followed by ciphertext + authentication tag.
      const envelope = new Uint8Array(12 + encrypted.length)
      envelope.set(iv); envelope.set(encrypted, 12)
      if (envelope.length > 50 * 1024 * 1024) throw new Error('BACKUP_DATABASE_TOO_LARGE')
      await upload(`${job.prefix}/database.json.gz.enc`, envelope, 'application/octet-stream')
      await update({ snapshot_done: true })
    }
    assertDatabase((await db.from('service_backup_payloads').delete().eq('job_id', job.id)).error)
    const pending = await db.from('service_backup_files').select('*').eq('job_id', job.id).eq('status', 'pending').order('bucket').order('path').limit(15)
    assertDatabase(pending.error)
    for (const file of pending.data || []) {
      if (Date.now() - started > 25000) break
      const source = await db.storage.from(file.bucket).info(file.path)
      if (source.error || Number(source.data?.size) !== Number(file.byte_size) || (file.source_version && source.data?.version !== file.source_version)) throw new Error('BACKUP_SOURCE_CHANGED')
      const copy = await db.storage.from(file.bucket).copy(file.path, file.destination, { destinationBucket: 'service-backups' })
      if (copy.error) {
        const existing = await bucket.info(file.destination)
        if (existing.error || Number(existing.data?.size) !== Number(file.byte_size)) throw new Error('BACKUP_STORAGE_COPY_FAILED')
      }
      const after = await db.storage.from(file.bucket).info(file.path)
      if (after.error || after.data?.version !== source.data?.version) throw new Error('BACKUP_SOURCE_CHANGED')
      assertDatabase((await db.from('service_backup_files').update({ status: 'copied' }).eq('job_id', job.id).eq('bucket', file.bucket).eq('path', file.path)).error)
    }
    const count = await db.from('service_backup_files').select('*', { count: 'exact', head: true }).eq('job_id', job.id).eq('status', 'pending')
    assertDatabase(count.error)
    const totals = await db.from('service_backup_jobs').select('total_files').eq('id', job.id).single()
    assertDatabase(totals.error)
    if (count.count === 0) {
      const catalog = await files(job.id)
      await upload(`${job.prefix}/manifest.json`, JSON.stringify({ format: 'bodramdbo-logical-v1', jobId: job.id, createdAt: job.created_at, completedAt: new Date().toISOString(), database: 'database.json.gz.enc', encryption: 'AES-256-GCM; first 12 bytes IV, remaining ciphertext/tag; gzip JSON', keyLocation: 'Supabase Vault: service_backup_encryption_key (export separately)', scope: 'Public tables, Auth users/identities, bucket metadata and selected Storage objects. Not a native PITR backup; source code, secrets, provider configuration and Auth sessions require separate recovery.', includeStorage: job.include_storage, files: catalog.map(f => ({ bucket: f.bucket, path: f.path, destination: f.destination, size: f.byte_size })) }, null, 2), 'application/json')
      await update({ status: 'completed', completed_at: new Date().toISOString(), processed_files: totals.data!.total_files, lease_until: null })
      await retention().catch(() => console.error('Backup retention will retry on next tick'))
    } else await update({ processed_files: totals.data!.total_files - (count.count || 0), lease_until: null })
  } catch (error) {
    console.error('Backup worker failed', job.id, error instanceof Error ? error.message : 'unknown')
    await update({ status: 'failed', error_message: error instanceof Error && /^BACKUP_[A-Z_]+$/.test(error.message) ? error.message : 'BACKUP_PROCESSING_FAILED', completed_at: new Date().toISOString(), lease_until: null })
    await db.from('service_backup_payloads').delete().eq('job_id', job.id)
  }
}

export async function backupRoutes(request: Request, path: string): Promise<Response | null> {
  if (path === '/internal/backups/tick' && request.method === 'POST') {
    const expected = `Bearer ${await workerToken()}`
    const actual = request.headers.get('authorization') || ''
    const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
    const [a, b] = await Promise.all([digest(expected), digest(actual)])
    let difference = 0
    for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i]
    if (difference) throw new HttpError(401, '인증이 필요합니다.')
    await backupTick()
    return json(request, { ok: true })
  }
  if (!path.startsWith('/admin/backups')) return null
  const admin = await requireSession(request, 'admin')
  if (path === '/admin/backups' && request.method === 'GET') {
    const [settings, jobs] = await Promise.all([
      db.from('service_backup_settings').select('*').eq('id', 1).single(),
      db.from('service_backup_jobs').select('id,status,trigger,include_storage,created_at,completed_at,total_files,processed_files,error_message').order('created_at', { ascending: false }).limit(50),
    ])
    assertDatabase(settings.error); assertDatabase(jobs.error)
    return json(request, { settings: settings.data, jobs: jobs.data })
  }
  if (path === '/admin/backups/settings' && request.method === 'PUT') {
    const body = await bodyJson(request)
    if (typeof body.enabled !== 'boolean' || typeof body.include_storage !== 'boolean' || ![1,6,12,24,168].includes(body.interval_hours) || !Number.isInteger(body.retain_count) || body.retain_count < 1 || body.retain_count > 30 || !body.next_run_at || !Number.isFinite(Date.parse(body.next_run_at))) throw new HttpError(400, '백업 주기·보관 개수·실행 시간을 확인해 주세요.')
    await configure()
    assertDatabase((await db.from('service_backup_settings').update({ enabled: body.enabled, include_storage: body.include_storage, interval_hours: body.interval_hours, retain_count: body.retain_count, next_run_at: new Date(body.next_run_at).toISOString(), updated_at: new Date().toISOString() }).eq('id', 1)).error)
    return json(request, { message: '백업 설정을 저장했습니다.' })
  }
  if (path === '/admin/backups/setup' && request.method === 'POST') {
    await configure()
    return json(request, { message: '예약 백업 작업을 등록했습니다.' })
  }
  if (path === '/admin/backups' && request.method === 'POST') {
    await configure()
    const result = await db.rpc('queue_service_backup', { p_admin: admin.id })
    if (result.error?.message.includes('BACKUP_IN_PROGRESS')) throw new HttpError(409, '이미 백업이 진행 중입니다.')
    assertDatabase(result.error)
    return json(request, { id: result.data, message: '백업을 예약했습니다. 1분 이내에 시작합니다.' }, 202)
  }
  const download = path.match(/^\/admin\/backups\/([^/]+)\/downloads$/)
  if (download && request.method === 'GET') {
    if (!uuid.test(download[1])) throw new HttpError(400, '잘못된 백업 ID입니다.')
    const job = await db.from('service_backup_jobs').select('id,prefix,status').eq('id', download[1]).maybeSingle()
    assertDatabase(job.error)
    if (!job.data || job.data.status !== 'completed') throw new HttpError(404, '완료된 백업이 없습니다.')
    const paths = [`${job.data.prefix}/database.json.gz.enc`, `${job.data.prefix}/manifest.json`]
    const signed = await bucket.createSignedUrls(paths, 60, { download: true })
    if (signed.error) throw new HttpError(503, '다운로드 링크를 만들지 못했습니다.')
    return json(request, { downloads: signed.data.map((f, i) => ({ name: i === 0 ? '암호화 DB 백업' : '파일 목록·복구 안내', url: f.signedUrl })) })
  }
  return null
}
