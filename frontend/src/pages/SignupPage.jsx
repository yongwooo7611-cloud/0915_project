import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth'

function SignupPage() {
  const navigate = useNavigate()
  const { signup } = useAuth()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (form.get('password') !== form.get('passwordConfirm')) {
      setError('비밀번호가 서로 일치하지 않습니다.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await signup({ name: form.get('name'), nickname: form.get('nickname'), email: form.get('email'), password: form.get('password') })
      navigate('/profile')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="auth-section container"><div className="auth-card auth-card-wide"><div className="auth-heading"><span className="eyebrow">모아의 새 이웃</span><h1>회원가입</h1><p>간단한 정보로 새로운 이야기를 시작해 보세요.</p></div><form className="form" onSubmit={handleSubmit}><div className="form-row"><label>이름<input name="name" type="text" placeholder="이름" required /></label><label>닉네임<input name="nickname" type="text" placeholder="사용할 닉네임" required /></label></div><label>이메일<input name="email" type="email" placeholder="name@example.com" required /></label><label>비밀번호<input name="password" type="password" placeholder="8자 이상 입력하세요" minLength="8" required /></label><label>비밀번호 확인<input name="passwordConfirm" type="password" placeholder="비밀번호를 다시 입력하세요" minLength="8" required /></label><label className="check-label agreement"><input type="checkbox" required /> 이용약관 및 개인정보 처리방침에 동의합니다.</label>{error && <p className="form-error">{error}</p>}<button className="button button-full" type="submit" disabled={submitting}>{submitting ? '가입 중...' : '가입하기'}</button></form><p className="auth-footer">이미 계정이 있으신가요? <Link to="/login">로그인</Link></p></div></section>
}

export default SignupPage
