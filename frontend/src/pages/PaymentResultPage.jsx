import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/auth'

function PaymentResultPage() {
  const [params] = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const started = useRef(false)
  const redirectFailed = params.get('status') === 'fail' || params.has('code')
  const type = params.get('type')
  const [state, setState] = useState(redirectFailed ? 'error' : 'processing')
  const [message, setMessage] = useState(redirectFailed ? params.get('message') || '결제 과정이 취소되었거나 오류가 발생했습니다.' : '토스페이먼츠 결제를 승인하고 있습니다.')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (redirectFailed || authLoading || started.current) return
    if (!user) {
      started.current = true
      queueMicrotask(() => {
        setState('error')
        setMessage('결제를 완료하려면 로그인 정보가 필요합니다. 다시 로그인한 후 시도해 주세요.')
      })
      return
    }
    started.current = true

    const approve = async () => {
      const data = type === 'subscription'
        ? await api('/payments/subscriptions/activate', {
            method: 'POST',
            body: JSON.stringify({ planId: params.get('plan'), authKey: params.get('authKey'), customerKey: params.get('customerKey') }),
          })
        : await api('/payments/confirm', {
            method: 'POST',
            body: JSON.stringify({ paymentKey: params.get('paymentKey'), orderId: params.get('orderId'), amount: Number(params.get('amount')) }),
          })
      setResult(data)
      setState('success')
      setMessage(type === 'subscription' ? '멤버십이 활성화되고 이번 달 크레딧이 적립됐습니다.' : '결제가 승인되고 크레딧이 적립됐습니다.')
    }
    approve().catch((approvalError) => {
      setState('error')
      setMessage(approvalError.message)
    })
  }, [authLoading, params, redirectFailed, type, user])

  const title = state === 'processing' ? '결제를 처리하고 있어요' : state === 'success' ? '결제가 완료됐어요' : '결제를 완료하지 못했어요'

  return <section className="auth-section container"><div className="auth-card payment-result-card">{state === 'processing' ? <span className="auth-spinner" aria-hidden="true" /> : <span className={`auth-status-icon ${state === 'error' ? 'error' : 'success'}`}>{state === 'error' ? '!' : '✓'}</span>}<span className="eyebrow">PAYMENT RESULT</span><h1>{title}</h1><p>{message}</p>{state === 'success' && result && <div className="payment-credit-result"><span>현재 보유 크레딧</span><strong>C {result.creditBalance?.toLocaleString('ko-KR')}</strong>{result.receiptUrl && <a href={result.receiptUrl} target="_blank" rel="noreferrer">영수증 보기 →</a>}</div>}<div className="payment-result-actions"><Link to="/store" className="button button-full">상점으로 돌아가기</Link><Link to="/" className="text-link">홈으로 이동</Link></div></div></section>
}

export default PaymentResultPage
