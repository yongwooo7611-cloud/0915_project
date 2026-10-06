import { SignJWT, jwtVerify } from 'jose'
import { HttpError } from './http.ts'

export type SessionUser = { id: number; email: string; role: 'user' | 'admin'; name?: string; exp?: number }

const SESSION_LIFETIME_SECONDS = 24 * 60 * 60

function secret(role: 'user' | 'admin'): Uint8Array {
  const name = role === 'admin' ? 'ADMIN_JWT_SECRET' : 'USER_JWT_SECRET'
  const value = Deno.env.get(name)?.trim()
  if (!value || value.length < 32) throw new Error(`${name}은(는) 32자 이상이어야 합니다.`)
  return new TextEncoder().encode(value)
}

export async function signSession(user: SessionUser, expiresAt?: number): Promise<string> {
  const { exp: _previousExpiration, ...claims } = user
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt || Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS)
    .sign(secret(user.role))
}

function bearer(request: Request): string {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) throw new HttpError(401, '로그인이 필요합니다.')
  return authorization.slice(7)
}

export async function requireSession(request: Request, role: 'user' | 'admin'): Promise<SessionUser> {
  try {
    const { payload } = await jwtVerify(bearer(request), secret(role))
    const now = Math.floor(Date.now() / 1000)
    if (payload.role !== role || !Number.isInteger(payload.id) || !Number.isInteger(payload.iat)
      || (payload.iat as number) + SESSION_LIFETIME_SECONDS <= now) throw new Error('invalid session')
    return payload as unknown as SessionUser
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(401, role === 'admin' ? '관리자 인증이 만료되었거나 유효하지 않습니다.' : '로그인이 만료되었거나 유효하지 않습니다.')
  }
}

export async function optionalUser(request: Request): Promise<SessionUser | null> {
  if (!request.headers.get('authorization')) return null
  try {
    return await requireSession(request, 'user')
  } catch {
    return null
  }
}
