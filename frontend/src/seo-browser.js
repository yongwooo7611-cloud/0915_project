import { OG_IMAGE, SITE_URL, pageSeo, structuredData } from './seo'

export function applySeo(pathname, post) {
  const seo = pageSeo(pathname, post)
  document.title = seo.title
  const meta = (name, content, property = false) => {
    const key = property ? 'property' : 'name'
    let element = document.head.querySelector(`meta[${key}="${name}"]`)
    if (!element) { element = document.createElement('meta'); element.setAttribute(key, name); document.head.appendChild(element) }
    element.content = content
  }
  meta('description', seo.description)
  meta('robots', seo.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow, noarchive')
  for (const [key, value] of Object.entries({ title: seo.title, description: seo.description, url: `${SITE_URL}${seo.path}`, type: seo.type, image: OG_IMAGE })) meta(`og:${key}`, value, true)
  meta('twitter:title', seo.title); meta('twitter:description', seo.description)
  let canonical = document.head.querySelector('link[rel="canonical"]')
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical) }
  canonical.href = `${SITE_URL}${seo.path}`
  document.getElementById('seo-structured-data')?.remove()
  const data = structuredData(seo, post)
  if (data) {
    const script = document.createElement('script'); script.id = 'seo-structured-data'; script.type = 'application/ld+json'
    script.textContent = JSON.stringify(data); document.head.appendChild(script)
  }
}
