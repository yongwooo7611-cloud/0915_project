import bcrypt from 'bcryptjs'
import { db, assertDatabase } from '../_shared/database.ts'
import { requireSession, signSession } from '../_shared/auth.ts'
import { bodyJson, HttpError, json, positiveId } from '../_shared/http.ts'

type AdminRow = { id: number; email: string; password_hash: string; name: string }

function publicAdmin(admin: AdminRow) {
  return { id: admin.id, email: admin.email, name: admin.name, role: 'admin' as const }
}

async function count(table: string): Promise<number> {
  const result = await db.from(table).select('*', { count: 'exact', head: true })
  assertDatabase(result.error)
  return result.count || 0
}

export async function adminRoutes(request: Request, path: string): Promise<Response | null> {
  if (request.method === 'POST' && path === '/admin/login') {
    const body = await bodyJson(request)
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const { data, error } = await db.from('admins').select('*').eq('email', email).maybeSingle()
    assertDatabase(error)
    const record = data as AdminRow | null
    if (!record || !(await bcrypt.compare(password, record.password_hash))) {
      throw new HttpError(401, '이메일 또는 비밀번호가 올바르지 않습니다.')
    }
    const admin = publicAdmin(record)
    return json(request, { token: await signSession(admin), admin })
  }

  if (!path.startsWith('/admin/')) return null
  const session = await requireSession(request, 'admin')

  if (request.method === 'PUT' && path === '/admin/account') {
    const body = await bodyJson(request)
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const currentPassword = String(body.currentPassword || '')
    const newPassword = String(body.newPassword || '')
    const found = await db.from('admins').select('*').eq('id', session.id).maybeSingle()
    assertDatabase(found.error)
    const record = found.data as AdminRow | null
    if (!record || !(await bcrypt.compare(currentPassword, record.password_hash))) throw new HttpError(401, '현재 비밀번호가 올바르지 않습니다.')
    if (!name || !email) throw new HttpError(400, '이름과 이메일을 입력해 주세요.')
    if (newPassword && newPassword.length < 8) throw new HttpError(400, '새 비밀번호는 8자 이상이어야 합니다.')
    const password_hash = newPassword ? await bcrypt.hash(newPassword, 12) : record.password_hash
    const updated = await db.from('admins').update({ name, email, password_hash }).eq('id', record.id).select('*').single()
    if (updated.error?.code === '23505') throw new HttpError(409, '이미 사용 중인 이메일입니다.')
    assertDatabase(updated.error)
    const admin = publicAdmin(updated.data as AdminRow)
    return json(request, { message: '관리자 계정 정보를 변경했습니다.', admin, token: await signSession(admin) })
  }

  if (request.method === 'GET' && path === '/admin/dashboard') {
    const [users, posts, comments, viewRows, recent] = await Promise.all([
      count('users'), count('posts'), count('comments'),
      db.from('posts').select('view_count'),
      db.from('post_summaries').select('id,title,category,created_at,is_hidden,author').order('created_at', { ascending: false }).limit(5),
    ])
    assertDatabase(viewRows.error); assertDatabase(recent.error)
    const views = (viewRows.data || []).reduce((sum, post) => sum + post.view_count, 0)
    return json(request, { admin: session, stats: { users, posts, comments, views }, recentPosts: recent.data || [] })
  }

  if (request.method === 'GET' && path === '/admin/users') {
    const [usersResult, adminsResult] = await Promise.all([
      db.from('user_details').select('id,email,name,nickname,profile_id,created_at,updated_at'),
      db.from('admins').select('id,email,name,created_at,updated_at'),
    ])
    assertDatabase(usersResult.error); assertDatabase(adminsResult.error)

    const users = [
      ...(usersResult.data || []).map((user) => ({ ...user, role: 'user' as const })),
      ...(adminsResult.data || []).map((admin) => ({ ...admin, nickname: null, profile_id: null, role: 'admin' as const })),
    ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())

    return json(request, { users })
  }

  if (request.method === 'GET' && path === '/admin/posts') {
    const result = await db.from('post_summaries').select('id,title,category,content,view_count,is_hidden,created_at,updated_at,user_id,author,author_email,comment_count').order('created_at', { ascending: false })
    assertDatabase(result.error)
    return json(request, { posts: result.data || [] })
  }

  if (request.method === 'GET' && path === '/admin/comments') {
    const result = await db.from('comment_details').select('*').order('created_at', { ascending: false })
    assertDatabase(result.error)
    return json(request, { comments: result.data || [] })
  }

  const postVisibility = path.match(/^\/admin\/posts\/(\d+)\/visibility$/)
  if (request.method === 'PATCH' && postVisibility) {
    const postId = positiveId(postVisibility[1]); const body = await bodyJson(request); const hidden = body.hidden === true
    const result = await db.from('posts').update({ is_hidden: hidden }).eq('id', postId).select('id').maybeSingle()
    assertDatabase(result.error)
    if (!result.data) throw new HttpError(404, '게시글을 찾을 수 없습니다.')
    return json(request, { message: hidden ? '게시글을 숨겼습니다.' : '게시글을 공개했습니다.' })
  }

  const postDelete = path.match(/^\/admin\/posts\/(\d+)$/)
  if (request.method === 'DELETE' && postDelete) {
    const result = await db.from('posts').delete().eq('id', positiveId(postDelete[1])).select('id').maybeSingle()
    assertDatabase(result.error)
    if (!result.data) throw new HttpError(404, '게시글을 찾을 수 없습니다.')
    return json(request, { message: '게시글을 삭제했습니다.' })
  }

  const commentVisibility = path.match(/^\/admin\/comments\/(\d+)\/visibility$/)
  if (request.method === 'PATCH' && commentVisibility) {
    const commentId = positiveId(commentVisibility[1]); const body = await bodyJson(request); const hidden = body.hidden === true
    const result = await db.from('comments').update({ is_hidden: hidden }).eq('id', commentId).select('id').maybeSingle()
    assertDatabase(result.error)
    if (!result.data) throw new HttpError(404, '댓글을 찾을 수 없습니다.')
    return json(request, { message: hidden ? '댓글을 숨겼습니다.' : '댓글을 공개했습니다.' })
  }

  const commentDelete = path.match(/^\/admin\/comments\/(\d+)$/)
  if (request.method === 'DELETE' && commentDelete) {
    const result = await db.from('comments').delete().eq('id', positiveId(commentDelete[1])).select('id').maybeSingle()
    assertDatabase(result.error)
    if (!result.data) throw new HttpError(404, '댓글을 찾을 수 없습니다.')
    return json(request, { message: '댓글을 삭제했습니다.' })
  }

  return null
}
