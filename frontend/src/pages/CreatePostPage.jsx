import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/auth'

function CreatePostPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!user) {
      navigate('/login')
      return
    }
    const form = new FormData(event.currentTarget)
    setError('')
    setSubmitting(true)
    try {
      const data = await api('/posts', {
        method: 'POST',
        body: JSON.stringify({ category: form.get('category'), title: form.get('title'), content: form.get('content') }),
      })
      navigate(`/board/${data.id}`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="section container editor-page"><div className="page-heading"><div><span className="eyebrow">새로운 이야기</span><h1>게시글 작성</h1><p>나누고 싶은 이야기를 편안하게 적어 주세요.</p></div></div><form className="editor-card form" onSubmit={handleSubmit}><label>카테고리<select name="category" defaultValue="" required><option value="" disabled>카테고리를 선택하세요</option><option>일상</option><option>질문</option><option>정보</option><option>취미</option><option>자유</option></select></label><label>제목<input name="title" type="text" placeholder="제목을 입력하세요" maxLength="80" required /></label><label>내용<textarea name="content" placeholder="여러분의 이야기를 들려주세요." rows="14" required /></label><div className="editor-note">서로를 배려하는 표현을 사용해 주세요.</div>{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" className="button button-secondary" onClick={() => navigate(-1)}>취소</button><button type="submit" className="button" disabled={submitting}>{submitting ? '등록 중...' : '게시하기'}</button></div></form></section>
}

export default CreatePostPage
