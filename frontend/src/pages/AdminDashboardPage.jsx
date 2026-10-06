import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '../api'
import { getTokenExpiration } from '../session'

const menuItems = [
  { id: 'dashboard', icon: '⌂', label: '대시보드' },
  { id: 'members', icon: '♙', label: '회원 관리' },
  { id: 'posts', icon: '▤', label: '게시글 관리' },
  { id: 'comments', icon: '◌', label: '댓글 관리' },
  { id: 'notices', icon: '◆', label: '공지사항' },
  { id: 'inquiries', icon: '?', label: '문의하기' },
  { id: 'reports', icon: '!', label: '신고 관리' },
  { id: 'settings', icon: '⚙', label: '환경 설정' },
]

async function adminApi(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${localStorage.getItem('moa_admin_token')}`,
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || '요청을 처리하지 못했습니다.')
  return data
}

function AdminDashboardPage() {
  const navigate = useNavigate()
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [dashboard, setDashboard] = useState({
    stats: { users: 0, posts: 0, comments: 0, views: 0 },
    changes: { users: 0, posts: 0, comments: 0, views: 0 },
    weeklyActivity: [],
    categoryDistribution: [],
    recentPosts: [],
    generatedAt: null,
  })
  const [members, setMembers] = useState([])
  const [adminPosts, setAdminPosts] = useState([])
  const [adminComments, setAdminComments] = useState([])
  const [notices, setNotices] = useState([])
  const [inquiries, setInquiries] = useState([])
  const [reports, setReports] = useState([])
  const [memberError, setMemberError] = useState('')
  const [postError, setPostError] = useState('')
  const [commentError, setCommentError] = useState('')
  const [admin, setAdmin] = useState(() => JSON.parse(localStorage.getItem('moa_admin') || '{}'))

  useEffect(() => {
    const token = localStorage.getItem('moa_admin_token')
    const expiresAt = getTokenExpiration(token)
    const expirationTimer = window.setTimeout(() => {
      localStorage.removeItem('moa_admin_token')
      localStorage.removeItem('moa_admin')
      navigate('/admin/login', { replace: true })
    }, Math.max(0, expiresAt - Date.now()))

    const loadDashboard = async () => {
      const headers = { Authorization: `Bearer ${localStorage.getItem('moa_admin_token')}` }
      const [dashboardResponse, membersResponse, postsResponse, commentsResponse, noticesResponse, inquiriesResponse, reportsResponse] = await Promise.all([
        fetch(apiUrl('/admin/dashboard'), { headers }),
        fetch(apiUrl('/admin/users'), { headers }),
        fetch(apiUrl('/admin/posts'), { headers }),
        fetch(apiUrl('/admin/comments'), { headers }),
        fetch(apiUrl('/admin/notices'), { headers }),
        fetch(apiUrl('/admin/inquiries'), { headers }),
        fetch(apiUrl('/admin/reports'), { headers }),
      ])
      if ([dashboardResponse, membersResponse, postsResponse, commentsResponse, noticesResponse, inquiriesResponse, reportsResponse].some((response) => response.status === 401)) {
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
      if (noticesResponse.ok) setNotices((await noticesResponse.json()).notices)
      if (inquiriesResponse.ok) setInquiries((await inquiriesResponse.json()).inquiries)
      if (reportsResponse.ok) setReports((await reportsResponse.json()).reports)
    }
    loadDashboard().catch(() => {})
    return () => window.clearTimeout(expirationTimer)
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
    if (activeMenu === 'notices') return <ManagementPanel title="공지사항" description="메인 화면에 노출할 공지사항을 작성하고 관리합니다."><AdminNoticePanel notices={notices} setNotices={setNotices} /></ManagementPanel>
    if (activeMenu === 'inquiries') return <ManagementPanel title="문의하기" description="사용자 문의를 확인하고 답변합니다."><AdminInquiryPanel inquiries={inquiries} setInquiries={setInquiries} /></ManagementPanel>
    if (activeMenu === 'reports') return <ManagementPanel title="신고 관리" description="접수된 신고를 검토하고 콘텐츠를 제어합니다."><AdminReportPanel reports={reports} setReports={setReports} /></ManagementPanel>
    return <ManagementPanel title="환경 설정" description="관리자 계정과 커뮤니티 운영 환경을 설정합니다."><AdminSettings admin={admin} onUpdate={setAdmin} /></ManagementPanel>
  }

  const todayLabel = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full' }).format(new Date())
  return <div className="admin-shell" lang="ko"><aside className="admin-sidebar"><div className="admin-sidebar-brand"><span>M</span><div>MOA<small>ADMIN CONSOLE</small></div></div><nav translate="no" aria-label="관리자 메뉴">{menuItems.map((item) => <button type="button" className={activeMenu === item.id ? 'active' : ''} onClick={() => setActiveMenu(item.id)} key={item.id}><span aria-hidden="true">{item.icon}</span><b>{item.label}</b></button>)}</nav><div className="admin-sidebar-footer"><div className="admin-user-avatar">{admin.name?.[0] || '관'}</div><div><strong>{admin.name || '관리자'}</strong><small>{admin.email}</small></div><button type="button" onClick={logout} aria-label="로그아웃">↗</button></div></aside><main className="admin-main"><header className="admin-topbar"><div><span translate="no">{menuItems.find((item) => item.id === activeMenu)?.label}</span><small>{todayLabel}</small></div><button type="button" className="admin-notification" aria-label="알림">●</button></header><div className="admin-content">{renderContent()}</div></main></div>
}

function AdminNoticePanel({ notices, setNotices }) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const createNotice = async (event) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setSubmitting(true); setError('')
    try {
      const data = await adminApi('/admin/notices', { method: 'POST', body: JSON.stringify({ title: form.get('title'), content: form.get('content'), isActive: form.get('isActive') === 'on' }) })
      setNotices((current) => [data.notice, ...current])
      formElement.reset()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleNotice = async (notice) => {
    try {
      const data = await adminApi(`/admin/notices/${notice.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !notice.is_active }) })
      setNotices((current) => current.map((item) => item.id === notice.id ? { ...item, ...data.notice } : item))
    } catch (requestError) { setError(requestError.message) }
  }

  const deleteNotice = async (notice) => {
    if (!window.confirm(`“${notice.title}” 공지를 삭제할까요?`)) return
    try {
      await adminApi(`/admin/notices/${notice.id}`, { method: 'DELETE' })
      setNotices((current) => current.filter((item) => item.id !== notice.id))
    } catch (requestError) { setError(requestError.message) }
  }

  return <div className="admin-feature-layout"><form className="admin-feature-form" onSubmit={createNotice}><div className="admin-setting-heading"><h3>새 공지 작성</h3><p>활성화된 공지는 메인 화면에서 모달로 표시됩니다.</p></div><label>제목<input name="title" maxLength="120" required /></label><label>내용<textarea name="content" rows="7" maxLength="5000" required /></label><label className="admin-check"><input name="isActive" type="checkbox" defaultChecked /> 작성 즉시 노출</label>{error && <p className="admin-error">{error}</p>}<button type="submit" disabled={submitting}>{submitting ? '등록 중...' : '공지 등록'}</button></form><div className="admin-record-list">{notices.map((notice) => <article className="admin-record" key={notice.id}><header><div><span className={`admin-status ${notice.is_active ? '' : 'hidden'}`}>{notice.is_active ? '노출 중' : '비활성'}</span><h3>{notice.title}</h3></div><small>{notice.created_at?.slice(0, 10)}</small></header><p>{notice.content}</p><footer><button type="button" onClick={() => toggleNotice(notice)}>{notice.is_active ? '노출 중지' : '노출 시작'}</button><button type="button" className="danger" onClick={() => deleteNotice(notice)}>삭제</button></footer></article>)}{notices.length === 0 && <p className="list-empty">등록된 공지가 없습니다.</p>}</div></div>
}

function AdminInquiryPanel({ inquiries, setInquiries }) {
  const [error, setError] = useState('')
  const [submittingId, setSubmittingId] = useState(null)

  const answerInquiry = async (event, inquiry) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmittingId(inquiry.id); setError('')
    try {
      const data = await adminApi(`/admin/inquiries/${inquiry.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'answered', answer: form.get('answer') }) })
      setInquiries((current) => current.map((item) => item.id === inquiry.id ? { ...item, ...data.inquiry, answered_by_name: '관리자' } : item))
    } catch (requestError) { setError(requestError.message) } finally { setSubmittingId(null) }
  }

  const closeInquiry = async (inquiry) => {
    try {
      const data = await adminApi(`/admin/inquiries/${inquiry.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) })
      setInquiries((current) => current.map((item) => item.id === inquiry.id ? { ...item, ...data.inquiry } : item))
    } catch (requestError) { setError(requestError.message) }
  }

  return <div className="admin-record-list admin-record-list-wide">{error && <p className="admin-error">{error}</p>}{inquiries.map((inquiry) => <article className="admin-record" key={inquiry.id}><header><div><span className={`admin-ticket-status ${inquiry.status}`}>{inquiry.status === 'pending' ? '답변 대기' : inquiry.status === 'answered' ? '답변 완료' : '종료'}</span><h3>{inquiry.title}</h3></div><small>{inquiry.user_name} · {inquiry.user_email}<br />{inquiry.created_at?.slice(0, 10)}</small></header><div className="admin-record-content"><strong>문의 내용</strong><p>{inquiry.content}</p></div>{inquiry.answer && <div className="admin-record-answer"><strong>관리자 답변</strong><p>{inquiry.answer}</p></div>}{inquiry.status !== 'closed' && <form className="admin-inline-form" onSubmit={(event) => answerInquiry(event, inquiry)}><textarea name="answer" rows="4" defaultValue={inquiry.answer || ''} maxLength="5000" placeholder="답변을 입력해 주세요." required /><div><button type="submit" disabled={submittingId === inquiry.id}>{submittingId === inquiry.id ? '저장 중...' : inquiry.answer ? '답변 수정' : '답변 등록'}</button><button type="button" className="danger" onClick={() => closeInquiry(inquiry)}>문의 종료</button></div></form>}</article>)}{inquiries.length === 0 && <p className="list-empty">접수된 문의가 없습니다.</p>}</div>
}

const reportReasonLabels = { spam: '스팸/광고', abuse: '욕설/괴롭힘', obscene: '부적절한 내용', privacy: '개인정보 노출', other: '기타' }

function AdminReportPanel({ reports, setReports }) {
  const [error, setError] = useState('')
  const [submittingId, setSubmittingId] = useState(null)

  const updateReport = async (event, report) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmittingId(report.id); setError('')
    try {
      const data = await adminApi(`/admin/reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status: form.get('status'), adminNote: form.get('adminNote'), hideTarget: form.get('hideTarget') === 'on' }) })
      setReports((current) => current.map((item) => item.id === report.id ? { ...item, ...data.report } : item))
    } catch (requestError) { setError(requestError.message) } finally { setSubmittingId(null) }
  }

  return <div className="admin-record-list-wide">{error && <p className="admin-error">{error}</p>}<div className="admin-table-wrap"><table className="admin-table admin-report-table"><thead><tr><th>접수일</th><th>신고자</th><th>신고 대상</th><th>사유 및 신고 내용</th><th>상태</th><th>관리</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{report.created_at?.slice(0, 10)}</td><td><strong>{report.reporter_name}</strong><small>{report.reporter_email}</small></td><td><span className="admin-category">{report.target_type === 'post' ? '게시글' : '댓글'}</span><strong>{report.target_title}</strong><small>작성자: {report.target_author}</small><p>{report.target_content}</p></td><td><strong>{reportReasonLabels[report.reason]}</strong><p>{report.details}</p></td><td><span className={`admin-ticket-status ${report.status}`}>{report.status === 'pending' ? '접수' : report.status === 'reviewing' ? '검토 중' : report.status === 'resolved' ? '처리 완료' : '기각'}</span></td><td><form className="admin-report-table-form" onSubmit={(event) => updateReport(event, report)}><select name="status" defaultValue={report.status}><option value="pending">접수</option><option value="reviewing">검토 중</option><option value="resolved">처리 완료</option><option value="dismissed">기각</option></select><textarea name="adminNote" rows="2" defaultValue={report.admin_note || ''} maxLength="2000" placeholder="처리 메모" /><label><input name="hideTarget" type="checkbox" /> 대상 숨김</label><button type="submit" disabled={submittingId === report.id}>{submittingId === report.id ? '저장 중...' : '저장'}</button></form></td></tr>)}</tbody></table>{reports.length === 0 && <p className="list-empty">접수된 신고가 없습니다.</p>}</div></div>
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
    { key: 'users', label: '전체 회원', value: dashboard.stats.users, color: 'mint', comparison: '지난달 말 대비' },
    { key: 'posts', label: '전체 게시글', value: dashboard.stats.posts, color: 'violet', comparison: '지난달 말 대비' },
    { key: 'comments', label: '전체 댓글', value: dashboard.stats.comments, color: 'orange', comparison: '지난달 말 대비' },
    { key: 'views', label: '오늘 조회수', value: dashboard.stats.views, color: 'blue', comparison: '어제 대비' },
  ]
  const recentPosts = dashboard.recentPosts
  const maxActivity = Math.max(1, ...dashboard.weeklyActivity.map((item) => item.value))
  const categoryColors = ['#68aa85', '#9a8fd2', '#dfa46e', '#70a9c5', '#d47f91', '#a4a96d']
  const donutSegments = dashboard.categoryDistribution.reduce((result, item, index) => {
    const start = result.end
    const end = start + item.percentage
    return { end, values: [...result.values, `${categoryColors[index % categoryColors.length]} ${start}% ${end}%`] }
  }, { end: 0, values: [] }).values
  const donutBackground = donutSegments.length ? `conic-gradient(${donutSegments.join(', ')})` : '#edf1ef'
  const updatedAt = dashboard.generatedAt
    ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(dashboard.generatedAt))
    : '-'

  return <><div className="admin-welcome"><div><p>반가워요, 관리자님 👋</p><h1>오늘의 모아 현황을 확인하세요.</h1></div><span>마지막 업데이트 · {updatedAt}</span></div><div className="admin-stat-grid">{stats.map((stat) => { const change = dashboard.changes[stat.key] || 0; return <article className={`admin-stat ${stat.color}`} key={stat.key}><div><span>{stat.label}</span><strong>{stat.value.toLocaleString()}</strong></div><em>{change > 0 ? '+' : ''}{change}%</em><small>{stat.comparison}</small></article> })}</div><div className="admin-dashboard-grid"><section className="admin-panel admin-activity"><div className="admin-panel-title"><div><h2>주간 활동</h2><p>최근 7일간 가입·게시글·댓글 수</p></div><button type="button">최근 7일⌄</button></div><div className="bar-chart">{dashboard.weeklyActivity.map((item) => <div key={item.date} title={`${item.date}: ${item.value}건`}><i style={{ height: `${(item.value / maxActivity) * 100}%` }}></i><span>{new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'Asia/Seoul' }).format(new Date(`${item.date}T00:00:00+09:00`))}</span></div>)}</div></section><section className="admin-panel admin-summary"><div className="admin-panel-title"><div><h2>콘텐츠 비율</h2><p>카테고리별 게시글</p></div></div><div className="donut" style={{ background: donutBackground }}><div><strong>{dashboard.stats.posts.toLocaleString()}</strong><span>전체</span></div></div><ul>{dashboard.categoryDistribution.map((item, index) => <li key={item.category}><i className="dot" style={{ background: categoryColors[index % categoryColors.length] }}></i>{item.category} <strong>{item.percentage}%</strong></li>)}{dashboard.categoryDistribution.length === 0 && <li>게시글이 없습니다.</li>}</ul></section></div><section className="admin-panel admin-recent"><div className="admin-panel-title"><div><h2>최근 게시글</h2><p>새롭게 등록된 게시글입니다.</p></div><button type="button">전체 보기 →</button></div><AdminPostTable posts={recentPosts} /></section></>
}

function ManagementPanel({ title, description, children }) {
  return <><div className="admin-welcome"><div><p>MANAGEMENT</p><h1>{title}</h1></div><span>{description}</span></div><section className="admin-panel admin-management">{children}</section></>
}

function AdminMemberTable({ members }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>이름</th><th>닉네임</th><th>이메일</th><th>구분</th><th>프로필</th><th>가입일</th></tr></thead><tbody>{members.map((member) => <tr key={`${member.role}-${member.id}`}><td><strong>{member.name || '-'}</strong></td><td>{member.nickname || '-'}</td><td>{member.email}</td><td><span className={`admin-role ${member.role}`}>{member.role === 'admin' ? '관리자' : '일반 사용자'}</span></td><td>{member.role === 'admin' ? '-' : <span className={`admin-profile-state ${member.profile_id ? 'complete' : 'missing'}`}>{member.profile_id ? '등록' : '미등록'}</span>}</td><td>{member.created_at?.slice(0, 10)}</td></tr>)}</tbody></table>{members.length === 0 && <p className="list-empty">등록된 회원이 없습니다.</p>}</div>
}

function AdminCommentTable({ comments, onToggleVisibility, onDelete }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>댓글</th><th>게시글</th><th>작성자</th><th>이메일</th><th>등록일</th><th>상태</th><th>관리</th></tr></thead><tbody>{comments.map((comment) => <tr key={comment.id}><td className="admin-comment-content">{comment.content}</td><td>{comment.post_title}</td><td>{comment.author}</td><td>{comment.author_email}</td><td>{comment.created_at?.slice(0, 10)}</td><td><span className={`admin-status ${comment.is_hidden ? 'hidden' : ''}`}>{comment.is_hidden ? '숨김' : '공개'}</span></td><td><div className="admin-row-actions"><button type="button" onClick={() => onToggleVisibility(comment)}>{comment.is_hidden ? '공개' : '숨김'}</button><button type="button" className="danger" onClick={() => onDelete(comment)}>삭제</button></div></td></tr>)}</tbody></table>{comments.length === 0 && <p className="list-empty">등록된 댓글이 없습니다.</p>}</div>
}

function AdminPostTable({ posts, onToggleVisibility, onDelete, showUserEmail = false }) {
  const manageable = Boolean(onToggleVisibility && onDelete)
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>게시글</th><th>작성자</th>{showUserEmail && <th>이메일</th>}<th>카테고리</th><th>조회/댓글</th><th>등록일</th><th>상태</th>{manageable && <th>관리</th>}</tr></thead><tbody>{posts.map((post) => <tr key={post.id}><td><strong>{post.title}</strong></td><td>{post.author || '-'}</td>{showUserEmail && <td>{post.author_email || '-'}</td>}<td><span className="admin-category">{post.category}</span></td><td>{post.view_count ?? '-'} / {post.comment_count ?? '-'}</td><td>{post.created_at?.slice(0, 10)}</td><td><span className={`admin-status ${post.is_hidden ? 'hidden' : ''}`}>{post.is_hidden ? '숨김' : '공개'}</span></td>{manageable && <td><div className="admin-row-actions"><button type="button" onClick={() => onToggleVisibility(post)}>{post.is_hidden ? '공개' : '숨김'}</button><button type="button" className="danger" onClick={() => onDelete(post)}>삭제</button></div></td>}</tr>)}</tbody></table>{posts.length === 0 && <p className="list-empty">등록된 게시글이 없습니다.</p>}</div>
}

export default AdminDashboardPage
