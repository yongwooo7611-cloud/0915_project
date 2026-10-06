import bcrypt from 'bcryptjs'
import { auth, db, assertDatabase } from '../_shared/database.ts'
import { requireSession, signSession } from '../_shared/auth.ts'
import { bodyJson, HttpError, json, positiveId } from '../_shared/http.ts'

type AdminRow = { id: number; auth_user_id: string; email: string; password_hash: string; name: string }

function publicAdmin(admin: AdminRow) {
  return { id: admin.id, email: admin.email, name: admin.name, role: 'admin' as const }
}

export async function adminRoutes(request: Request, path: string): Promise<Response | null> {
  if (request.method === 'POST' && path === '/admin/login') {
    const body = await bodyJson(request)
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const signedIn = await auth.auth.signInWithPassword({ email, password })
    if (signedIn.error || !signedIn.data.user) throw new HttpError(401, '이메일 또는 비밀번호가 올바르지 않습니다.')
    const { data, error } = await db.from('admins').select('*').eq('auth_user_id', signedIn.data.user.id).maybeSingle()
    assertDatabase(error)
    const record = data as AdminRow | null
    if (!record) throw new HttpError(403, '관리자 권한이 없는 계정입니다.')
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
    if (!record?.auth_user_id) throw new HttpError(409, 'Supabase Auth에 연결되지 않은 관리자 계정입니다.')
    const verified = await auth.auth.signInWithPassword({ email: record.email, password: currentPassword })
    if (verified.error || verified.data.user?.id !== record.auth_user_id) throw new HttpError(401, '현재 비밀번호가 올바르지 않습니다.')
    if (!name || !email) throw new HttpError(400, '이름과 이메일을 입력해 주세요.')
    if (newPassword && newPassword.length < 8) throw new HttpError(400, '새 비밀번호는 8자 이상이어야 합니다.')
    const duplicate = await db.from('admins').select('id').eq('email', email).neq('id', record.id).limit(1)
    assertDatabase(duplicate.error)
    if (duplicate.data?.length) throw new HttpError(409, '이미 사용 중인 이메일입니다.')

    const authUpdate = await db.auth.admin.updateUserById(record.auth_user_id, {
      email,
      ...(newPassword ? { password: newPassword } : {}),
      email_confirm: true,
      user_metadata: { name, role: 'admin' },
      app_metadata: { role: 'admin' },
    })
    if (authUpdate.error) {
      if (authUpdate.error.message.toLowerCase().includes('already')) throw new HttpError(409, '이미 사용 중인 이메일입니다.')
      throw new Error('Supabase 관리자 계정 정보를 변경하지 못했습니다.')
    }
    const password_hash = newPassword ? await bcrypt.hash(newPassword, 12) : record.password_hash
    const updated = await db.from('admins').update({ name, email, password_hash }).eq('id', record.id).select('*').single()
    if (updated.error?.code === '23505') throw new HttpError(409, '이미 사용 중인 이메일입니다.')
    assertDatabase(updated.error)
    const admin = publicAdmin(updated.data as AdminRow)
    return json(request, { message: '관리자 계정 정보를 변경했습니다.', admin, token: await signSession(admin, session.exp) })
  }

  if (request.method === 'GET' && path === '/admin/dashboard') {
    const [metrics, recent] = await Promise.all([
      db.rpc('get_admin_dashboard_metrics'),
      db.from('post_summaries').select('id,title,category,created_at,is_hidden,author,view_count,comment_count').order('created_at', { ascending: false }).limit(5),
    ])
    assertDatabase(metrics.error); assertDatabase(recent.error)
    return json(request, {
      admin: session,
      ...(metrics.data as Record<string, unknown>),
      recentPosts: recent.data || [],
      generatedAt: new Date().toISOString(),
    })
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

  if (request.method === 'GET' && path === '/admin/notices') {
    const result = await db.from('notice_details').select('*').order('created_at', { ascending: false })
    assertDatabase(result.error)
    return json(request, { notices: result.data || [] })
  }

  if (request.method === 'POST' && path === '/admin/notices') {
    const body = await bodyJson(request)
    const title = String(body.title || '').trim()
    const content = String(body.content || '').trim()
    if (!title || !content) throw new HttpError(400, '공지 제목과 내용을 입력해 주세요.')
    if (title.length > 120 || content.length > 5000) throw new HttpError(400, '공지 제목은 120자, 내용은 5,000자 이하로 입력해 주세요.')
    const result = await db.from('notices').insert({ admin_id: session.id, title, content, is_active: body.isActive !== false })
      .select('*').single()
    assertDatabase(result.error)
    return json(request, { notice: result.data }, 201)
  }

  const noticeMatch = path.match(/^\/admin\/notices\/(\d+)$/)
  if (noticeMatch && request.method === 'PATCH') {
    const noticeId = positiveId(noticeMatch[1])
    const body = await bodyJson(request)
    const updates: Record<string, unknown> = {}
    if ('title' in body) updates.title = String(body.title || '').trim()
    if ('content' in body) updates.content = String(body.content || '').trim()
    if ('isActive' in body) updates.is_active = body.isActive === true
    if ((updates.title !== undefined && !updates.title) || (updates.content !== undefined && !updates.content)) throw new HttpError(400, '공지 제목과 내용을 비워둘 수 없습니다.')
    const result = await db.from('notices').update(updates).eq('id', noticeId).select('*').maybeSingle()
    assertDatabase(result.error)
    if (!result.data) throw new HttpError(404, '공지사항을 찾을 수 없습니다.')
    return json(request, { notice: result.data })
  }
  if (noticeMatch && request.method === 'DELETE') {
    const result = await db.from('notices').delete().eq('id', positiveId(noticeMatch[1])).select('id').maybeSingle()
    assertDatabase(result.error)
    if (!result.data) throw new HttpError(404, '공지사항을 찾을 수 없습니다.')
    return json(request, { message: '공지사항을 삭제했습니다.' })
  }

  if (request.method === 'GET' && path === '/admin/inquiries') {
    const result = await db.from('inquiry_details').select('*').order('created_at', { ascending: false })
    assertDatabase(result.error)
    return json(request, { inquiries: result.data || [] })
  }

  const inquiryMatch = path.match(/^\/admin\/inquiries\/(\d+)$/)
  if (inquiryMatch && request.method === 'PATCH') {
    const inquiryId = positiveId(inquiryMatch[1])
    const body = await bodyJson(request)
    const status = String(body.status || 'answered')
    const answer = String(body.answer || '').trim()
    if (!['answered', 'closed'].includes(status)) throw new HttpError(400, '문의 처리 상태가 올바르지 않습니다.')
    if (status === 'answered' && !answer) throw new HttpError(400, '답변 내용을 입력해 주세요.')
    if (answer.length > 5000) throw new HttpError(400, '답변은 5,000자 이하로 입력해 주세요.')
    const updates = status === 'answered'
      ? { status, answer, answered_by: session.id, answered_at: new Date().toISOString() }
      : { status }
    const result = await db.from('inquiries').update(updates).eq('id', inquiryId).select('*').maybeSingle()
    assertDatabase(result.error)
    if (!result.data) throw new HttpError(404, '문의를 찾을 수 없습니다.')
    return json(request, { inquiry: result.data })
  }

  if (request.method === 'GET' && path === '/admin/reports') {
    const result = await db.from('report_details').select('*').order('created_at', { ascending: false })
    assertDatabase(result.error)
    return json(request, { reports: result.data || [] })
  }

  const reportMatch = path.match(/^\/admin\/reports\/(\d+)$/)
  if (reportMatch && request.method === 'PATCH') {
    const reportId = positiveId(reportMatch[1])
    const body = await bodyJson(request)
    const status = String(body.status || 'reviewing')
    const adminNote = String(body.adminNote || '').trim()
    if (!['pending', 'reviewing', 'resolved', 'dismissed'].includes(status)) throw new HttpError(400, '신고 처리 상태가 올바르지 않습니다.')
    if (adminNote.length > 2000) throw new HttpError(400, '관리자 메모는 2,000자 이하로 입력해 주세요.')
    const found = await db.from('reports').select('post_id,comment_id,target_type').eq('id', reportId).maybeSingle()
    assertDatabase(found.error)
    if (!found.data) throw new HttpError(404, '신고를 찾을 수 없습니다.')
    if (body.hideTarget === true) {
      const targetId = found.data.target_type === 'post' ? found.data.post_id : found.data.comment_id
      if (!targetId) throw new HttpError(409, '신고 대상이 이미 삭제되어 숨길 수 없습니다.')
      const target = found.data.target_type === 'post'
        ? db.from('posts').update({ is_hidden: true }).eq('id', targetId)
        : db.from('comments').update({ is_hidden: true }).eq('id', targetId)
      const hidden = await target
      assertDatabase(hidden.error)
    }
    const result = await db.from('reports').update({
      status, admin_note: adminNote || null, handled_by: session.id,
      handled_at: ['resolved', 'dismissed'].includes(status) ? new Date().toISOString() : null,
    }).eq('id', reportId).select('*').single()
    assertDatabase(result.error)
    return json(request, { report: result.data })
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
