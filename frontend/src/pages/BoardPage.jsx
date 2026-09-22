import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { formatDate } from '../utils'

const categories = ['전체', '공지', '일상', '질문', '정보', '취미', '자유']

function BoardPage() {
  const [posts, setPosts] = useState([])
  const [category, setCategory] = useState('전체')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) })
    if (category !== '전체') params.set('category', category)
    if (search) params.set('search', search)
    api(`/posts?${params}`).then((data) => {
      setPosts(data.posts)
      setPagination(data.pagination)
      setError('')
    }).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false))
  }, [category, search, page])

  const selectCategory = (nextCategory) => {
    setLoading(true)
    setCategory(nextCategory)
    setPage(1)
  }

  const submitSearch = (event) => {
    event.preventDefault()
    setLoading(true)
    setSearch(searchInput.trim())
    setPage(1)
  }

  const changePage = (nextPage) => {
    setLoading(true)
    setPage(nextPage)
  }

  return <section className="section container board-page">
    <div className="page-heading"><div><span className="eyebrow">모두의 이야기</span><h1>게시판</h1><p>다양한 생각과 경험을 자유롭게 나눠 보세요.</p></div><Link to="/board/new" className="button">＋ 글 쓰기</Link></div>
    <div className="board-tools"><div className="category-tabs">{categories.map((item) => <button className={category === item ? 'active' : ''} type="button" key={item} onClick={() => selectCategory(item)}>{item}</button>)}</div><form className="search-box" onSubmit={submitSearch}><span>⌕</span><input type="search" aria-label="게시글 검색" placeholder="게시글 검색" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></form></div>
    {loading ? <p className="list-empty">게시글을 불러오는 중입니다.</p> : error ? <p className="list-error">{error}</p> : posts.length ? <div className="board-list">{posts.map((post) => <Link to={`/board/${post.id}`} className="board-item" key={post.id}><div className="board-item-main"><span className="tag">{post.category}</span><h2>{post.title}</h2><p>{post.excerpt}</p><div className="post-meta"><span>{post.author}</span><span>{formatDate(post.createdAt)}</span></div></div><div className="board-counts"><span>조회 {post.views}</span><span>좋아요 {post.likes}</span><span>싫어요 {post.dislikes}</span><span>댓글 {post.comments}</span></div></Link>)}</div> : <p className="list-empty">조건에 맞는 게시글이 없습니다.</p>}
    <nav className="pagination" aria-label="게시판 페이지"><button type="button" disabled={pagination.page <= 1} onClick={() => changePage(pagination.page - 1)}>←</button>{Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((number) => <button type="button" className={number === pagination.page ? 'active' : ''} key={number} onClick={() => changePage(number)}>{number}</button>)}<button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => changePage(pagination.page + 1)}>→</button></nav>
  </section>
}

export default BoardPage
