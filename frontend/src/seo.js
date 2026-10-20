export const SITE_URL = 'https://www.bodramdbo.shop'
export const SITE_NAME = '모아'
export const SITE_DESCRIPTION = '생각을 나누고 사람을 잇는 모아. 일상의 이야기와 관심사를 함께 나누는 따뜻한 커뮤니티입니다.'
export const OG_IMAGE = `${SITE_URL}/branding/moa-og-v1.jpg`
export const ABOUT_SECTIONS = [
  { title: '모아는 어떤 서비스인가요?', text: '모아는 일상, 질문, 정보, 취미, 자유 주제로 생각과 경험을 나누는 한국어 커뮤니티입니다. 공개 게시글을 읽고, 로그인 후 글과 댓글을 작성할 수 있습니다.' },
  { title: '어떻게 참여하나요?', text: '게시판에서 이야기를 둘러본 뒤 회원가입 또는 카카오 로그인으로 참여할 수 있습니다. 자신의 글과 문의 내역은 프로필에서 확인할 수 있습니다.' },
  { title: '멤버십과 크레딧은 어디서 확인하나요?', text: '상점에서 30일 멤버십과 크레딧 상품을 확인할 수 있습니다. 현재 멤버십은 자동 갱신 없이 결제한 기간 동안 이용하는 방식입니다. 구매 내역, 영수증, 취소·환불 기능은 프로필의 결제 내역에서 확인할 수 있습니다.' },
  { title: '도움이 필요할 때는 어떻게 하나요?', text: '로그인 후 프로필의 문의하기를 이용해 주세요. 부적절한 게시글이나 댓글은 해당 콘텐츠의 신고 기능으로 접수할 수 있습니다.' },
]

export function pageSeo(pathname, post) {
  const path = pathname.replace(/\/$/, '') || '/'
  const pages = {
    '/': { title: '모아 | 마음을 나누는 따뜻한 커뮤니티', description: SITE_DESCRIPTION },
    '/board': { title: '게시판 | 모아', description: '일상, 질문, 정보, 취미와 자유로운 이야기를 나누는 모아 게시판에서 다양한 생각과 경험을 만나보세요.' },
    '/store': { title: '멤버십·크레딧 상점 | 모아', description: '모아의 30일 멤버십과 크레딧 상품을 확인하세요. 자동 갱신 여부, 가격과 결제 내역을 확인하고 이용할 수 있습니다.' },
    '/about': { title: '서비스 소개·이용 안내 | 모아', description: '모아의 서비스 소개, 커뮤니티 참여 방법, 멤버십·크레딧과 고객지원 이용 방법을 안내합니다.' },
  }
  if (/^\/board\/\d+$/.test(path) && post) return {
    path, title: `${post.title} | 모아`, description: String(post.content || post.excerpt || '').replace(/\s+/g, ' ').slice(0, 160),
    index: !post.hidden, type: 'article',
  }
  if (pages[path]) return { path, ...pages[path], index: true, type: 'website' }
  return { path, title: '모아', description: SITE_DESCRIPTION, index: false, type: 'website' }
}

export function structuredData(seo, post) {
  if (!seo.index) return null
  const graph = [
    { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/branding/favicon-192.png` },
    { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: SITE_NAME, url: SITE_URL, inLanguage: 'ko-KR', description: SITE_DESCRIPTION, publisher: { '@id': `${SITE_URL}/#organization` } },
    { '@type': seo.path === '/about' ? 'AboutPage' : seo.path === '/board' ? 'CollectionPage' : 'WebPage', '@id': `${SITE_URL}${seo.path}#webpage`, url: `${SITE_URL}${seo.path}`, name: seo.title, description: seo.description, inLanguage: 'ko-KR', isPartOf: { '@id': `${SITE_URL}/#website` } },
  ]
  if (post && seo.index) graph.push({
    '@type': 'DiscussionForumPosting', '@id': `${SITE_URL}${seo.path}#post`, headline: post.title,
    text: post.content, datePublished: post.createdAt, dateModified: post.updatedAt || post.createdAt,
    author: { '@type': 'Person', name: post.author || '모아 회원' },
    mainEntityOfPage: `${SITE_URL}${seo.path}`, url: `${SITE_URL}${seo.path}`, inLanguage: 'ko-KR',
  })
  return { '@context': 'https://schema.org', '@graph': graph }
}
