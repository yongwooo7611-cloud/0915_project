import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../api'

async function request(path = '', options = {}) {
  const response = await fetch(apiUrl(`/admin/backups${path}`), { ...options, headers: { Authorization: `Bearer ${localStorage.getItem('moa_admin_token')}`, 'Content-Type': 'application/json' } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '백업 요청에 실패했습니다.')
  return data
}
const labels = { queued: '대기', running: '진행 중', completed: '완료', failed: '실패', deleting: '정리 중', deleted: '보관 종료' }
function localDate(value) {
  const date = new Date(value)
  return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 16)
}

export default function AdminBackups() {
  const [data, setData] = useState({ settings: null, jobs: [] })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [downloads, setDownloads] = useState({})
  const load = useCallback(async () => {
    try { setData(await request()); setError('') } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => {
    const initial = window.setTimeout(load, 0)
    const timer = window.setInterval(load, 15000)
    return () => { window.clearTimeout(initial); window.clearInterval(timer) }
  }, [load])
  async function run(action) {
    setBusy(true); setMessage(''); setError('')
    try { await action(); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    void run(async () => {
      const result = await request('/settings', { method: 'PUT', body: JSON.stringify({ enabled: form.has('enabled'), include_storage: form.has('include_storage'), interval_hours: Number(form.get('interval_hours')), retain_count: Number(form.get('retain_count')), next_run_at: new Date(`${form.get('next_run_at')}:00+09:00`).toISOString() }) })
      setMessage(result.message)
    })
  }
  async function getDownloads(id) {
    const result = await request(`/${id}/downloads`)
    setDownloads(previous => ({ ...previous, [id]: result.downloads }))
  }
  return <section className="admin-backups admin-account-form">
    <div className="admin-setting-heading"><h3>서비스 데이터 백업</h3><p>DB와 Supabase Storage를 비공개 백업 버킷에 보관합니다. 예약은 서버에서 실행되며 화면을 닫아도 계속됩니다.</p></div>
    <p>DB 파일은 AES-256-GCM으로 암호화됩니다. 소스 코드는 GitHub, 환경 변수·외부 결제 설정은 별도로 보관해야 합니다. 시점 복구(PITR)를 대체하지 않습니다.</p>
    {error && <p className="admin-error" role="alert">{error}</p>}{message && <p className="admin-success" role="status">{message}</p>}
    {data.settings && <form key={data.settings.updated_at} onSubmit={save}>
      <div className="admin-account-grid">
        <label className="admin-check"><input name="enabled" type="checkbox" defaultChecked={data.settings.enabled} /> 예약 백업 사용</label>
        <label className="admin-check"><input name="include_storage" type="checkbox" defaultChecked={data.settings.include_storage} /> Storage 파일 포함</label>
        <label>실행 간격<select name="interval_hours" defaultValue={data.settings.interval_hours}>{[1,6,12,24,168].map(hours => <option key={hours} value={hours}>{hours === 168 ? '매주' : `${hours}시간마다`}</option>)}</select></label>
        <label>다음 실행 (한국 시간)<input name="next_run_at" type="datetime-local" defaultValue={localDate(data.settings.next_run_at)} required /></label>
        <label>성공 백업 보관 개수<input name="retain_count" type="number" min="1" max="30" defaultValue={data.settings.retain_count} required /></label>
      </div>
      <p>예약 시간 이후 약 1분 내에 시작합니다. 파일은 분할 복사하며, 초과된 과거 성공 백업만 자동 정리합니다. 저장 용량·요금이 발생할 수 있습니다.</p>
      <button disabled={busy} type="submit">설정 저장</button>{' '}<button disabled={busy || data.jobs.some(j => ['queued','running'].includes(j.status))} type="button" onClick={() => void run(async () => setMessage((await request('', { method: 'POST' })).message))}>지금 백업</button>
    </form>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>생성 시간</th><th>종류</th><th>상태</th><th>Storage 파일</th><th>다운로드</th></tr></thead><tbody>{data.jobs.map(job => <tr key={job.id}>
      <td>{new Date(job.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}<small>{job.id}</small></td><td>{job.trigger === 'manual' ? '수동' : '예약'}</td><td>{labels[job.status]}{job.error_message && <small>{job.error_message}</small>}</td><td>{job.include_storage ? `${job.processed_files} / ${job.total_files}` : '제외'}</td>
      <td>{job.status === 'completed' && <><button type="button" disabled={busy} onClick={() => void run(() => getDownloads(job.id))}>링크 발급</button>{downloads[job.id]?.map(file => <p key={file.name}><a href={file.url} target="_blank" rel="noreferrer">{file.name}</a></p>)}</>}</td>
    </tr>)}</tbody></table>{!data.jobs.length && <p>백업 이력이 없습니다.</p>}</div>
    <p>다운로드 링크는 60초간 유효합니다. 전체 파일 내려받기·복호화는 저장소의 BACKUP.md 안내를 따르세요. 암호화 키는 브라우저에 표시하지 않습니다.</p>
  </section>
}
