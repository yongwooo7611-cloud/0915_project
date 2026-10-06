import { isTokenExpired } from './session'

const TOKEN_KEY = 'moa_token'
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`
}

export function getToken() {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token && isTokenExpired(token)) {
    clearToken()
    localStorage.removeItem('moa_user')
    return null
  }
  return token
}

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function api(path, options = {}) {
  const token = getToken()
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message || '요청을 처리하지 못했습니다.')
  }

  return data
}
