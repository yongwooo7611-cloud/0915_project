import assert from 'node:assert/strict'
const base = 'https://www.bodramdbo.shop'
const headers = process.argv.includes('--naver')
  ? { 'User-Agent': 'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)' }
  : {}
const paths = ['/', '/about', '/board', '/store', '/admin', '/admin/login', '/profile/payments', '/sitemap.xml', '/robots.txt', '/branding/favicon-32.png', '/branding/moa-og-v1.jpg', '/board/999999999']
const results = await Promise.allSettled(paths.map(async (path) => {
  const started = Date.now()
  const response = await fetch(base + path, { headers, signal: AbortSignal.timeout(10000) })
  const type = response.headers.get('content-type') || ''
  const body = type.includes('image') ? '' : await response.text()
  const robots = response.headers.get('x-robots-tag')
  console.log(JSON.stringify({ path, status: response.status, ms: Date.now() - started, type, robots, hasBody: body.includes('<main>'), hasSchema: body.includes('seo-structured-data') }))
  assert.equal(response.status, path === '/board/999999999' ? 404 : 200, path)
  if (['/', '/about', '/board', '/store'].includes(path)) {
    assert(body.includes('<main>'), `${path}: missing server HTML`)
    assert(body.includes('seo-structured-data'), `${path}: missing schema`)
    assert(!robots?.includes('noindex'), `${path}: public noindex`)
    assert(body.includes('moa-og-v1.jpg'), `${path}: missing OG image`)
  }
  if (path.startsWith('/admin') || path.startsWith('/profile')) {
    assert(robots?.includes('noindex'), `${path}: missing noindex header`)
    assert(body.includes('noindex, nofollow, noarchive'), `${path}: missing noindex HTML`)
  }
  if (path === '/sitemap.xml') {
    assert(type.includes('xml')); assert(!body.includes('/admin')); assert(!body.includes('/profile'))
    const postUrl = body.match(/<loc>(https:\/\/www\.bodramdbo\.shop\/board\/\d+)<\/loc>/)?.[1]
    if (postUrl) {
      const postResponse = await fetch(postUrl, { headers, signal: AbortSignal.timeout(10000) })
      const postHtml = await postResponse.text()
      assert.equal(postResponse.status, 200)
      assert(postHtml.includes('DiscussionForumPosting'))
      assert(postHtml.includes('<article><h1>'))
      console.log('Public post live HTML and discussion schema: passed')
    }
  }
  if (path === '/robots.txt') assert(body.includes(`${base}/sitemap.xml`))
  if (path.includes('/branding/')) assert(type.includes('image/'))
}))
const failed = results.filter((result) => result.status === 'rejected')
for (const result of failed) console.error(result.reason)
if (failed.length) process.exitCode = 1
