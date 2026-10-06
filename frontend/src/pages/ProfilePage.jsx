import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/auth'
import { formatDate } from '../utils'
import Modal from '../components/Modal'

function ProfilePage() {
  const navigate = useNavigate()
  const { user, loading: authLoading, logout } = useAuth()
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState({ posts: 0, comments: 0 })
  const [posts, setPosts] = useState([])
  const [error, setError] = useState('')
  const [inquiries, setInquiries] = useState([])
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [inquirySubmitting, setInquirySubmitting] = useState(false)
  const [inquiryError, setInquiryError] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      navigate('/login', { replace: true })
      return
    }
    Promise.all([api('/auth/me'), api('/inquiries')]).then(([profileData, inquiryData]) => {
      setProfile(profileData.user)
      setStats(profileData.stats)
      setPosts(profileData.posts)
      setInquiries(inquiryData.inquiries)
    }).catch((requestError) => {
      setError(requestError.message)
      if (requestError.message.includes('로그인')) {
        logout()
        navigate('/login', { replace: true })
      }
    })
  }, [user, authLoading, logout, navigate])

  const deletePost = async (post) => {
    if (!window.confirm(`“${post.title}” 게시글을 삭제할까요? 삭제 후 복구할 수 없습니다.`)) return
    setError('')
    try {
      await api(`/posts/${post.id}`, { method: 'DELETE' })
      setPosts((current) => current.filter((item) => item.id !== post.id))
      setStats((current) => ({ ...current, posts: current.posts - 1 }))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const submitInquiry = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setInquirySubmitting(true)
    setInquiryError('')
    try {
      const data = await api('/inquiries', {
        method: 'POST',
        body: JSON.stringify({ title: form.get('title'), content: form.get('content') }),
      })
      setInquiries((current) => [data.inquiry, ...current])
      setInquiryOpen(false)
    } catch (requestError) {
      setInquiryError(requestError.message)
    } finally {
      setInquirySubmitting(false)
    }
  }

  if (authLoading || !profile) return <section className="empty-state container"><p>{error || '프로필을 불러오는 중입니다.'}</p></section>

  return <section className="section container profile-page">{inquiryOpen && <Modal title="문의하기" onClose={() => setInquiryOpen(false)}><form className="form" onSubmit={submitInquiry}><label>문의 제목<input name="title" maxLength="120" placeholder="문의 제목을 입력해 주세요." required /></label><label>문의 내용<textarea name="content" rows="7" maxLength="3000" placeholder="궁금한 내용을 자세히 작성해 주세요." required /></label>{inquiryError && <p className="form-error">{inquiryError}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setInquiryOpen(false)}>취소</button><button type="submit" className="button" disabled={inquirySubmitting}>{inquirySubmitting ? '접수 중...' : '문의 접수'}</button></div></form></Modal>}<div className="profile-card"><div className="profile-avatar">{profile.nickname[0]}</div><div className="profile-info"><span className="eyebrow">내 프로필</span><h1>{profile.name}</h1><dl className="profile-details"><div><dt>닉네임</dt><dd>{profile.nickname}</dd></div><div><dt>이메일</dt><dd>{profile.email}</dd></div>{profile.bio && <div><dt>소개</dt><dd>{profile.bio}</dd></div>}</dl><div className="profile-stats"><span><strong>{stats.posts}</strong> 게시글</span><span><strong>{stats.comments}</strong> 댓글</span><span><strong>{formatDate(profile.createdAt)}</strong> 가입</span></div></div><button type="button" className="button button-secondary" onClick={() => { setInquiryError(''); setInquiryOpen(true) }}>문의하기</button></div><div className="section-heading compact"><div><span className="eyebrow">고객 지원</span><h2>나의 문의</h2></div><button type="button" className="button button-small" onClick={() => setInquiryOpen(true)}>새 문의</button></div>{inquiries.length ? <div className="inquiry-list">{inquiries.map((inquiry) => <details className="inquiry-card" key={inquiry.id}><summary><div><span className={`inquiry-status ${inquiry.status}`}>{inquiry.status === 'pending' ? '답변 대기' : inquiry.status === 'answered' ? '답변 완료' : '종료'}</span><strong>{inquiry.title}</strong></div><span>{formatDate(inquiry.created_at)}</span></summary><div className="inquiry-body"><div><small>문의 내용</small><p>{inquiry.content}</p></div>{inquiry.answer && <div className="inquiry-answer"><small>{inquiry.answered_by_name || '관리자'} 답변 · {formatDate(inquiry.answered_at)}</small><p>{inquiry.answer}</p></div>}</div></details>)}</div> : <p className="list-empty">등록한 문의가 없습니다.</p>}<div className="section-heading compact"><div><span className="eyebrow">나의 활동</span><h2>작성한 게시글</h2></div><Link to="/board/new" className="button button-small">새 글 쓰기</Link></div>{error && <p className="list-error">{error}</p>}{posts.length ? <div className="simple-list">{posts.map((post) => <div className="profile-post-row" key={post.id}><Link to={post.is_hidden ? `/board/${post.id}/edit` : `/board/${post.id}`} className="profile-post-link"><div><span className="tag">{post.category}</span>{Boolean(post.is_hidden) && <span className="status-badge hidden">숨김</span>}<h3>{post.title}</h3></div><span>{formatDate(post.created_at)} · 댓글 {post.comment_count}</span></Link><div className="post-manage-actions"><Link to={`/board/${post.id}/edit`} className="button button-small button-secondary">수정</Link><button type="button" className="button button-small button-danger" onClick={() => deletePost(post)}>삭제</button></div></div>)}</div> : <p className="list-empty">아직 작성한 게시글이 없습니다.</p>}</section>
}

export default ProfilePage
