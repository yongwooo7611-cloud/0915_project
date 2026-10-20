import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/auth'
import { AttachmentEditor } from '../components/PostAttachments'

function CreatePostPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (uploading || submitting) return
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
        body: JSON.stringify({ category: form.get('category'), title: form.get('title'), content: form.get('content'), attachmentIds: attachments.map((file) => file.id) }),
      })
      navigate(`/board/${data.id}`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="section container editor-page"><div className="page-heading"><div><span className="eyebrow">새로운 이야기</span><h1>게시글 작성</h1><p>사진과 영상, 파일을 함께 첨부해 이야기를 나눠 보세요.</p></div></div><form className="editor-card form" onSubmit={handleSubmit}><label>카테고리<select name="category" defaultValue="" required><option value="" disabled>카테고리를 선택하세요</option><option>일상</option><option>질문</option><option>정보</option><option>취미</option><option>자유</option></select></label><label>제목<input name="title" type="text" placeholder="제목을 입력하세요" maxLength="80" required /></label><label>내용<textarea name="content" placeholder="여러분의 이야기를 들려주세요." rows="14" required /></label><AttachmentEditor attachments={attachments} setAttachments={setAttachments} onBusyChange={setUploading} disabled={submitting || !user} /><div className="editor-note">다른 사람의 개인정보나 저작권을 침해하는 파일은 첨부하지 마세요.</div>{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" className="button button-secondary" onClick={() => navigate(-1)} disabled={submitting || uploading}>취소</button><button type="submit" className="button" disabled={submitting || uploading}>{uploading ? '파일 업로드 중...' : submitting ? '등록 중...' : '게시하기'}</button></div></form></section>
}

export default CreatePostPage
