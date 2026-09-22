import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth'

function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')
    setSubmitting(true)
    try {
      await login({ email: form.get('email'), password: form.get('password') })
      navigate('/profile')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="auth-section container"><div className="auth-card"><div className="auth-heading"><span className="eyebrow">다시 만나 반가워요</span><h1>로그인</h1><p>모아에 로그인하고 이야기를 이어가세요.</p></div><form className="form" onSubmit={handleSubmit}><label>이메일<input name="email" type="email" placeholder="name@example.com" required /></label><label>비밀번호<input name="password" type="password" placeholder="비밀번호를 입력하세요" required /></label>{error && <p className="form-error">{error}</p>}<button className="button button-full" type="submit" disabled={submitting}>{submitting ? '로그인 중...' : '로그인'}</button></form><p className="auth-footer">아직 회원이 아니신가요? <Link to="/signup">회원가입</Link></p></div></section>
}

export default LoginPage
