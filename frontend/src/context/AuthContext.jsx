import { useEffect, useMemo, useState } from 'react'
import { api, clearToken, getToken, saveToken } from '../api'
import { AuthContext } from './auth'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (!getToken()) {
      localStorage.removeItem('moa_user')
      return null
    }
    const savedUser = localStorage.getItem('moa_user')
    if (!savedUser) return null
    try {
      return JSON.parse(savedUser)
    } catch {
      localStorage.removeItem('moa_user')
      return null
    }
  })
  const [loading, setLoading] = useState(() => Boolean(getToken()))

  useEffect(() => {
    if (!getToken()) return

    api('/auth/me').then((data) => {
      localStorage.setItem('moa_user', JSON.stringify(data.user))
      setUser(data.user)
    }).catch(() => {
      clearToken()
      localStorage.removeItem('moa_user')
      setUser(null)
    }).finally(() => setLoading(false))
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    async login(credentials) {
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify(credentials) })
      saveToken(data.token)
      localStorage.setItem('moa_user', JSON.stringify(data.user))
      setUser(data.user)
      setLoading(false)
      return data.user
    },
    async signup(formData) {
      const data = await api('/auth/signup', { method: 'POST', body: JSON.stringify(formData) })
      saveToken(data.token)
      localStorage.setItem('moa_user', JSON.stringify(data.user))
      setUser(data.user)
      setLoading(false)
      return data.user
    },
    logout() {
      clearToken()
      localStorage.removeItem('moa_user')
      setUser(null)
    },
  }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
