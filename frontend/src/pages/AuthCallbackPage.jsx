import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth'
import { requireSupabase } from '../supabase'

function AuthCallbackPage() {
  const navigate = useNavigate()
  const { completeKakaoLogin } = useAuth()
  const started = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (started.current) return
    started.current = true

    const finishLogin = async () => {
      const callbackParams = new URLSearchParams(window.location.search)
      const oauthError = callbackParams.get('error_description') || callbackParams.get('error')
      if (oauthError) throw new Error(oauthError)

      const supabase = requireSupabase()
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!data.session?.access_token) throw new Error('카카오 인증 정보를 확인할 수 없습니다. 다시 시도해 주세요.')

      await completeKakaoLogin(data.session.access_token)
      await supabase.auth.signOut({ scope: 'local' })

      const returnTo = sessionStorage.getItem('moa_oauth_return_to') || '/profile'
      sessionStorage.removeItem('moa_oauth_return_to')
      navigate(returnTo.startsWith('/') ? returnTo : '/profile', { replace: true })
    }

    finishLogin().catch((callbackError) => setError(callbackError.message))
  }, [completeKakaoLogin, navigate])

  return <section className="auth-section container"><div className="auth-card auth-callback-card">
    {error ? <><span className="auth-status-icon error">!</span><h1>로그인을 완료하지 못했어요</h1><p>{error}</p><Link to="/login" className="button button-full">로그인으로 돌아가기</Link></> : <><span className="auth-spinner" aria-hidden="true" /><h1>카카오 계정을 연결하고 있어요</h1><p>잠시만 기다려 주세요.</p></>}
  </div></section>
}

export default AuthCallbackPage
