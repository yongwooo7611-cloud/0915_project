import { db, assertDatabase } from '../_shared/database.ts'
import { optionalUser, requireSession } from '../_shared/auth.ts'
import { bodyJson, HttpError, json, positiveId } from '../_shared/http.ts'

const PAGE_SIZE = 10
type PostSummary = {
  id: number; user_id: number; category: string; title: string; content: string;
  view_count: number; is_hidden: boolean; created_at: string; updated_at: string;
  author: string; comment_count: number | string; like_count: number | string; dislike_count: number | string;
}

function serializePost(post: PostSummary) {
  return {
    id: post.id, category: post.category, title: post.title, content: post.content,
    excerpt: String(post.content).replace(/\s+/g, ' ').slice(0, 100), author: post.author,
    userId: post.user_id, views: post.view_count, comments: Number(post.comment_count || 0),
    likes: Number(post.like_count || 0), dislikes: Number(post.dislike_count || 0),
    hidden: Boolean(post.is_hidden), createdAt: post.created_at, updatedAt: post.updated_at,
  }
}

function postInput(body: Record<string, unknown>) {
  const post = { category: String(body.category || '').trim(), title: String(body.title || '').trim(), content: String(body.content || '').trim() }
  if (!post.category || !post.title || !post.content) throw new HttpError(400, '카테고리, 제목, 내용을 모두 입력해 주세요.')
  if (post.title.length > 80) throw new HttpError(400, '제목은 80자 이하로 입력해 주세요.')
  return post
}

function parsePostPath(path: string): { postId: number; suffix: string } | null {
  const match = path.match(/^\/posts\/(\d+)(.*)$/)
  return match ? { postId: positiveId(match[1]), suffix: match[2] || '' } : null
}

export async function postRoutes(request: Request, path: string): Promise<Response | null> {
  const url = new URL(request.url)
  if (path === '/posts' && request.method === 'GET') {
    const category = (url.searchParams.get('category') || '').trim()
    const search = (url.searchParams.get('search') || '').trim().replace(/[(),%]/g, '')
    const requestedPage = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
    let query = db.from('post_summaries').select('*', { count: 'exact' }).eq('is_hidden', false)
    if (category && category !== '전체') query = query.eq('category', category)
    if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`)
    const from = (requestedPage - 1) * PAGE_SIZE
    let result = await query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)
    assertDatabase(result.error)
    const total = result.count || 0
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const page = Math.min(requestedPage, totalPages)
    if (page !== requestedPage) {
      let retry = db.from('post_summaries').select('*').eq('is_hidden', false)
      if (category && category !== '전체') retry = retry.eq('category', category)
      if (search) retry = retry.or(`title.ilike.%${search}%,content.ilike.%${search}%`)
      result = await retry.order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
      assertDatabase(result.error)
    }
    return json(request, { posts: (result.data || []).map(serializePost), pagination: { page, totalPages, total } })
  }

  if (path === '/posts' && request.method === 'POST') {
    const user = await requireSession(request, 'user')
    const input = postInput(await bodyJson(request))
    const { data, error } = await db.from('posts').insert({ ...input, user_id: user.id }).select('id').single()
    assertDatabase(error)
    if (!data) throw new Error('게시글 생성 결과가 없습니다.')
    return json(request, { id: data.id }, 201)
  }

  const parsed = parsePostPath(path)
  if (!parsed) return null
  const { postId, suffix } = parsed

  if (suffix === '/manage' && request.method === 'GET') {
    const user = await requireSession(request, 'user')
    const { data, error } = await db.from('post_summaries').select('*').eq('id', postId).maybeSingle()
    assertDatabase(error)
    if (!data) throw new HttpError(404, '게시글을 찾을 수 없습니다.')
    if (data.user_id !== user.id) throw new HttpError(403, '작성자만 게시글을 수정할 수 있습니다.')
    return json(request, { post: serializePost(data) })
  }

  if (suffix === '' && request.method === 'PUT') {
    const user = await requireSession(request, 'user')
    const { data: existing, error: findError } = await db.from('posts').select('user_id').eq('id', postId).maybeSingle()
    assertDatabase(findError)
    if (!existing) throw new HttpError(404, '게시글을 찾을 수 없습니다.')
    if (existing.user_id !== user.id) throw new HttpError(403, '작성자만 게시글을 수정할 수 있습니다.')
    const input = postInput(await bodyJson(request))
    const { error } = await db.from('posts').update(input).eq('id', postId)
    assertDatabase(error)
    return json(request, { message: '게시글을 수정했습니다.', id: postId })
  }

  if (suffix === '' && request.method === 'DELETE') {
    const user = await requireSession(request, 'user')
    const { data: existing, error: findError } = await db.from('posts').select('user_id').eq('id', postId).maybeSingle()
    assertDatabase(findError)
    if (!existing) throw new HttpError(404, '게시글을 찾을 수 없습니다.')
    if (existing.user_id !== user.id) throw new HttpError(403, '작성자만 게시글을 삭제할 수 있습니다.')
    const { error } = await db.from('posts').delete().eq('id', postId)
    assertDatabase(error)
    return json(request, { message: '게시글을 삭제했습니다.' })
  }

  if (suffix === '/view' && request.method === 'POST') {
    const user = await requireSession(request, 'user')
    const { data, error } = await db.rpc('record_post_view', { p_post_id: postId, p_user_id: user.id })
    if (error?.message.includes('POST_NOT_FOUND')) throw new HttpError(404, '게시글을 찾을 수 없습니다.')
    assertDatabase(error)
    return json(request, { views: data })
  }

  if (suffix === '/reaction' && request.method === 'PUT') {
    const user = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const reaction = body.reaction === null ? null : String(body.reaction || '')
    if (reaction !== null && !['like', 'dislike'].includes(reaction)) throw new HttpError(400, '올바른 반응을 선택해 주세요.')
    const { data, error } = await db.rpc('set_post_reaction', { p_post_id: postId, p_user_id: user.id, p_reaction: reaction })
    if (error?.message.includes('POST_NOT_FOUND')) throw new HttpError(404, '게시글을 찾을 수 없습니다.')
    assertDatabase(error)
    const counts = data?.[0] || { likes: 0, dislikes: 0 }
    return json(request, { reaction, likes: Number(counts.likes), dislikes: Number(counts.dislikes) })
  }

  if (suffix === '' && request.method === 'GET') {
    const user = await optionalUser(request)
    const [{ data: post, error }, commentsResult] = await Promise.all([
      db.from('post_summaries').select('*').eq('id', postId).eq('is_hidden', false).maybeSingle(),
      db.from('comment_details').select('*').eq('post_id', postId).eq('is_hidden', false).order('created_at'),
    ])
    assertDatabase(error); assertDatabase(commentsResult.error)
    if (!post) throw new HttpError(404, '게시글을 찾을 수 없습니다.')
    let userReaction = null
    if (user) {
      const result = await db.from('post_reactions').select('reaction').eq('post_id', postId).eq('user_id', user.id).maybeSingle()
      assertDatabase(result.error); userReaction = result.data?.reaction || null
    }
    const comments = (commentsResult.data || []).map((comment) => ({
      id: comment.id, content: comment.content, createdAt: comment.created_at,
      updatedAt: comment.updated_at, userId: comment.user_id, author: comment.author,
    }))
    return json(request, { post: { ...serializePost(post), userReaction }, comments })
  }

  if (suffix === '/comments' && request.method === 'POST') {
    const user = await requireSession(request, 'user')
    const content = String((await bodyJson(request)).content || '').trim()
    if (!content) throw new HttpError(400, '댓글 내용을 입력해 주세요.')
    if (content.length > 2000) throw new HttpError(400, '댓글은 2,000자 이하로 입력해 주세요.')
    const visible = await db.from('posts').select('id').eq('id', postId).eq('is_hidden', false).maybeSingle()
    assertDatabase(visible.error)
    if (!visible.data) throw new HttpError(404, '게시글을 찾을 수 없습니다.')
    const inserted = await db.from('comments').insert({ post_id: postId, user_id: user.id, content }).select('id').single()
    assertDatabase(inserted.error)
    if (!inserted.data) throw new Error('댓글 생성 결과가 없습니다.')
    const detail = await db.from('comment_details').select('*').eq('id', inserted.data.id).single()
    assertDatabase(detail.error)
    const comment = detail.data
    return json(request, { comment: { id: comment.id, content: comment.content, createdAt: comment.created_at, updatedAt: comment.updated_at, userId: comment.user_id, author: comment.author } }, 201)
  }

  const commentMatch = suffix.match(/^\/comments\/(\d+)$/)
  if (commentMatch && (request.method === 'PUT' || request.method === 'DELETE')) {
    const user = await requireSession(request, 'user')
    const commentId = positiveId(commentMatch[1])
    const found = await db.from('comments').select('user_id,is_hidden').eq('id', commentId).eq('post_id', postId).maybeSingle()
    assertDatabase(found.error)
    if (!found.data) throw new HttpError(404, '댓글을 찾을 수 없습니다.')
    if (found.data.user_id !== user.id) throw new HttpError(403, `작성자만 댓글을 ${request.method === 'PUT' ? '수정' : '삭제'}할 수 있습니다.`)
    if (request.method === 'DELETE') {
      const result = await db.from('comments').delete().eq('id', commentId); assertDatabase(result.error)
      return json(request, { message: '댓글을 삭제했습니다.' })
    }
    if (found.data.is_hidden) throw new HttpError(409, '숨김 처리된 댓글은 수정할 수 없습니다.')
    const content = String((await bodyJson(request)).content || '').trim()
    if (!content) throw new HttpError(400, '댓글 내용을 입력해 주세요.')
    if (content.length > 2000) throw new HttpError(400, '댓글은 2,000자 이하로 입력해 주세요.')
    const result = await db.from('comments').update({ content }).eq('id', commentId).select('content,updated_at').single()
    assertDatabase(result.error)
    if (!result.data) throw new Error('댓글 수정 결과가 없습니다.')
    return json(request, { message: '댓글을 수정했습니다.', content: result.data.content, updatedAt: result.data.updated_at })
  }

  return null
}
