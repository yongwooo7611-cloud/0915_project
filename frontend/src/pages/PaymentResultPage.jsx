import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/auth'
import { paymentErrorMessage } from '../payments'

function PaymentResultPage() {
  const [params] = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const started = useRef(false)
  const redirectFailed = params.get('status') === 'fail' || params.has('code')
  const type = params.get('type')
  const [state, setState] = useState(redirectFailed ? 'error' : 'processing')
  const [message, setMessage] = useState(redirectFailed ? paymentErrorMessage({ code: params.get('code') }) : '안전하게 결제 결과를 확인하고 있습니다.')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (authLoading || started.current) return
    if (!user) {
      started.current = true
      queueMicrotask(() => {
        setState('error')
        setMessage('결제를 완료하려면 로그인 정보가 필요합니다. 다시 로그인한 후 시도해 주세요.')
      })
      return
    }
    started.current = true

    if (redirectFailed) {
      const orderId = params.get('orderId')
      if (orderId) api('/payments/fail', {
        method: 'POST',
        body: JSON.stringify({ orderId, code: params.get('code') || 'PAYMENT_FAILED' }),
      }).catch(() => {})
      return
    }

    const approve = async () => {
      const data = await api('/payments/confirm', {
        method: 'POST',
        body: JSON.stringify({ paymentKey: params.get('paymentKey'), orderId: params.get('orderId'), amount: Number(params.get('amount')) }),
      })
      setResult(data)
      setState('success')
      setMessage(type === 'subscription' ? '멤버십 결제가 완료되었습니다. 30일 이용 혜택과 크레딧이 적용됐습니다.' : '크레딧 결제가 완료되었습니다. 구매한 크레딧이 바로 적립됐습니다.')
    }
    approve().catch((approvalError) => {
      setState('error')
      setMessage(paymentErrorMessage(approvalError, '결제 승인 결과를 확인하지 못했습니다. 잠시 후 프로필의 결제 내역을 확인해 주세요.'))
    })
  }, [authLoading, params, redirectFailed, type, user])

  const isSubscription = type === 'subscription'
  const title = state === 'processing'
    ? isSubscription ? '멤버십 결제를 확인하고 있습니다' : '크레딧 결제를 확인하고 있습니다'
    : state === 'success'
      ? isSubscription ? '멤버십 결제가 완료되었습니다' : '크레딧 충전이 완료되었습니다'
      : isSubscription ? '멤버십 결제를 완료하지 못했습니다' : '크레딧 결제를 완료하지 못했습니다'

  return <section className="auth-section container"><div className="auth-card payment-result-card">{state === 'processing' ? <span className="auth-spinner" aria-hidden="true" /> : <span className={`auth-status-icon ${state === 'error' ? 'error' : 'success'}`}>{state === 'error' ? '!' : '✓'}</span>}<span className="eyebrow">PAYMENT RESULT</span><h1>{title}</h1><p>{message}</p>{state === 'success' && result && <div className="payment-credit-result">{isSubscription && result.subscription ? <><span>멤버십 이용기간</span><strong>{new Date(result.subscription.nextBillingAt).toLocaleDateString('ko-KR')}까지</strong><span>{result.credited?.toLocaleString('ko-KR')} C 지급 완료</span></> : <><span>충전된 크레딧</span><strong>+{result.credited?.toLocaleString('ko-KR')} C</strong></>}<span>현재 잔액 {result.creditBalance?.toLocaleString('ko-KR')} C</span>{result.receiptUrl && <a href={result.receiptUrl} target="_blank" rel="noreferrer">영수증 확인 →</a>}</div>}<div className="payment-result-actions">{state === 'success' && <Link to="/profile/payments" className="button button-full">결제 내역 확인</Link>}<Link to="/store" className={state === 'success' ? 'text-link' : 'button button-full'}>상점으로 돌아가기</Link><Link to="/" className="text-link">홈으로 이동</Link></div></div></section>
}

export default PaymentResultPage
