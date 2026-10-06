import { db, assertDatabase } from '../_shared/database.ts'
import { requireSession } from '../_shared/auth.ts'
import { bodyJson, HttpError, json } from '../_shared/http.ts'

const REPORT_REASONS = ['spam', 'abuse', 'obscene', 'privacy', 'other']

export async function communityRoutes(request: Request, path: string): Promise<Response | null> {
  if (request.method === 'GET' && path === '/notices/active') {
    const now = new Date().toISOString()
    const result = await db.from('notice_details').select('id,title,content,starts_at,ends_at,created_at,admin_name')
      .eq('is_active', true).lte('starts_at', now).or(`ends_at.is.null,ends_at.gte.${now}`)
      .order('starts_at', { ascending: false })
    assertDatabase(result.error)
    return json(request, { notices: result.data || [] })
  }

  if (path === '/inquiries' && request.method === 'GET') {
    const user = await requireSession(request, 'user')
    const result = await db.from('inquiry_details')
      .select('id,title,content,status,answer,answered_by_name,answered_at,created_at,updated_at')
      .eq('user_id', user.id).order('created_at', { ascending: false })
    assertDatabase(result.error)
    return json(request, { inquiries: result.data || [] })
  }

  if (path === '/inquiries' && request.method === 'POST') {
    const user = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const title = String(body.title || '').trim()
    const content = String(body.content || '').trim()
    if (!title || !content) throw new HttpError(400, '문의 제목과 내용을 입력해 주세요.')
    if (title.length > 120 || content.length > 3000) throw new HttpError(400, '문의 제목은 120자, 내용은 3,000자 이하로 입력해 주세요.')
    const result = await db.from('inquiries').insert({ user_id: user.id, title, content })
      .select('id,title,content,status,answer,answered_at,created_at,updated_at').single()
    assertDatabase(result.error)
    return json(request, { inquiry: result.data }, 201)
  }

  if (path === '/reports' && request.method === 'POST') {
    const user = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const targetType = String(body.targetType || '')
    const targetId = Number(body.targetId)
    const reason = String(body.reason || '')
    const details = String(body.details || '').trim()
    if (!['post', 'comment'].includes(targetType) || !Number.isInteger(targetId) || targetId <= 0) throw new HttpError(400, '신고 대상이 올바르지 않습니다.')
    if (!REPORT_REASONS.includes(reason)) throw new HttpError(400, '신고 사유를 선택해 주세요.')
    if (!details || details.length > 2000) throw new HttpError(400, '신고 내용을 2,000자 이하로 입력해 주세요.')

    let postId: number
    let commentId: number | null = null
    let targetTitle: string
    let targetContent: string
    let targetAuthor: string
    let targetUserId: number

    if (targetType === 'post') {
      const found = await db.from('post_summaries').select('id,user_id,title,content,author').eq('id', targetId).eq('is_hidden', false).maybeSingle()
      assertDatabase(found.error)
      if (!found.data) throw new HttpError(404, '신고할 게시글을 찾을 수 없습니다.')
      postId = found.data.id; targetTitle = found.data.title; targetContent = found.data.content
      targetAuthor = found.data.author; targetUserId = found.data.user_id
    } else {
      const found = await db.from('comment_details').select('id,post_id,user_id,content,author,post_title').eq('id', targetId).eq('is_hidden', false).maybeSingle()
      assertDatabase(found.error)
      if (!found.data) throw new HttpError(404, '신고할 댓글을 찾을 수 없습니다.')
      postId = found.data.post_id; commentId = found.data.id; targetTitle = found.data.post_title
      targetContent = found.data.content; targetAuthor = found.data.author; targetUserId = found.data.user_id
    }
    if (targetUserId === user.id) throw new HttpError(400, '본인이 작성한 콘텐츠는 신고할 수 없습니다.')

    let duplicate = db.from('신고하기').select('id').eq('reporter_id', user.id).eq('target_type', targetType)
      .in('status', ['pending', 'reviewing']).limit(1)
    duplicate = targetType === 'post' ? duplicate.eq('post_id', targetId) : duplicate.eq('comment_id', targetId)
    const duplicateResult = await duplicate
    assertDatabase(duplicateResult.error)
    if (duplicateResult.data?.length) throw new HttpError(409, '이미 접수되어 처리 중인 신고입니다.')

    const inserted = await db.from('신고하기').insert({
      reporter_id: user.id, target_type: targetType, post_id: postId, comment_id: commentId,
      target_title: targetTitle, target_content: targetContent, target_author: targetAuthor, reason, details,
    }).select('id,status,created_at').single()
    assertDatabase(inserted.error)
    return json(request, { message: '신고가 접수되었습니다.', report: inserted.data }, 201)
  }

  if (path === '/reports' && request.method === 'GET') {
    const user = await requireSession(request, 'user')
    const result = await db.from('report_details')
      .select('id,target_type,post_id,comment_id,target_title,target_content,target_author,reason,details,status,admin_note,handled_at,created_at,updated_at')
      .eq('reporter_id', user.id).order('created_at', { ascending: false })
    assertDatabase(result.error)
    return json(request, { reports: result.data || [] })
  }

  return null
}
