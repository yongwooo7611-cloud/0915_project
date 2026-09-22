import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/auth'
import { formatDate } from '../utils'

function ProfilePage() {
  const navigate = useNavigate()
  const { user, loading: authLoading, logout } = useAuth()
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState({ posts: 0, comments: 0 })
  const [posts, setPosts] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      navigate('/login', { replace: true })
      return
    }
    api('/auth/me').then((data) => {
      setProfile(data.user)
      setStats(data.stats)
      setPosts(data.posts)
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

  if (authLoading || !profile) return <section className="empty-state container"><p>{error || '프로필을 불러오는 중입니다.'}</p></section>

  return <section className="section container profile-page"><div className="profile-card"><div className="profile-avatar">{profile.nickname[0]}</div><div className="profile-info"><span className="eyebrow">내 프로필</span><h1>{profile.name}</h1><dl className="profile-details"><div><dt>닉네임</dt><dd>{profile.nickname}</dd></div><div><dt>이메일</dt><dd>{profile.email}</dd></div>{profile.bio && <div><dt>소개</dt><dd>{profile.bio}</dd></div>}</dl><div className="profile-stats"><span><strong>{stats.posts}</strong> 게시글</span><span><strong>{stats.comments}</strong> 댓글</span><span><strong>{formatDate(profile.createdAt)}</strong> 가입</span></div></div></div><div className="section-heading compact"><div><span className="eyebrow">나의 활동</span><h2>작성한 게시글</h2></div><Link to="/board/new" className="button button-small">새 글 쓰기</Link></div>{error && <p className="list-error">{error}</p>}{posts.length ? <div className="simple-list">{posts.map((post) => <div className="profile-post-row" key={post.id}><Link to={post.is_hidden ? `/board/${post.id}/edit` : `/board/${post.id}`} className="profile-post-link"><div><span className="tag">{post.category}</span>{Boolean(post.is_hidden) && <span className="status-badge hidden">숨김</span>}<h3>{post.title}</h3></div><span>{formatDate(post.created_at)} · 댓글 {post.comment_count}</span></Link><div className="post-manage-actions"><Link to={`/board/${post.id}/edit`} className="button button-small button-secondary">수정</Link><button type="button" className="button button-small button-danger" onClick={() => deletePost(post)}>삭제</button></div></div>)}</div> : <p className="list-empty">아직 작성한 게시글이 없습니다.</p>}</section>
}

export default ProfilePage
