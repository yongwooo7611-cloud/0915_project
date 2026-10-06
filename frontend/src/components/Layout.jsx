import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth'
import LegalModal from './LegalModal'

function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [legalModal, setLegalModal] = useState(null)

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="site-shell">
      {legalModal && <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />}
      <header className="site-header">
        <div className="container header-inner">
          <NavLink to="/" className="brand" aria-label="모아 홈"><span className="brand-mark">M</span><span>모아</span></NavLink>
          <nav className="main-nav" aria-label="주요 메뉴"><NavLink to="/" end>홈</NavLink><NavLink to="/board">게시판</NavLink>{user && <NavLink to="/profile">프로필</NavLink>}</nav>
          <div className="header-actions">
            {user ? <button type="button" className="text-button" onClick={handleLogout}>로그아웃</button> : <><NavLink to="/login" className="text-link">로그인</NavLink><NavLink to="/signup" className="button button-small">회원가입</NavLink></>}
          </div>
        </div>
      </header>
      <main className="site-main"><Outlet /></main>
      <footer className="site-footer"><div className="container footer-inner"><div><strong>모아</strong><p>생각을 나누고, 사람을 잇는 커뮤니티</p></div><div className="footer-legal"><div><button type="button" onClick={() => setLegalModal('terms')}>이용약관</button><button type="button" onClick={() => setLegalModal('privacy')}>개인정보처리방침</button></div><p>© 2026 MOA Community</p></div></div></footer>
    </div>
  )
}

export default Layout
