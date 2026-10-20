import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import handler, { renderHtml } from '../api/seo.js'

const template = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const post = { id: 1, title: '<script>unsafe</script>', content: '공개 본문 </script><script>alert(1)</script>', author: '작성자', createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', hidden: false }
const html = renderHtml(template, '/board/1', { post })
assert(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'))
assert(!html.includes('<script>alert(1)</script>'))
const data = JSON.parse(html.match(/<script id="seo-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
assert.equal(data['@graph'].at(-1)['@type'], 'DiscussionForumPosting')
assert.equal(data['@graph'].at(-1).text, post.content)

globalThis.fetch = async (url, options) => {
  assert(options?.signal instanceof AbortSignal, 'All upstream reads must share a bounded deadline')
  assert(!String(url).includes('bodramdbo.shop'), 'The template must not require a self-request')
  if (String(url).endsWith('/posts/1')) return Response.json({ post })
  if (String(url).endsWith('/posts/2')) return new Response('{}', { status: 404 })
  if (String(url).includes('/posts?page=')) return Response.json({ posts: [post], pagination: { totalPages: 1 } })
  throw new Error(`Unexpected network request: ${url}`)
}

async function request(path) {
  const result = { headers: {} }
  const response = {
    setHeader(name, value) { result.headers[name] = value },
    status(status) { result.status = status; return this },
    send(body) { result.body = body; return this },
  }
  await handler({ query: { path } }, response)
  return result
}
for (const path of ['/', '/about', '/board', '/store', '/board/1']) {
  const result = await request(path)
  assert.equal(result.status, 200, path)
  assert(!result.headers['X-Robots-Tag'], path)
  assert(result.body.includes('index, follow, max-image-preview:large'), path)
  assert(result.body.includes('<main>'), path)
}
for (const path of ['/admin', '/admin/login', '/profile', '/profile/payments', '/auth/callback', '/login', '/signup', '/board/new', '/board/1/edit', '/store/payment-result']) {
  const result = await request(path)
  assert.equal(result.status, 200, path)
  assert(result.headers['X-Robots-Tag'].includes('noindex'), path)
  assert(result.body.includes('content="noindex, nofollow, noarchive"'), path)
}
for (const path of ['/board/2', '/missing-page']) {
  const result = await request(path)
  assert.equal(result.status, 404)
  assert(result.headers['X-Robots-Tag'].includes('noindex'))
}
const sitemap = await request('/sitemap.xml')
assert.equal(sitemap.status, 200)
assert(sitemap.body.includes('/board/1</loc>'))
assert(!sitemap.body.includes('/admin'))
assert(!sitemap.body.includes('/profile'))
console.log('SEO checks passed: public HTML, post schema, escaped UGC, private noindex, 404s and sitemap.')
