import { useState } from 'react'
import { useAuth } from '../context/auth'

function KakaoIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3C6.48 3 2 6.55 2 10.93c0 2.84 1.88 5.33 4.71 6.73l-1.2 4.18a.45.45 0 0 0 .68.5l4.8-3.17c.33.03.67.04 1.01.04 5.52 0 10-3.55 10-7.93S17.52 3 12 3Z" /></svg>
}

function KakaoAuthButton({ mode = 'login', returnTo = '/profile', className = '' }) {
  const { loginWithKakao } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const label = mode === 'signup' ? '카카오로 회원가입' : mode === 'start' ? '카카오로 시작하기' : '카카오로 로그인'

  const handleClick = async () => {
    setError('')
    setSubmitting(true)
    try {
      await loginWithKakao(returnTo)
    } catch (requestError) {
      setError(requestError.message)
      setSubmitting(false)
    }
  }

  return <div className={`kakao-auth-wrap ${className}`.trim()}>
    <button type="button" className="kakao-auth-button" onClick={handleClick} disabled={submitting}>
      <KakaoIcon />
      <span>{submitting ? '카카오로 이동 중...' : label}</span>
    </button>
    {error && <p className="form-error kakao-auth-error">{error}</p>}
  </div>
}

export default KakaoAuthButton
