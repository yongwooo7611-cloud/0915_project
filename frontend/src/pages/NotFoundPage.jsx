import { Link } from 'react-router-dom'

function NotFoundPage() {
  return <section className="empty-state container"><span className="eyebrow">404</span><h1>페이지를 찾을 수 없어요.</h1><p>주소가 올바른지 다시 확인해 주세요.</p><Link to="/" className="button">홈으로 돌아가기</Link></section>
}

export default NotFoundPage
