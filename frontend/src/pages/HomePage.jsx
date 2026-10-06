import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { formatDate } from '../utils'
import Modal from '../components/Modal'

function HomePage() {
  const [posts, setPosts] = useState([])
  const [notices, setNotices] = useState([])

  useEffect(() => {
    api('/posts?page=1').then((data) => setPosts(data.posts.slice(0, 3))).catch(() => setPosts([]))
    api('/notices/active').then((data) => {
      setNotices(data.notices.filter((notice) => !sessionStorage.getItem(`moa_notice_seen_${notice.id}`)))
    }).catch(() => setNotices([]))
  }, [])

  const closeNotices = () => {
    notices.forEach((notice) => sessionStorage.setItem(`moa_notice_seen_${notice.id}`, '1'))
    setNotices([])
  }

  return <>
    {notices.length > 0 && <Modal title="공지사항" onClose={closeNotices}><div className="notice-modal-list">{notices.map((notice) => <article key={notice.id}><span>{formatDate(notice.created_at)}</span><h3>{notice.title}</h3><div>{notice.content.split('\n').map((line, index) => <p key={index}>{line || <br />}</p>)}</div></article>)}</div><div className="modal-actions"><button type="button" className="button" onClick={closeNotices}>확인</button></div></Modal>}
    <section className="hero-section"><div className="container hero-content"><span className="eyebrow">우리의 이야기가 모이는 곳</span><h1>생각을 나누면<br />일상이 조금 더 넓어져요.</h1><p>취향과 경험, 소소한 질문까지.<br />모아에서 편안하게 이야기를 시작해 보세요.</p><div className="hero-actions"><Link to="/board" className="button">게시글 둘러보기</Link><Link to="/board/new" className="button button-secondary">이야기 쓰기</Link></div></div></section>
    <section className="section container"><div className="section-heading"><div><span className="eyebrow">지금 모아에서</span><h2>새로운 이야기</h2></div><Link to="/board" className="arrow-link">전체 보기 →</Link></div>{posts.length ? <div className="post-grid">{posts.map((post) => <Link to={`/board/${post.id}`} className="post-card" key={post.id}><span className="tag">{post.category}</span><h3>{post.title}</h3><p>{post.excerpt}</p><div className="post-meta"><span>{post.author}</span><span>{formatDate(post.createdAt)}</span></div></Link>)}</div> : <p className="list-empty">아직 등록된 이야기가 없습니다. 첫 이야기를 들려주세요.</p>}</section>
    <section className="community-banner"><div className="container banner-inner"><div><span className="eyebrow">함께해요</span><h2>당신의 이야기를 기다리고 있어요.</h2></div><Link to="/signup" className="button button-light">모아 시작하기</Link></div></section>
  </>
}

export default HomePage
