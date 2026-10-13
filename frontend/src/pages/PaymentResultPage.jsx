import { Link, useSearchParams } from 'react-router-dom'

function PaymentResultPage() {
  const [params] = useSearchParams()
  const failed = params.get('status') === 'fail' || params.has('code')
  const type = params.get('type')
  const title = failed ? '결제를 완료하지 못했어요' : '결제 인증을 확인했어요'
  const description = failed
    ? params.get('message') || '결제 과정이 취소되었거나 오류가 발생했습니다. 다시 시도해 주세요.'
    : type === 'subscription'
      ? '카드 등록 정보가 전달되었습니다. 실제 구독 활성화에는 서버 승인이 필요합니다.'
      : '결제 정보가 전달되었습니다. 실제 크레딧 지급에는 서버 승인이 필요합니다.'

  return <section className="auth-section container"><div className="auth-card payment-result-card"><span className={`auth-status-icon ${failed ? 'error' : 'success'}`}>{failed ? '!' : '✓'}</span><span className="eyebrow">PAYMENT RESULT</span><h1>{title}</h1><p>{description}</p><div className="payment-result-actions"><Link to="/store" className="button button-full">상점으로 돌아가기</Link><Link to="/" className="text-link">홈으로 이동</Link></div></div></section>
}

export default PaymentResultPage
