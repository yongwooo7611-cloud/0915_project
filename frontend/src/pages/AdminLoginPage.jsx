import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiUrl } from '../api'

function AdminLoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch(apiUrl('/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || '로그인에 실패했습니다.')

      localStorage.setItem('moa_admin_token', data.token)
      localStorage.setItem('moa_admin', JSON.stringify(data.admin))
      navigate('/admin')
    } catch (requestError) {
      setError(requestError.message === 'Failed to fetch' ? '백엔드 서버에 연결할 수 없습니다.' : requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return <main className="admin-login-page"><div className="admin-login-visual"><Link to="/" className="admin-brand"><span>M</span> MOA ADMIN</Link><div><p className="admin-kicker">COMMUNITY MANAGEMENT</p><h1>좋은 커뮤니티는<br />세심한 관리에서 시작됩니다.</h1><p>회원과 콘텐츠 현황을 한눈에 확인하고<br />모아를 안전하게 운영하세요.</p></div><small>© 2026 MOA Community</small></div><div className="admin-login-panel"><form className="admin-login-card" onSubmit={handleSubmit}><span className="admin-mobile-logo">M</span><p className="admin-kicker">ADMIN ONLY</p><h2>관리자 로그인</h2><p>관리자 계정으로 로그인해 주세요.</p><label>관리자 이메일<input name="email" type="email" placeholder="admin@example.com" autoComplete="username" required /></label><label>비밀번호<input name="password" type="password" placeholder="비밀번호" autoComplete="current-password" required /></label>{error && <div className="admin-error" role="alert">{error}</div>}<button type="submit" disabled={loading}>{loading ? '확인 중...' : '관리자 로그인'}</button><Link to="/">← 일반 사이트로 돌아가기</Link></form></div></main>
}

export default AdminLoginPage
