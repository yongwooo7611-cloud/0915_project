import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/auth'

function EditPostPage() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [post, setPost] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true })
      return
    }
    api(`/posts/${postId}/manage`).then((data) => setPost(data.post)).catch((requestError) => setError(requestError.message))
  }, [postId, user, navigate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')
    setSubmitting(true)
    try {
      await api(`/posts/${postId}`, {
        method: 'PUT',
        body: JSON.stringify({ category: form.get('category'), title: form.get('title'), content: form.get('content') }),
      })
      navigate('/profile')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!post) return <section className="empty-state container"><p>{error || '게시글을 불러오는 중입니다.'}</p>{error && <button type="button" className="button" onClick={() => navigate('/profile')}>프로필로</button>}</section>

  return <section className="section container editor-page"><div className="page-heading"><div><span className="eyebrow">나의 이야기</span><h1>게시글 수정</h1><p>작성한 게시글의 내용을 변경합니다.</p></div></div><form className="editor-card form" onSubmit={handleSubmit}><label>카테고리<select name="category" defaultValue={post.category} required><option>일상</option><option>질문</option><option>정보</option><option>취미</option><option>자유</option></select></label><label>제목<input name="title" type="text" defaultValue={post.title} maxLength="80" required /></label><label>내용<textarea name="content" defaultValue={post.content} rows="14" required /></label>{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" className="button button-secondary" onClick={() => navigate(-1)}>취소</button><button type="submit" className="button" disabled={submitting}>{submitting ? '저장 중...' : '수정하기'}</button></div></form></section>
}

export default EditPostPage
