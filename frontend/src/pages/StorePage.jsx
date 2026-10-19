import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/auth'
import { initializeTossPayment } from '../payments'

const subscriptions = [
  { id: 'sprout', name: '새싹 멤버십', price: 4900, description: '가볍게 시작하는 모아의 첫 구독', benefits: ['매월 300 크레딧', '프로필 새싹 배지', '광고 없는 게시판'] },
  { id: 'forest', name: '숲 멤버십', price: 9900, description: '더 깊게 참여하는 모아의 프리미엄 구독', benefits: ['매월 800 크레딧', '프로필 숲 배지', '광고 없는 게시판', '멤버 전용 콘텐츠'] },
]

const creditPacks = [
  { id: 'credit-100', credits: 100, price: 1000, note: '필요할 때 가볍게' },
  { id: 'credit-550', credits: 550, price: 5000, note: '보너스 50 크레딧', featured: true },
  { id: 'credit-1200', credits: 1200, price: 10000, note: '보너스 200 크레딧' },
]

function formatWon(value) {
  return `${value.toLocaleString('ko-KR')}원`
}

function StorePage() {
  const { user } = useAuth()
  const [payment, setPayment] = useState(null)
  const [moduleState, setModuleState] = useState('loading')
  const [error, setError] = useState('')
  const [processingId, setProcessingId] = useState('')
  const [account, setAccount] = useState(null)

  useEffect(() => {
    let active = true
    const preparePayment = async () => {
      setModuleState('loading')
      setPayment(null)
      setAccount(null)
      setError('')
      const nextAccount = user ? await api('/payments/me') : null
      const instance = await initializeTossPayment(nextAccount?.customerKey || 'ANONYMOUS')
      if (!active) return
      setAccount(nextAccount)
      setPayment(instance)
      setModuleState('ready')
    }
    preparePayment().catch((paymentError) => {
      if (!active) return
      setError(paymentError.message)
      setModuleState('error')
    })
    return () => { active = false }
  }, [user])

  const requirePayment = () => {
    setError('')
    if (!user) {
      setError('결제를 진행하려면 먼저 로그인해 주세요.')
      return false
    }
    if (!payment) {
      setError('결제 모듈을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.')
      return false
    }
    return true
  }

  const subscribe = async (plan) => {
    if (!requirePayment()) return
    if (account?.subscription?.status === 'active') {
      setError('현재 구독을 먼저 해지한 후 새 멤버십을 등록해 주세요.')
      return
    }
    setProcessingId(plan.id)
    try {
      const { order } = await api('/payments/subscriptions/orders', {
        method: 'POST',
        body: JSON.stringify({ planId: plan.id }),
      })
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: order.amount },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/store/payment-result?type=subscription`,
        failUrl: `${window.location.origin}/store/payment-result?type=subscription&status=fail`,
        customerName: user.name,
        customerEmail: user.email,
        card: { flowMode: 'DEFAULT' },
      })
    } catch (paymentError) {
      if (paymentError.code !== 'USER_CANCEL') setError(paymentError.message || '구독 결제창을 열지 못했습니다.')
    } finally {
      setProcessingId('')
    }
  }

  const buyCredits = async (pack) => {
    if (!requirePayment()) return
    setProcessingId(pack.id)
    try {
      const { order } = await api('/payments/orders', {
        method: 'POST',
        body: JSON.stringify({ productId: pack.id }),
      })
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: order.amount },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/store/payment-result?type=credit`,
        failUrl: `${window.location.origin}/store/payment-result?type=credit&status=fail`,
        customerName: user.name,
        customerEmail: user.email,
        card: { flowMode: 'DEFAULT' },
      })
    } catch (paymentError) {
      if (paymentError.code !== 'USER_CANCEL') setError(paymentError.message || '크레딧 결제창을 열지 못했습니다.')
    } finally {
      setProcessingId('')
    }
  }

  const cancelSubscription = async () => {
    if (!window.confirm('현재 멤버십 이용을 종료할까요? 결제 환불은 프로필의 결제 내역에서 별도로 신청할 수 있습니다.')) return
    setProcessingId('cancel-subscription')
    setError('')
    try {
      const nextAccount = await api('/payments/subscriptions/cancel', { method: 'POST' })
      setAccount((current) => ({ ...current, ...nextAccount }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setProcessingId('')
    }
  }

  return <div className="store-page">
    <section className="store-hero"><div className="container store-hero-inner"><div><span className="eyebrow">MOA STORE</span><h1>마음을 나누는 만큼<br />더 풍성해지는 모아</h1><p>멤버십으로 꾸준한 혜택을 받고, 크레딧으로 원하는 순간에 모아를 더 즐겨보세요.</p></div><div className={`payment-module-state ${moduleState}`}><span aria-hidden="true">{moduleState === 'ready' ? '✓' : moduleState === 'error' ? '!' : '···'}</span><div><strong>{moduleState === 'ready' ? '결제 모듈 준비 완료' : moduleState === 'error' ? '결제 모듈 확인 필요' : '결제 모듈 연결 중'}</strong><small>{moduleState === 'ready' ? '토스페이먼츠 결제를 시작할 수 있어요.' : moduleState === 'error' ? error : '안전한 결제 환경을 준비하고 있어요.'}</small></div></div></div></section>

    {user && account && <section className="container store-account-summary"><div><span>보유 크레딧</span><strong><i>C</i>{account.creditBalance.toLocaleString('ko-KR')}</strong></div><div><span>현재 멤버십</span><strong>{account.subscription?.status === 'active' ? subscriptions.find((plan) => plan.id === account.subscription.planId)?.name : account.subscription?.status === 'canceled' ? '해지됨' : account.subscription?.status === 'expired' ? '이용기간 만료' : '이용 중인 멤버십 없음'}</strong>{account.subscription?.status === 'active' && <small>이용기간 종료일 {new Date(account.subscription.nextBillingAt).toLocaleDateString('ko-KR')} · 자동 갱신 없음</small>}</div>{account.subscription?.status === 'active' && <button type="button" className="text-button store-cancel-button" onClick={cancelSubscription} disabled={Boolean(processingId)}>{processingId === 'cancel-subscription' ? '해지 처리 중...' : '멤버십 해지'}</button>}</section>}

    <section className="section container store-section"><div className="store-section-heading"><div><span className="eyebrow">SUBSCRIPTION</span><h2>30일 동안 이어지는 멤버십</h2><p>크레딧 충전과 동일한 표준 결제창으로 결제하고 30일 동안 혜택을 이용해요.</p></div><span className="store-chip">자동 갱신 없음</span></div><div className="subscription-grid">{subscriptions.map((plan) => <article className={`subscription-card ${plan.id === 'forest' ? 'featured' : ''}`} key={plan.id}>{plan.id === 'forest' && <span className="recommend-badge">가장 많은 혜택</span>}<div><h3>{plan.name}</h3><p>{plan.description}</p></div><strong className="store-price">{formatWon(plan.price)}<small>/ 30일</small></strong><ul>{plan.benefits.map((benefit) => <li key={benefit}><span>✓</span>{benefit}</li>)}</ul><button type="button" className="button button-full" onClick={() => subscribe(plan)} disabled={moduleState === 'loading' || Boolean(processingId) || account?.subscription?.status === 'active'}>{processingId === plan.id ? '결제창 여는 중...' : account?.subscription?.status === 'active' && account.subscription.planId === plan.id ? '이용 중인 멤버십' : `${plan.name} 결제하기`}</button></article>)}</div></section>

    <section className="credit-section"><div className="section container"><div className="store-section-heading"><div><span className="eyebrow">CREDITS</span><h2>필요한 만큼 충전하는 크레딧</h2><p>크레딧은 모아의 특별 콘텐츠와 커뮤니티 기능에 사용할 수 있어요.</p></div><div className="credit-symbol" aria-hidden="true">C</div></div><div className="credit-grid">{creditPacks.map((pack) => <article className={`credit-card ${pack.featured ? 'featured' : ''}`} key={pack.id}>{pack.featured && <span className="credit-best">BEST</span>}<div className="credit-amount"><span>C</span><strong>{pack.credits.toLocaleString('ko-KR')}</strong></div><p>{pack.note}</p><strong>{formatWon(pack.price)}</strong><button type="button" className="button button-secondary button-full" onClick={() => buyCredits(pack)} disabled={moduleState === 'loading' || Boolean(processingId)}>{processingId === pack.id ? '결제창 여는 중...' : '충전하기'}</button></article>)}</div>{error && <div className="store-error" role="alert"><span>!</span><p>{error}</p>{!user && <Link to="/login">로그인하기 →</Link>}</div>}<p className="store-notice">결제 금액은 서버에서 검증하며, 토스페이먼츠 승인이 완료된 뒤에만 구독 활성화와 크레딧 적립이 처리됩니다.</p></div></section>
  </div>
}

export default StorePage
