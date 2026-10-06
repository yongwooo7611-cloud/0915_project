export function getTokenExpiration(token) {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(base64))
    if (!Number.isFinite(decoded.exp) || !Number.isFinite(decoded.iat)) return null
    const absoluteExpiration = (decoded.iat + 24 * 60 * 60) * 1000
    return Math.min(decoded.exp * 1000, absoluteExpiration)
  } catch {
    return null
  }
}

export function isTokenExpired(token) {
  const expiresAt = getTokenExpiration(token)
  return !expiresAt || expiresAt <= Date.now()
}
