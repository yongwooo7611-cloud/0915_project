import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const base = `${process.env.SUPABASE_URL}/functions/v1/api`
const users = await db.from('users').select('id,email').limit(2)
if (users.error || !users.data?.length) throw new Error('An existing test user is required')
const token = await new SignJWT({ ...users.data[0], role: 'user' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.USER_JWT_SECRET))
async function call(path, method = 'GET', body, expected = 200, auth = token) {
 const response = await fetch(base + path, { method, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
 const data = await response.json()
 assert.equal(response.status, expected, `${method} ${path}: ${data.message || ''}`)
 return data
}
let postId
const reserved = []
try {
 await call('/attachments/uploads', 'POST', { name: 'blocked.html', size: 10 }, 401, '')
 await call('/attachments/uploads', 'POST', { name: 'blocked.html', size: 10 }, 400)
 await call('/attachments/uploads', 'POST', { name: '../escape.png', size: 10 }, 400)
 await call('/attachments/uploads', 'POST', { name: 'large.jpg', size: 11 * 1024 * 1024 }, 400)
 const bytes = await readFile(new URL('../../frontend/public/branding/moa-kakao-app-icon.png', import.meta.url))
 const upload = await call('/attachments/uploads', 'POST', { name: '자동검증.png', size: bytes.length }, 201)
 reserved.push(upload)
 assert.match(upload.path, /^\d{4}\/\d{2}\/\d{2}\/user-\d+\/[a-f0-9-]+\/original\.png$/)
 await call(`/attachments/${upload.id}/complete`, 'POST', undefined, 409)
 const stored = await db.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, bytes, { contentType: upload.mime })
 if (stored.error) throw stored.error
 const complete = await call(`/attachments/${upload.id}/complete`, 'POST')
 assert.equal(complete.attachment.id, upload.id)
 const post = await call('/posts', 'POST', { category: '자유', title: '[자동검증] 첨부 테스트', content: '첨부 검증용 임시 게시글입니다.', attachmentIds: [upload.id] }, 201)
 postId = post.id
 const visible = await call(`/posts/${postId}`)
 assert.equal(visible.post.attachments.length, 1)
 const signed = await fetch(visible.post.attachments[0].url)
 assert.equal(signed.status, 200)
 assert.equal((await signed.arrayBuffer()).byteLength, bytes.length)
 const direct = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/${upload.bucket}/${upload.path}`)
 assert.notEqual(direct.status, 200, 'Bucket must stay private')
 await call(`/attachments/${upload.id}`, 'DELETE', undefined, 409)
 if (users.data[1]) {
   const other = await new SignJWT({ ...users.data[1], role: 'user' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(process.env.USER_JWT_SECRET))
   await call(`/attachments/${upload.id}/complete`, 'POST', undefined, 404, other)
   await call('/posts', 'POST', { category: '자유', title: '소유권 검증', content: '거절돼야 함', attachmentIds: [upload.id] }, 400, other)
 }
 await db.from('posts').update({ is_hidden: true }).eq('id', postId)
 await call(`/posts/${postId}`, 'GET', undefined, 404)
 await call(`/posts/${postId}`, 'PUT', { category: '자유', title: '[자동검증] 첨부 제거', content: '검증 완료', attachmentIds: [] })
 const row = await db.from('post_attachments').select('status').eq('id', upload.id).single()
 assert.equal(row.data.status, 'deleted')
 console.log('Attachment E2E passed: signed upload, signature/size, private bucket, ownership, post save, hidden access, removal.')
} finally {
 if (postId) await db.from('posts').delete().eq('id', postId)
 // These exact objects were created by this script; remove test fixtures only.
 for (const file of reserved) {
   await db.storage.from(file.bucket).remove([file.path])
   await db.from('post_attachments').delete().eq('id', file.id)
   await db.from('attachment_deletion_queue').delete().eq('storage_path', file.path)
 }
}
