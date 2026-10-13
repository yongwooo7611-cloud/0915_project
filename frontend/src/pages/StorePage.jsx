import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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

function createOrderId(credits) {
  return `MOA-${crypto.randomUUID().replaceAll('-', '')}-${credits}`
}

function StorePage() {
  const { user } = useAuth()
  const [payment, setPayment] = useState(null)
  const [moduleState, setModuleState] = useState('loading')
  const [error, setError] = useState('')
  const [processingId, setProcessingId] = useState('')

  useEffect(() => {
    let active = true
    initializeTossPayment().then((instance) => {
      if (!active) return
      setPayment(instance)
      setModuleState('ready')
    }).catch((paymentError) => {
      if (!active) return
      setError(paymentError.message)
      setModuleState('error')
    })
    return () => { active = false }
  }, [])

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
    setProcessingId(plan.id)
    try {
      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/store/payment-result?type=subscription&plan=${plan.id}`,
        failUrl: `${window.location.origin}/store/payment-result?type=subscription&status=fail`,
        customerName: user.name,
        customerEmail: user.email,
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
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: pack.price },
        orderId: createOrderId(pack.credits),
        orderName: `모아 크레딧 ${pack.credits}개`,
        successUrl: `${window.location.origin}/store/payment-result?type=credit&credits=${pack.credits}`,
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

  return <div className="store-page">
    <section className="store-hero"><div className="container store-hero-inner"><div><span className="eyebrow">MOA STORE</span><h1>마음을 나누는 만큼<br />더 풍성해지는 모아</h1><p>멤버십으로 꾸준한 혜택을 받고, 크레딧으로 원하는 순간에 모아를 더 즐겨보세요.</p></div><div className={`payment-module-state ${moduleState}`}><span aria-hidden="true">{moduleState === 'ready' ? '✓' : moduleState === 'error' ? '!' : '···'}</span><div><strong>{moduleState === 'ready' ? '결제 모듈 준비 완료' : moduleState === 'error' ? '결제 모듈 확인 필요' : '결제 모듈 연결 중'}</strong><small>{moduleState === 'ready' ? '토스페이먼츠 테스트 결제를 시작할 수 있어요.' : moduleState === 'error' ? error : '안전한 결제 환경을 준비하고 있어요.'}</small></div></div></div></section>

    <section className="section container store-section"><div className="store-section-heading"><div><span className="eyebrow">SUBSCRIPTION</span><h2>매달 이어지는 멤버십</h2><p>카드를 한 번 등록하면 선택한 멤버십을 정기적으로 이용할 수 있어요.</p></div><span className="store-chip">언제든 해지 가능</span></div><div className="subscription-grid">{subscriptions.map((plan) => <article className={`subscription-card ${plan.id === 'forest' ? 'featured' : ''}`} key={plan.id}>{plan.id === 'forest' && <span className="recommend-badge">가장 많은 혜택</span>}<div><h3>{plan.name}</h3><p>{plan.description}</p></div><strong className="store-price">{formatWon(plan.price)}<small>/ 월</small></strong><ul>{plan.benefits.map((benefit) => <li key={benefit}><span>✓</span>{benefit}</li>)}</ul><button type="button" className="button button-full" onClick={() => subscribe(plan)} disabled={moduleState === 'loading' || Boolean(processingId)}>{processingId === plan.id ? '결제창 여는 중...' : `${plan.name} 시작하기`}</button></article>)}</div></section>

    <section className="credit-section"><div className="section container"><div className="store-section-heading"><div><span className="eyebrow">CREDITS</span><h2>필요한 만큼 충전하는 크레딧</h2><p>크레딧은 모아의 특별 콘텐츠와 커뮤니티 기능에 사용할 수 있어요.</p></div><div className="credit-symbol" aria-hidden="true">C</div></div><div className="credit-grid">{creditPacks.map((pack) => <article className={`credit-card ${pack.featured ? 'featured' : ''}`} key={pack.id}>{pack.featured && <span className="credit-best">BEST</span>}<div className="credit-amount"><span>C</span><strong>{pack.credits.toLocaleString('ko-KR')}</strong></div><p>{pack.note}</p><strong>{formatWon(pack.price)}</strong><button type="button" className="button button-secondary button-full" onClick={() => buyCredits(pack)} disabled={moduleState === 'loading' || Boolean(processingId)}>{processingId === pack.id ? '결제창 여는 중...' : '충전하기'}</button></article>)}</div>{error && <div className="store-error" role="alert"><span>!</span><p>{error}</p>{!user && <Link to="/login">로그인하기 →</Link>}</div>}<p className="store-notice">현재 화면은 프런트 결제창 연동 단계입니다. 실제 구독 활성화와 크레딧 지급은 서버 결제 승인 기능이 연결된 후 처리됩니다.</p></div></section>
  </div>
}

export default StorePage
