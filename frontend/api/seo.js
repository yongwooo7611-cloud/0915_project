import { ABOUT_SECTIONS, SITE_URL, pageSeo, structuredData } from '../src/seo.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const API_URL = (process.env.VITE_API_BASE_URL || 'https://xiovqwfbjavfxinpwirk.supabase.co/functions/v1/api').replace(/\/$/, '')
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c')
let shellCache

async function shell() {
  if (shellCache) return shellCache
  // Use this deployment's bundled template. Avoid a second network request to
  // our own domain, cold-start delays, and templates from a different deploy.
  const html = await readFile(join(process.cwd(), 'dist', 'seo-shell.html'), 'utf8')
  if (!html.includes('<div id="root"></div>')) throw new Error('Invalid HTML shell')
  shellCache = html
  return html
}

async function publicApi(path, signal) {
  const response = await fetch(`${API_URL}${path}`, { signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Public API unavailable: ${response.status}`)
  return response.json()
}

function contentHtml(path, data) {
  const posts = data?.posts || []
  const postLinks = posts.map((post) => `<article><h2><a href="/board/${Number(post.id)}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.excerpt)}</p></article>`).join('')
  const navigation = '<nav aria-label="주요 메뉴"><a href="/">홈</a> · <a href="/about">서비스 소개</a> · <a href="/board">게시판</a> · <a href="/store">상점</a></nav>'
  let content = ''
  if (path === '/') content = `<h1>사유는 문제를 깊이 생각하고 추리하는 인간의 이성작용이에요</h1><p>취향과 경험, 소소한 질문까지. 모아에서 편안하게 이야기를 시작해 보세요.</p><h2>새로운 이야기</h2>${postLinks}`
  else if (path === '/about') content = `<h1>모아 서비스 소개·이용 안내</h1><p>생각을 나누고, 사람을 잇는 커뮤니티</p>${ABOUT_SECTIONS.map((section) => `<section><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.text)}</p></section>`).join('')}`
  else if (path === '/board') content = `<h1>게시판</h1><p>다양한 생각과 경험을 자유롭게 나눠 보세요. 일상 · 질문 · 정보 · 취미 · 자유</p>${postLinks}`
  else if (path === '/store') content = '<h1>모아 멤버십·크레딧 상점</h1><p>30일 멤버십은 자동 갱신 없이 이용합니다.</p><h2>새싹 멤버십</h2><p>4,900원 / 30일 · 300 크레딧 포함</p><h2>숲 멤버십</h2><p>9,900원 / 30일 · 800 크레딧 포함</p><h2>크레딧 충전</h2><p>100 크레딧 1,000원 · 550 크레딧 5,000원 · 1,200 크레딧 10,000원</p><p>결제 내역, 영수증 및 취소·환불은 로그인 후 프로필에서 확인할 수 있습니다.</p>'
  else if (data?.post) {
    const post = data.post
    content = `<article><h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.category)} · ${escapeHtml(post.author)} · <time datetime="${escapeHtml(post.createdAt)}">${escapeHtml(post.createdAt)}</time></p>${String(post.content).split('\n').map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</article>`
  }
  else if (/^\/(admin|profile|auth)(\/|$)/.test(path) || ['/login', '/signup', '/board/new', '/store/payment-result'].includes(path) || /^\/board\/\d+\/edit$/.test(path)) content = '<h1>모아</h1><p>화면을 불러오는 중입니다.</p>'
  else content = '<h1>페이지를 찾을 수 없습니다</h1><p>주소를 확인하거나 게시판에서 다른 이야기를 찾아보세요.</p>'
  return `<div class="container section">${navigation}<main>${content}</main><footer><p>모아 — 생각을 나누고 사람을 잇는 커뮤니티</p></footer></div>`
}

export function renderHtml(template, path, data, index = true) {
  const seo = pageSeo(path, data?.post)
  seo.index = seo.index && index
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(seo.title)}</title>`)
  html = html.replace(/<meta\s+(?:name|property)="(?:description|robots|og:title|og:description|og:url|og:type|twitter:title|twitter:description)"[^>]*>/g, '')
  const tags = `<meta name="description" content="${escapeHtml(seo.description)}" />
<meta name="robots" content="${seo.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow, noarchive'}" />
<link rel="canonical" href="${SITE_URL}${escapeHtml(seo.path)}" />
<meta property="og:title" content="${escapeHtml(seo.title)}" />
<meta property="og:description" content="${escapeHtml(seo.description)}" />
<meta property="og:url" content="${SITE_URL}${escapeHtml(seo.path)}" />
<meta property="og:type" content="${seo.type}" />
<meta name="twitter:title" content="${escapeHtml(seo.title)}" />
<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`
  const dataJson = structuredData(seo, data?.post)
  html = html.replace('</head>', `${tags}${dataJson ? `<script id="seo-structured-data" type="application/ld+json">${safeJson(dataJson)}</script>` : ''}</head>`)
  return html.replace('<div id="root"></div>', `<div id="root">${contentHtml(path, data)}</div>`)
}

async function sitemap(response, signal) {
  const urls = ['/', '/about', '/board', '/store'].map((path) => `<url><loc>${SITE_URL}${path}</loc></url>`)
  // Query only the anonymous public endpoint; hidden/deleted posts are never included.
  let page = 1
  let totalPages = 1
  do {
    const data = await publicApi(`/posts?page=${page}`, signal)
    for (const post of data?.posts || []) {
      const timestamp = new Date(post.updatedAt || post.createdAt)
      urls.push(`<url><loc>${SITE_URL}/board/${Number(post.id)}</loc>${Number.isNaN(timestamp.getTime()) ? '' : `<lastmod>${timestamp.toISOString()}</lastmod>`}</url>`)
    }
    totalPages = data?.pagination?.totalPages || 1
    page += 1
  } while (page <= totalPages && page <= 500)
  response.setHeader('Content-Type', 'application/xml; charset=utf-8')
  response.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`)
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store')
  const path = String(request.query.path || '/').split('?')[0].replace(/\/$/, '') || '/'
  // A shared deadline covers all upstream calls, including sitemap pagination.
  // Search engines should receive a retryable response before a 10s timeout.
  const signal = AbortSignal.timeout(7000)
  try {
    if (path === '/sitemap.xml') return await sitemap(response, signal)
    const template = await shell()
    const isPost = /^\/board\/\d+$/.test(path)
    let data = null
    if (path === '/' || path === '/board') data = await publicApi('/posts?page=1', signal)
    else if (isPost) data = await publicApi(`/posts/${path.split('/')[2]}`, signal)
    const publicPage = ['/', '/about', '/board', '/store'].includes(path) || (isPost && data?.post && !data.post.hidden)
    if (!publicPage) response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
    const privatePage = /^\/(admin|profile|auth)(\/|$)/.test(path) || ['/login', '/signup', '/board/new', '/store/payment-result'].includes(path) || /^\/board\/\d+\/edit$/.test(path)
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.status(publicPage || privatePage ? 200 : 404).send(renderHtml(template, path, data, publicPage))
  } catch (error) {
    console.error('SEO rendering failed:', error.message)
    response.setHeader('X-Robots-Tag', 'noindex')
    response.setHeader('Retry-After', '60')
    response.status(503).send('서비스 연결을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.')
  }
}
