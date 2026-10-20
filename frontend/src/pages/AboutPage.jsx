import { Link } from 'react-router-dom'
import { ABOUT_SECTIONS } from '../seo'

export default function AboutPage() {
  return <section className="section container detail-page"><article className="article-card"><header><span className="eyebrow">ABOUT MOA</span><h1>모아 서비스 소개·이용 안내</h1><p>생각을 나누고, 사람을 잇는 커뮤니티</p></header><div className="article-content">{ABOUT_SECTIONS.map((section) => <section key={section.title}><h2>{section.title}</h2><p>{section.text}</p></section>)}</div><nav className="hero-actions" aria-label="서비스 바로가기"><Link to="/board" className="button">게시판 둘러보기</Link><Link to="/store" className="button button-secondary">멤버십·크레딧 확인</Link></nav></article></section>
}
