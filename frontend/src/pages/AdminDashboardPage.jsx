import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '../api'

const menuItems = [
  { id: 'dashboard', icon: '⌂', label: '대시보드' },
  { id: 'members', icon: '♙', label: '회원 관리' },
  { id: 'posts', icon: '▤', label: '게시글 관리' },
  { id: 'comments', icon: '◌', label: '댓글 관리' },
  { id: 'settings', icon: '⚙', label: '환경 설정' },
]

function AdminDashboardPage() {
  const navigate = useNavigate()
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [dashboard, setDashboard] = useState({ stats: { users: 0, posts: 0, comments: 0, views: 0 }, recentPosts: [] })
  const [members, setMembers] = useState([])
  const [adminPosts, setAdminPosts] = useState([])
  const [adminComments, setAdminComments] = useState([])
  const [memberError, setMemberError] = useState('')
  const [postError, setPostError] = useState('')
  const [commentError, setCommentError] = useState('')
  const [admin, setAdmin] = useState(() => JSON.parse(localStorage.getItem('moa_admin') || '{}'))

  useEffect(() => {
    const loadDashboard = async () => {
      const headers = { Authorization: `Bearer ${localStorage.getItem('moa_admin_token')}` }
      const [dashboardResponse, membersResponse, postsResponse, commentsResponse] = await Promise.all([
        fetch(apiUrl('/admin/dashboard'), { headers }),
        fetch(apiUrl('/admin/users'), { headers }),
        fetch(apiUrl('/admin/posts'), { headers }),
        fetch(apiUrl('/admin/comments'), { headers }),
      ])
      if ([dashboardResponse, membersResponse, postsResponse, commentsResponse].some((response) => response.status === 401)) {
        localStorage.removeItem('moa_admin_token')
        navigate('/admin/login', { replace: true })
        return
      }
      if (dashboardResponse.ok) setDashboard(await dashboardResponse.json())
      if (membersResponse.ok) {
        setMembers((await membersResponse.json()).users)
      } else {
        const data = await membersResponse.json().catch(() => ({}))
        setMemberError(data.message || '회원 목록을 불러오지 못했습니다.')
      }
      if (postsResponse.ok) setAdminPosts((await postsResponse.json()).posts)
      if (commentsResponse.ok) setAdminComments((await commentsResponse.json()).comments)
    }
    loadDashboard().catch(() => {})
  }, [navigate])

  const logout = () => {
    localStorage.removeItem('moa_admin_token')
    localStorage.removeItem('moa_admin')
    navigate('/admin/login')
  }

  const updateVisibility = async (post) => {
    setPostError('')
    try {
      const response = await fetch(apiUrl(`/admin/posts/${post.id}/visibility`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('moa_admin_token')}`,
        },
        body: JSON.stringify({ hidden: !post.is_hidden }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || '게시글 상태를 변경하지 못했습니다.')
      const isHidden = post.is_hidden ? 0 : 1
      setAdminPosts((current) => current.map((item) => item.id === post.id ? { ...item, is_hidden: isHidden } : item))
      setDashboard((current) => ({ ...current, recentPosts: current.recentPosts.map((item) => item.id === post.id ? { ...item, is_hidden: isHidden } : item) }))
    } catch (requestError) {
      setPostError(requestError.message)
    }
  }

  const deleteAdminPost = async (post) => {
    if (!window.confirm(`“${post.title}” 게시글을 관리자 권한으로 삭제할까요?`)) return
    setPostError('')
    try {
      const response = await fetch(apiUrl(`/admin/posts/${post.id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('moa_admin_token')}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || '게시글을 삭제하지 못했습니다.')
      setAdminPosts((current) => current.filter((item) => item.id !== post.id))
      setDashboard((current) => ({
        ...current,
        stats: { ...current.stats, posts: current.stats.posts - 1 },
        recentPosts: current.recentPosts.filter((item) => item.id !== post.id),
      }))
    } catch (requestError) {
      setPostError(requestError.message)
    }
  }

  const updateCommentVisibility = async (comment) => {
    setCommentError('')
    try {
      const response = await fetch(apiUrl(`/admin/comments/${comment.id}/visibility`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('moa_admin_token')}`,
        },
        body: JSON.stringify({ hidden: !comment.is_hidden }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || '댓글 상태를 변경하지 못했습니다.')
      setAdminComments((current) => current.map((item) => item.id === comment.id ? { ...item, is_hidden: comment.is_hidden ? 0 : 1 } : item))
    } catch (requestError) {
      setCommentError(requestError.message)
    }
  }

  const deleteAdminComment = async (comment) => {
    if (!window.confirm('이 댓글을 관리자 권한으로 삭제할까요?')) return
    setCommentError('')
    try {
      const response = await fetch(apiUrl(`/admin/comments/${comment.id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('moa_admin_token')}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || '댓글을 삭제하지 못했습니다.')
      setAdminComments((current) => current.filter((item) => item.id !== comment.id))
      setDashboard((current) => ({ ...current, stats: { ...current.stats, comments: Math.max(0, current.stats.comments - 1) } }))
    } catch (requestError) {
      setCommentError(requestError.message)
    }
  }

  const renderContent = () => {
    if (activeMenu === 'dashboard') return <DashboardOverview dashboard={dashboard} />
    if (activeMenu === 'members') return <ManagementPanel title="회원 관리" description="일반 사용자와 관리자를 한눈에 확인합니다.">{memberError && <p className="admin-error">{memberError}</p>}<AdminMemberTable members={members} /></ManagementPanel>
    if (activeMenu === 'posts') return <ManagementPanel title="게시글 관리" description="사용자가 작성한 전체 게시글을 확인하고 관리합니다.">{postError && <p className="admin-error">{postError}</p>}<AdminPostTable posts={adminPosts} onToggleVisibility={updateVisibility} onDelete={deleteAdminPost} showUserEmail /></ManagementPanel>
    if (activeMenu === 'comments') return <ManagementPanel title="댓글 관리" description="전체 댓글을 숨김 또는 삭제할 수 있습니다.">{commentError && <p className="admin-error">{commentError}</p>}<AdminCommentTable comments={adminComments} onToggleVisibility={updateCommentVisibility} onDelete={deleteAdminComment} /></ManagementPanel>
    return <ManagementPanel title="환경 설정" description="관리자 계정과 커뮤니티 운영 환경을 설정합니다."><AdminSettings admin={admin} onUpdate={setAdmin} /></ManagementPanel>
  }

  return <div className="admin-shell"><aside className="admin-sidebar"><div className="admin-sidebar-brand"><span>M</span><div>MOA<small>ADMIN CONSOLE</small></div></div><nav>{menuItems.map((item) => <button type="button" className={activeMenu === item.id ? 'active' : ''} onClick={() => setActiveMenu(item.id)} key={item.id}><span>{item.icon}</span>{item.label}</button>)}</nav><div className="admin-sidebar-footer"><div className="admin-user-avatar">{admin.name?.[0] || '관'}</div><div><strong>{admin.name || '관리자'}</strong><small>{admin.email}</small></div><button type="button" onClick={logout} aria-label="로그아웃">↗</button></div></aside><main className="admin-main"><header className="admin-topbar"><div><span>{menuItems.find((item) => item.id === activeMenu)?.label}</span><small>2026년 9월 15일 화요일</small></div><button type="button" className="admin-notification" aria-label="알림">●</button></header><div className="admin-content">{renderContent()}</div></main></div>
}

function AdminSettings({ admin, onUpdate }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch(apiUrl('/admin/account'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('moa_admin_token')}`,
        },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          currentPassword: form.get('currentPassword'),
          newPassword: form.get('newPassword'),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || '계정 정보 변경에 실패했습니다.')

      localStorage.setItem('moa_admin_token', data.token)
      localStorage.setItem('moa_admin', JSON.stringify(data.admin))
      onUpdate(data.admin)
      event.currentTarget.reset()
      setMessage(data.message)
    } catch (requestError) {
      setError(requestError.message === 'Failed to fetch' ? '백엔드 서버에 연결할 수 없습니다.' : requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return <div className="admin-settings-layout"><form className="admin-account-form" onSubmit={handleSubmit}><div className="admin-setting-heading"><h3>관리자 계정</h3><p>로그인에 사용하는 계정 정보를 변경합니다.</p></div><div className="admin-account-grid"><label>관리자 이름<input name="name" type="text" defaultValue={admin.name} required /></label><label>관리자 이메일<input name="email" type="email" defaultValue={admin.email} required /></label><label>현재 비밀번호<input name="currentPassword" type="password" placeholder="변경 확인을 위해 입력" autoComplete="current-password" required /></label><label>새 비밀번호 <small>선택 사항</small><input name="newPassword" type="password" placeholder="변경 시 8자 이상 입력" minLength="8" autoComplete="new-password" /></label></div>{message && <div className="admin-success" role="status">{message}</div>}{error && <div className="admin-error" role="alert">{error}</div>}<button type="submit" disabled={loading}>{loading ? '저장 중...' : '계정 정보 저장'}</button></form><div className="admin-settings"><div className="admin-setting-heading"><h3>운영 설정</h3><p>커뮤니티 기능의 사용 여부를 관리합니다.</p></div><label><span>신규 회원가입 허용<small>새로운 사용자의 가입을 허용합니다.</small></span><input type="checkbox" defaultChecked /></label><label><span>댓글 알림<small>새로운 신고 댓글이 등록되면 알림을 받습니다.</small></span><input type="checkbox" defaultChecked /></label><label><span>점검 모드<small>관리자를 제외한 사이트 접속을 제한합니다.</small></span><input type="checkbox" /></label></div></div>
}

function DashboardOverview({ dashboard }) {
  const stats = [
    { label: '전체 회원', value: dashboard.stats.users, change: '+8.2%', color: 'mint' },
    { label: '전체 게시글', value: dashboard.stats.posts, change: '+12.5%', color: 'violet' },
    { label: '전체 댓글', value: dashboard.stats.comments, change: '+5.4%', color: 'orange' },
    { label: '오늘 조회수', value: dashboard.stats.views, change: '+18.1%', color: 'blue' },
  ]
  const recentPosts = dashboard.recentPosts
  return <><div className="admin-welcome"><div><p>반가워요, 관리자님 👋</p><h1>오늘의 모아 현황을 확인하세요.</h1></div><span>마지막 업데이트 · 방금 전</span></div><div className="admin-stat-grid">{stats.map((stat) => <article className={`admin-stat ${stat.color}`} key={stat.label}><div><span>{stat.label}</span><strong>{stat.value.toLocaleString()}</strong></div><em>{stat.change}</em><small>지난달 대비</small></article>)}</div><div className="admin-dashboard-grid"><section className="admin-panel admin-activity"><div className="admin-panel-title"><div><h2>주간 활동</h2><p>최근 7일간 커뮤니티 활동</p></div><button type="button">최근 7일⌄</button></div><div className="bar-chart">{[42, 58, 46, 74, 63, 88, 70].map((height, index) => <div key={index}><i style={{ height: `${height}%` }}></i><span>{['월','화','수','목','금','토','일'][index]}</span></div>)}</div></section><section className="admin-panel admin-summary"><div className="admin-panel-title"><div><h2>콘텐츠 비율</h2><p>카테고리별 게시글</p></div></div><div className="donut"><div><strong>100%</strong><span>전체</span></div></div><ul><li><i className="dot green"></i>일상 <strong>42%</strong></li><li><i className="dot purple"></i>정보 <strong>31%</strong></li><li><i className="dot orange"></i>자유 <strong>27%</strong></li></ul></section></div><section className="admin-panel admin-recent"><div className="admin-panel-title"><div><h2>최근 게시글</h2><p>새롭게 등록된 게시글입니다.</p></div><button type="button">전체 보기 →</button></div><AdminPostTable posts={recentPosts} /></section></>
}

function ManagementPanel({ title, description, children }) {
  return <><div className="admin-welcome"><div><p>MANAGEMENT</p><h1>{title}</h1></div><span>{description}</span></div><section className="admin-panel admin-management">{children}</section></>
}

function AdminMemberTable({ members }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>이름</th><th>닉네임</th><th>이메일</th><th>구분</th><th>가입일</th></tr></thead><tbody>{members.map((member) => <tr key={`${member.role}-${member.id}`}><td><strong>{member.name}</strong></td><td>{member.nickname || '-'}</td><td>{member.email}</td><td><span className={`admin-role ${member.role}`}>{member.role === 'admin' ? '관리자' : '일반 사용자'}</span></td><td>{member.created_at?.slice(0, 10)}</td></tr>)}</tbody></table>{members.length === 0 && <p className="list-empty">등록된 회원이 없습니다.</p>}</div>
}

function AdminCommentTable({ comments, onToggleVisibility, onDelete }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>댓글</th><th>게시글</th><th>작성자</th><th>이메일</th><th>등록일</th><th>상태</th><th>관리</th></tr></thead><tbody>{comments.map((comment) => <tr key={comment.id}><td className="admin-comment-content">{comment.content}</td><td>{comment.post_title}</td><td>{comment.author}</td><td>{comment.author_email}</td><td>{comment.created_at?.slice(0, 10)}</td><td><span className={`admin-status ${comment.is_hidden ? 'hidden' : ''}`}>{comment.is_hidden ? '숨김' : '공개'}</span></td><td><div className="admin-row-actions"><button type="button" onClick={() => onToggleVisibility(comment)}>{comment.is_hidden ? '공개' : '숨김'}</button><button type="button" className="danger" onClick={() => onDelete(comment)}>삭제</button></div></td></tr>)}</tbody></table>{comments.length === 0 && <p className="list-empty">등록된 댓글이 없습니다.</p>}</div>
}

function AdminPostTable({ posts, onToggleVisibility, onDelete, showUserEmail = false }) {
  const manageable = Boolean(onToggleVisibility && onDelete)
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>게시글</th><th>작성자</th>{showUserEmail && <th>이메일</th>}<th>카테고리</th><th>조회/댓글</th><th>등록일</th><th>상태</th>{manageable && <th>관리</th>}</tr></thead><tbody>{posts.map((post) => <tr key={post.id}><td><strong>{post.title}</strong></td><td>{post.author || '-'}</td>{showUserEmail && <td>{post.author_email || '-'}</td>}<td><span className="admin-category">{post.category}</span></td><td>{post.view_count ?? '-'} / {post.comment_count ?? '-'}</td><td>{post.created_at?.slice(0, 10)}</td><td><span className={`admin-status ${post.is_hidden ? 'hidden' : ''}`}>{post.is_hidden ? '숨김' : '공개'}</span></td>{manageable && <td><div className="admin-row-actions"><button type="button" onClick={() => onToggleVisibility(post)}>{post.is_hidden ? '공개' : '숨김'}</button><button type="button" className="danger" onClick={() => onDelete(post)}>삭제</button></div></td>}</tr>)}</tbody></table>{posts.length === 0 && <p className="list-empty">등록된 게시글이 없습니다.</p>}</div>
}

export default AdminDashboardPage
