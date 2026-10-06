import { useState } from 'react'
import { api } from '../api'
import Modal from './Modal'

const reasons = [
  ['spam', '스팸 또는 광고'],
  ['abuse', '욕설 또는 괴롭힘'],
  ['obscene', '음란하거나 부적절한 내용'],
  ['privacy', '개인정보 노출'],
  ['other', '기타'],
]

function ReportModal({ target, onClose }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)

  const submitReport = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setError('')
    try {
      await api('/reports', {
        method: 'POST',
        body: JSON.stringify({ targetType: target.type, targetId: target.id, reason: form.get('reason'), details: form.get('details') }),
      })
      setComplete(true)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <Modal title="콘텐츠 신고" onClose={onClose}>{complete ? <div className="modal-complete"><span>✓</span><h3>신고가 접수되었습니다.</h3><p>관리자가 내용을 확인한 뒤 필요한 조치를 진행합니다.</p><button type="button" className="button" onClick={onClose}>확인</button></div> : <form className="form" onSubmit={submitReport}><div className="report-target"><strong>신고 대상</strong><p>{target.label}</p></div><label>신고 사유<select name="reason" defaultValue="" required><option value="" disabled>사유를 선택해 주세요</option>{reasons.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>상세 내용<textarea name="details" rows="5" maxLength="2000" placeholder="신고 사유를 구체적으로 작성해 주세요." required /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>취소</button><button type="submit" className="button button-danger" disabled={submitting}>{submitting ? '접수 중...' : '신고 접수'}</button></div></form>}</Modal>
}

export default ReportModal
