import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import Modal from '../components/Modal'
import { useAuth } from '../context/auth'

const statusLabels = {
  pending: '결제 대기',
  completed: '승인 완료',
  failed: '승인 실패',
  canceled: '취소·환불 완료',
}

const membershipNames = { sprout: '새싹 멤버십', forest: '숲 멤버십' }

const creditReasonLabels = {
  credit_purchase: '크레딧 구매 적립',
  subscription_payment: '멤버십 크레딧 적립',
  payment_refund: '결제 취소 회수',
}

function creditReason(reason) {
  if (reason?.startsWith('admin_grant: ')) return `관리자 지급 · ${reason.slice(13)}`
  if (reason?.startsWith('admin_revoke: ')) return `관리자 회수 · ${reason.slice(14)}`
  return creditReasonLabels[reason] || reason || '크레딧 변경'
}

function won(value) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`
}

function dateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

function PaymentHistoryPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [account, setAccount] = useState(null)
  const [payments, setPayments] = useState([])
  const [creditTransactions, setCreditTransactions] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      navigate('/login', { replace: true })
      return
    }
    Promise.all([api('/payments/me'), api('/payments/history')]).then(([accountData, historyData]) => {
      setAccount(accountData)
      setPayments(historyData.payments)
      setCreditTransactions(historyData.creditTransactions || [])
    }).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false))
  }, [authLoading, navigate, user])

  const refundPayment = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setProcessing(true)
    setError('')
    try {
      const data = await api(`/payments/orders/${selected.orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: form.get('reason') }),
      })
      setPayments((current) => current.map((payment) => payment.orderId === data.payment.orderId ? data.payment : payment))
      setAccount((current) => ({ ...current, creditBalance: data.creditBalance }))
      const historyData = await api('/payments/history')
      setCreditTransactions(historyData.creditTransactions || [])
      setSelected(null)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setProcessing(false)
    }
  }

  const cancelSubscription = async () => {
    if (!window.confirm('구독을 해지할까요? 다음 결제를 위한 자동결제 수단이 삭제됩니다.')) return
    setProcessing(true)
    setError('')
    try {
      const data = await api('/payments/subscriptions/cancel', { method: 'POST' })
      setAccount((current) => ({ ...current, ...data }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setProcessing(false)
    }
  }

  if (authLoading || loading) return <section className="empty-state container"><p>결제 내역을 불러오는 중입니다.</p></section>

  const activeSubscription = account?.subscription?.status === 'active'
  return <section className="section container payment-history-page">{selected && <Modal title="결제 취소 및 환불" onClose={() => !processing && setSelected(null)}><form className="form" onSubmit={refundPayment}><div className="refund-summary"><span>{selected.orderName}</span><strong>{won(selected.amount)}</strong><p>결제를 전액 취소하고 지급된 크레딧 {selected.credits.toLocaleString('ko-KR')}개를 회수합니다. 크레딧을 이미 사용했다면 취소할 수 없습니다.</p></div><label>취소 사유<textarea name="reason" rows="4" maxLength="200" defaultValue="고객 요청으로 결제 취소" required /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setSelected(null)} disabled={processing}>돌아가기</button><button type="submit" className="button button-danger" disabled={processing}>{processing ? '환불 처리 중...' : '전액 취소·환불'}</button></div></form></Modal>}<header className="payment-history-header"><div><Link to="/profile" className="text-link">← 프로필로 돌아가기</Link><span className="eyebrow">PAYMENT HISTORY</span><h1>결제 및 이용 내역</h1><p>승인 상태와 환불 내역을 확인하고 영수증을 열어볼 수 있습니다.</p></div><Link to="/store" className="button">상점으로 이동</Link></header>{error && !selected && <p className="list-error">{error}</p>}<div className="payment-account-grid"><article><span>보유 크레딧</span><strong><i>C</i>{(account?.creditBalance || 0).toLocaleString('ko-KR')}</strong></article><article><span>현재 구독</span><strong>{activeSubscription ? membershipNames[account.subscription.planId] || account.subscription.planId : '이용 중인 구독 없음'}</strong>{activeSubscription && <><small>이용기간 종료일 {new Date(account.subscription.nextBillingAt).toLocaleDateString('ko-KR')}</small><button type="button" className="text-button" onClick={cancelSubscription} disabled={processing}>{processing ? '처리 중...' : '구독 해지'}</button></>}</article></div><div className="section-heading compact payment-list-heading"><div><span className="eyebrow">TRANSACTIONS</span><h2>결제 내역</h2></div><span>최근 100건</span></div>{payments.length ? <div className="payment-history-list">{payments.map((payment) => <article className="payment-history-row" key={payment.orderId}><div className="payment-history-main"><div><span className={`payment-status ${payment.status}`}>{statusLabels[payment.status] || payment.status}</span><small>{payment.kind === 'subscription' ? '구독 결제' : '크레딧 충전'}</small></div><h3>{payment.orderName}</h3><p>{payment.method || '결제수단 확인 전'} · 주문번호 {payment.orderId}</p>{payment.status === 'canceled' && <p className="payment-cancel-note">{payment.cancelReason} · {dateTime(payment.canceledAt)}</p>}</div><div className="payment-history-amount"><strong>{won(payment.amount)}</strong><span>{payment.status === 'canceled' ? `환불 ${won(payment.canceledAmount)}` : dateTime(payment.approvedAt || payment.createdAt)}</span></div><div className="payment-history-actions">{payment.receiptUrl && <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="button button-small button-secondary">영수증 보기</a>}{payment.canCancel && <button type="button" className="button button-small button-danger" onClick={() => { setError(''); setSelected(payment) }}>취소·환불</button>}{payment.kind === 'subscription' && payment.status === 'completed' && <small>구독 결제 환불은 문의하기를 이용해 주세요.</small>}</div></article>)}</div> : <div className="payment-empty"><strong>아직 결제 내역이 없습니다.</strong><p>상점에서 멤버십을 시작하거나 크레딧을 충전해 보세요.</p><Link to="/store" className="button button-small">상점 둘러보기</Link></div>}<div className="section-heading compact payment-list-heading"><div><span className="eyebrow">CREDIT LEDGER</span><h2>크레딧 이용 내역</h2></div><span>최근 100건</span></div>{creditTransactions.length ? <div className="credit-ledger-list">{creditTransactions.map((transaction) => <article key={transaction.id}><div><strong>{creditReason(transaction.reason)}</strong><span>{dateTime(transaction.createdAt)}</span></div><div className={transaction.amount > 0 ? 'credit-plus' : 'credit-minus'}><strong>{transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('ko-KR')} C</strong>{transaction.balanceAfter != null && <span>처리 후 {transaction.balanceAfter.toLocaleString('ko-KR')} C</span>}</div></article>)}</div> : <p className="list-empty">크레딧 이용 내역이 없습니다.</p>}</section>
}

export default PaymentHistoryPage
