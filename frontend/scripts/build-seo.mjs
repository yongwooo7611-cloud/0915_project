import { readFile, writeFile } from 'node:fs/promises'
import { renderHtml } from '../api/seo.js'

const index = new URL('../dist/index.html', import.meta.url)
const template = await readFile(index, 'utf8')
// Vercel serves the static homepage before fallback routes. Preserve a clean
// app shell for dynamic routes and prerender the homepage without stale UGC.
await writeFile(new URL('../dist/seo-shell.html', import.meta.url), template)
await writeFile(index, renderHtml(template, '/', { posts: [] }))
console.log('Homepage SEO HTML and dynamic route shell generated.')
