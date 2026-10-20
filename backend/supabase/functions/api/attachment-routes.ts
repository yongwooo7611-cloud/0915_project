import { db, assertDatabase } from '../_shared/database.ts'
import { requireSession } from '../_shared/auth.ts'
import { bodyJson, HttpError, json } from '../_shared/http.ts'

const BUCKET = 'post-attachments'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const types: Record<string, { mime: string; max: number }> = {
  jpg: { mime: 'image/jpeg', max: 10 }, jpeg: { mime: 'image/jpeg', max: 10 },
  png: { mime: 'image/png', max: 10 }, gif: { mime: 'image/gif', max: 10 }, webp: { mime: 'image/webp', max: 10 },
  mp4: { mime: 'video/mp4', max: 50 }, webm: { mime: 'video/webm', max: 50 }, mov: { mime: 'video/quicktime', max: 50 },
  pdf: { mime: 'application/pdf', max: 10 }, txt: { mime: 'text/plain', max: 10 }, zip: { mime: 'application/zip', max: 10 },
}

export function fileSpecification(name: string, size: number) {
  const extension = name.split('.').at(-1)?.toLowerCase() || ''
  const type = types[extension]
  if (!name || name.length > 180 || /[\x00-\x1f/\\]/.test(name) || !type) throw new HttpError(400, '지원하지 않는 파일입니다. 이미지, MP4·WebM·MOV, PDF·TXT·ZIP을 선택해 주세요.')
  if (!Number.isSafeInteger(size) || size < 1 || size > type.max * 1024 * 1024) throw new HttpError(400, `이 파일은 최대 ${type.max}MB까지 첨부할 수 있습니다.`)
  return { ...type, extension }
}

export function validFileHeader(mime: string, bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes)
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (mime === 'image/png') return [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)
  if (mime === 'image/gif') return /^GIF8[79]a/.test(text)
  if (mime === 'image/webp') return text.startsWith('RIFF') && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP'
  if (mime === 'video/mp4' || mime === 'video/quicktime') return new TextDecoder().decode(bytes.slice(4,8)) === 'ftyp'
  if (mime === 'video/webm') return [26,69,223,163].every((b,i) => bytes[i] === b)
  if (mime === 'application/pdf') return text.startsWith('%PDF-')
  if (mime === 'application/zip') return bytes[0] === 80 && bytes[1] === 75 && [3,5,7].includes(bytes[2])
  if (mime === 'text/plain') return !bytes.includes(0)
  return false
}

export function attachmentIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10 || value.some((id) => typeof id !== 'string' || !UUID.test(id)) || new Set(value).size !== value.length) throw new HttpError(400, '첨부파일은 최대 10개까지 등록할 수 있습니다.')
  return value
}

export async function cleanAttachments() {
  // Keep quota metadata, but remove abandoned objects after 24 hours.
  const expired = await db.from('post_attachments').select('id').is('post_id', null).neq('status', 'deleted')
    .lt('created_at', new Date(Date.now() - 86400000).toISOString()).limit(50)
  assertDatabase(expired.error)
  if (expired.data?.length) {
    const result = await db.from('post_attachments').update({ status: 'deleted' }).in('id', expired.data.map((row) => row.id)).is('post_id', null)
    assertDatabase(result.error)
  }
  const queued = await db.from('attachment_deletion_queue').select('storage_path').lte('not_before', new Date().toISOString()).order('created_at').limit(50)
  assertDatabase(queued.error)
  if (!queued.data?.length) return
  const paths = queued.data.map((row) => row.storage_path)
  const removed = await db.storage.from(BUCKET).remove(paths)
  if (removed.error) { console.error('Attachment cleanup pending:', removed.error.message); return }
  const cleared = await db.from('attachment_deletion_queue').delete().in('storage_path', paths)
  assertDatabase(cleared.error)
}

export async function postAttachments(postId: number) {
  const result = await db.from('post_attachments').select('id,original_name,mime_type,byte_size,storage_path').eq('post_id', postId).eq('status', 'ready').order('created_at')
  assertDatabase(result.error)
  return Promise.all((result.data || []).map(async (file) => {
    const [preview, download] = await Promise.all([
      db.storage.from(BUCKET).createSignedUrl(file.storage_path, 300),
      db.storage.from(BUCKET).createSignedUrl(file.storage_path, 300, { download: file.original_name }),
    ])
    assertDatabase(preview.error); assertDatabase(download.error)
    return { id: file.id, name: file.original_name, mime: file.mime_type, size: file.byte_size, url: preview.data!.signedUrl, downloadUrl: download.data!.signedUrl }
  }))
}

export async function savePost(userId: number, postId: number | null, input: { category: string; title: string; content: string }, ids: string[]) {
  const saved = await db.rpc('save_post_with_attachments', {
    p_user_id: userId, p_post_id: postId, p_category: input.category, p_title: input.title, p_content: input.content, p_attachment_ids: ids,
  })
  const message = saved.error?.message || ''
  if (message.includes('POST_FORBIDDEN')) throw new HttpError(403, '작성자만 게시글을 수정할 수 있습니다.')
  if (message.includes('POST_NOT_FOUND')) throw new HttpError(404, '게시글을 찾을 수 없습니다.')
  if (message.includes('INVALID_ATTACHMENTS')) throw new HttpError(400, '첨부파일 소유권 또는 업로드 완료 상태를 확인해 주세요.')
  if (message.includes('ATTACHMENT_LIMIT') || message.includes('POST_SIZE_LIMIT')) throw new HttpError(400, '파일은 최대 10개, 전체 200MB까지 첨부할 수 있습니다.')
  assertDatabase(saved.error)
  await cleanAttachments().catch((error) => console.error('Deferred attachment cleanup:', error.message))
  return saved.data
}

export async function attachmentRoutes(request: Request, path: string): Promise<Response | null> {
  if (path === '/attachments/uploads' && request.method === 'POST') {
    const user = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const name = String(body.name || '').trim()
    const size = Number(body.size)
    const spec = fileSpecification(name, size)
    await cleanAttachments()
    const id = crypto.randomUUID()
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '/')
    const storagePath = `${date}/user-${user.id}/${id}/original.${spec.extension}`
    const reserved = await db.rpc('reserve_post_attachment', { p_user_id: user.id, p_id: id, p_path: storagePath, p_name: name, p_mime: spec.mime, p_size: size })
    if (reserved.error?.message.includes('UPLOAD_LIMIT')) throw new HttpError(429, '업로드 한도를 초과했습니다. 미사용 첨부를 삭제하거나 잠시 후 다시 시도해 주세요. (24시간 500MB)')
    assertDatabase(reserved.error)
    const signed = await db.storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false })
    assertDatabase(signed.error)
    return json(request, { id, bucket: BUCKET, path: storagePath, token: signed.data!.token, mime: spec.mime }, 201)
  }

  const match = path.match(/^\/attachments\/([0-9a-f-]{36})(\/complete)?$/i)
  if (!match || !UUID.test(match[1]) || !['POST', 'DELETE'].includes(request.method)) return null
  const user = await requireSession(request, 'user')
  const found = await db.from('post_attachments').select('*').eq('id', match[1]).eq('user_id', user.id).maybeSingle()
  assertDatabase(found.error)
  const file = found.data
  if (!file || file.status === 'deleted') throw new HttpError(404, '첨부파일을 찾을 수 없습니다.')
  if (request.method === 'DELETE' && !match[2]) {
    if (file.post_id) throw new HttpError(409, '게시글에 연결된 파일은 게시글 수정에서 삭제해 주세요.')
    const removed = await db.from('post_attachments').update({ status: 'deleted' }).eq('id', file.id).is('post_id', null)
    assertDatabase(removed.error)
    await cleanAttachments()
    return json(request, { message: '첨부파일을 삭제했습니다.' })
  }
  if (request.method !== 'POST' || match[2] !== '/complete') return null
  if (file.status === 'ready') return json(request, { attachment: { id: file.id, name: file.original_name, mime: file.mime_type, size: file.byte_size } })
  const info = await db.storage.from(BUCKET).info(file.storage_path)
  if (info.error || !info.data) throw new HttpError(409, '파일 업로드가 완료되지 않았습니다. 다시 시도해 주세요.')
  if (Number(info.data.size) !== Number(file.byte_size) || info.data.contentType?.split(';')[0] !== file.mime_type) throw new HttpError(400, '업로드한 파일의 크기 또는 형식이 등록 정보와 다릅니다.')
  const signed = await db.storage.from(BUCKET).createSignedUrl(file.storage_path, 60)
  assertDatabase(signed.error)
  const response = await fetch(signed.data!.signedUrl, { headers: { Range: 'bytes=0-511' }, signal: AbortSignal.timeout(10000) })
  if (!response.ok || !response.body) throw new HttpError(502, '파일 형식을 확인하지 못했습니다.')
  const reader = response.body.getReader()
  const chunks: number[] = []
  try {
    while (chunks.length < 512) { const part = await reader.read(); if (part.done) break; chunks.push(...part.value.slice(0, 512 - chunks.length)) }
  } finally { await reader.cancel() }
  if (!validFileHeader(file.mime_type, new Uint8Array(chunks))) throw new HttpError(400, '실제 파일 형식이 확장자와 일치하지 않습니다.')
  const completed = await db.from('post_attachments').update({ status: 'ready' }).eq('id', file.id).eq('status', 'pending').select('id').maybeSingle()
  assertDatabase(completed.error)
  if (!completed.data) throw new HttpError(409, '첨부 상태가 변경됐습니다. 다시 업로드해 주세요.')
  return json(request, { attachment: { id: file.id, name: file.original_name, mime: file.mime_type, size: file.byte_size } })
}
