import { auth, db, assertDatabase } from '../_shared/database.ts'
import { requireSession, signSession } from '../_shared/auth.ts'
import { bodyJson, HttpError, json } from '../_shared/http.ts'

type UserRow = {
  id: number; auth_user_id: string; email: string; name: string; nickname: string;
  bio: string; created_at: string; updated_at: string;
}

function publicUser(user: UserRow) {
  return { id: user.id, email: user.email, name: user.name, nickname: user.nickname, bio: user.bio || '', createdAt: user.created_at }
}

export async function authRoutes(request: Request, path: string): Promise<Response | null> {
  if (request.method === 'POST' && path === '/auth/signup') {
    const body = await bodyJson(request)
    const name = String(body.name || '').trim()
    const nickname = String(body.nickname || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!name || !nickname || !email || !password) throw new HttpError(400, '모든 필수 정보를 입력해 주세요.')
    if (password.length < 8) throw new HttpError(400, '비밀번호는 8자 이상이어야 합니다.')

    const existing = await db.from('users').select('id').or(`email.eq.${email},nickname.eq.${nickname}`).limit(1)
    assertDatabase(existing.error)
    if (existing.data?.length) throw new HttpError(409, '이미 사용 중인 이메일 또는 닉네임입니다.')

    const created = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, nickname },
    })
    if (created.error || !created.data.user) {
      if (created.error?.message.toLowerCase().includes('already')) throw new HttpError(409, '이미 사용 중인 이메일입니다.')
      console.error('Supabase Auth signup error:', created.error?.message)
      throw new Error('Supabase 회원가입을 처리하지 못했습니다.')
    }

    const authUserId = created.data.user.id
    const { data, error } = await db.from('users').insert({ auth_user_id: authUserId, email, name, nickname }).select('*').single()
    if (error || !data) {
      await db.auth.admin.deleteUser(authUserId)
      if (error?.code === '23505') throw new HttpError(409, '이미 사용 중인 이메일 또는 닉네임입니다.')
      assertDatabase(error)
      throw new Error('사용자 프로필을 생성하지 못했습니다.')
    }

    const user = data as UserRow
    const token = await signSession({ id: user.id, email: user.email, role: 'user' })
    return json(request, { token, user: publicUser(user) }, 201)
  }

  if (request.method === 'POST' && path === '/auth/login') {
    const body = await bodyJson(request)
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const signedIn = await auth.auth.signInWithPassword({ email, password })
    if (signedIn.error || !signedIn.data.user) throw new HttpError(401, '이메일 또는 비밀번호가 올바르지 않습니다.')

    const { data, error } = await db.from('users').select('*').eq('auth_user_id', signedIn.data.user.id).maybeSingle()
    assertDatabase(error)
    const user = data as UserRow | null
    if (!user) throw new HttpError(401, '연결된 사용자 프로필을 찾을 수 없습니다.')

    const token = await signSession({ id: user.id, email: user.email, role: 'user' })
    return json(request, { token, user: publicUser(user) })
  }

  if (request.method === 'GET' && path === '/auth/me') {
    const session = await requireSession(request, 'user')
    const [{ data, error }, postCount, commentCount, userPosts] = await Promise.all([
      db.from('users').select('*').eq('id', session.id).maybeSingle(),
      db.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', session.id),
      db.from('comments').select('*', { count: 'exact', head: true }).eq('user_id', session.id),
      db.from('post_summaries').select('id,category,title,created_at,updated_at,is_hidden,view_count,comment_count').eq('user_id', session.id).order('created_at', { ascending: false }),
    ])
    assertDatabase(error); assertDatabase(postCount.error); assertDatabase(commentCount.error); assertDatabase(userPosts.error)
    if (!data) throw new HttpError(404, '사용자를 찾을 수 없습니다.')
    return json(request, {
      user: publicUser(data as UserRow),
      stats: { posts: postCount.count || 0, comments: commentCount.count || 0 },
      posts: userPosts.data || [],
    })
  }

  return null
}
