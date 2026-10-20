import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { requireSupabase } from '../supabase'

const FILE_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.pdf,.txt,.zip'
const allowed = new Set(FILE_ACCEPT.split(',').map((extension) => extension.slice(1)))
const fileSize = (size) => Number(size) < 1024 * 1024 ? `${Math.ceil(Number(size) / 1024)} KB` : `${(Number(size) / 1024 / 1024).toFixed(1)} MB`

export function AttachmentEditor({ attachments, setAttachments, onBusyChange, disabled }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const staged = useRef(new Set())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const stagedFiles = staged.current
    return () => {
      mounted.current = false
      // The API refuses to delete attachments once they belong to a saved post.
      for (const id of stagedFiles) api(`/attachments/${id}`, { method: 'DELETE' }).catch(() => {})
    }
  }, [])

  const chooseFiles = async (event) => {
    const files = [...event.target.files]
    event.target.value = ''
    if (!files.length) return
    setError('')
    if (attachments.length + files.length > 10) { setError('파일은 최대 10개까지 첨부할 수 있습니다.'); return }
    if (attachments.reduce((sum, file) => sum + Number(file.size), 0) + files.reduce((sum, file) => sum + file.size, 0) > 200 * 1024 * 1024) { setError('첨부파일 전체 크기는 200MB까지 가능합니다.'); return }
    for (const file of files) {
      const extension = file.name.split('.').at(-1).toLowerCase()
      const max = ['mp4', 'webm', 'mov'].includes(extension) ? 50 : 10
      if (!allowed.has(extension) || !file.size || file.size > max * 1024 * 1024) { setError(`${file.name}: 지원 형식과 파일당 용량 제한을 확인해 주세요.`); return }
    }
    setBusy(true); onBusyChange(true)
    try {
      for (const file of files) {
        setMessage(`${file.name} 업로드 중…`)
        const reservation = await api('/attachments/uploads', { method: 'POST', body: JSON.stringify({ name: file.name, size: file.size }) })
        staged.current.add(reservation.id)
        try {
          const upload = await requireSupabase().storage.from(reservation.bucket).uploadToSignedUrl(reservation.path, reservation.token, file.slice(0, file.size, reservation.mime), { contentType: reservation.mime })
          if (upload.error) throw upload.error
          const completed = await api(`/attachments/${reservation.id}/complete`, { method: 'POST' })
          if (!mounted.current) { await api(`/attachments/${reservation.id}`, { method: 'DELETE' }); return }
          setAttachments((current) => [...current, completed.attachment])
        } catch (uploadError) {
          await api(`/attachments/${reservation.id}`, { method: 'DELETE' }).catch(() => {})
          staged.current.delete(reservation.id)
          throw uploadError
        }
      }
      setMessage('파일 업로드가 완료됐습니다. 게시글을 저장하면 첨부됩니다.')
    } catch (uploadError) {
      if (mounted.current) { setError(uploadError.message || '파일을 업로드하지 못했습니다.'); setMessage('') }
    } finally {
      if (mounted.current) { setBusy(false); onBusyChange(false) }
    }
  }

  const removeFile = async (file) => {
    setError('')
    setBusy(true); onBusyChange(true)
    try {
      if (staged.current.has(file.id)) {
        await api(`/attachments/${file.id}`, { method: 'DELETE' })
        staged.current.delete(file.id)
      }
      setAttachments((current) => current.filter((item) => item.id !== file.id))
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy(false); onBusyChange(false) }
  }

  return <section className="attachment-editor" aria-label="게시글 첨부파일"><div className="attachment-heading"><strong>사진·영상·파일 첨부</strong><span>{attachments.length} / 10개</span></div><p>이미지·PDF·TXT·ZIP은 10MB, MP4·WebM·MOV 영상은 50MB까지 가능합니다. 전체 200MB 이내로 첨부해 주세요.</p><label className="attachment-picker">파일 선택<input type="file" accept={FILE_ACCEPT} multiple onChange={chooseFiles} disabled={disabled || busy} /></label>{attachments.length > 0 && <ul className="attachment-editor-list">{attachments.map((file) => <li key={file.id}><span>{file.mime.startsWith('image/') ? '사진' : file.mime.startsWith('video/') ? '영상' : '파일'}</span><strong>{file.name}</strong><small>{fileSize(file.size)}</small><button type="button" onClick={() => removeFile(file)} disabled={disabled || busy} aria-label={`${file.name} 첨부 제거`}>제거</button></li>)}</ul>}{message && <p role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}</section>
}

export default function PostAttachments({ attachments = [], onRefresh }) {
  if (!attachments.length) return null
  return <section className="post-attachments" aria-label="첨부파일"><div className="attachment-heading"><h2>첨부파일 <small>{attachments.length}개</small></h2>{onRefresh && <button type="button" className="text-link" onClick={onRefresh}>파일 링크 새로고침</button>}</div><p className="attachment-help">미리보기가 만료되면 파일 링크를 새로고침해 주세요.</p>{attachments.map((file) => <figure className="post-attachment" key={file.id}>{file.mime.startsWith('image/') && <a href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={file.name} loading="lazy" /></a>}{file.mime.startsWith('video/') && <video src={file.url} controls preload="metadata" playsInline aria-label={file.name} />}<figcaption><span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span><a href={file.downloadUrl} target="_blank" rel="noreferrer" className="button button-small button-secondary">다운로드</a></figcaption></figure>)}</section>
}
