# Search and social visibility

Canonical origin: https://www.bodramdbo.shop

Public home, service introduction, board, store, and visible post URLs serve HTML metadata and readable content through `frontend/api/seo.js` before React starts. The same response is served to humans and crawlers. Content comes from the anonymous Supabase API; no service-role key, token, email, or private profile is used. User text is HTML-escaped and JSON-LD escapes `<` to prevent script injection.

Private routes (admin, profile, auth, login, signup, post create/edit, payment result) return both robots noindex metadata and X-Robots-Tag. These routes remain crawlable so search engines can observe noindex. Authentication remains the access control. Unknown and missing/hidden post URLs return 404; upstream failures return 503 instead of an indexable empty page. Backend JSON APIs also return noindex headers.

`/sitemap.xml` is generated from current public posts and four public service routes. It excludes all administrative and private routes. The current implementation paginates up to 500 public API pages (5,000 posts); extend to a sitemap index before exceeding that size. Post content and sitemap responses use no-store so hidden/deleted posts are not retained in an SEO response cache.

`/robots.txt` advertises the sitemap. Organization, WebSite, WebPage/AboutPage/CollectionPage, and public DiscussionForumPosting JSON-LD describes visible content. `/about` supplies human-readable explanations of service purpose, participation, memberships and support. No invented reviews, organization addresses, or unsupported claims are included. These are the SEO foundations used for AI search discoverability; no AI ranking or indexing is promised.

## Owner actions

Verify https://www.bodramdbo.shop in Google Search Console and Naver Search Advisor, then submit https://www.bodramdbo.shop/sitemap.xml. Account ownership verification needs the owner's chosen verification record or token; none is fabricated by the app. If old Kakao previews remain, refresh the URL in Kakao's sharing debugger. A successful deployment does not mean search engines have indexed the pages yet.

## Verification

Run `npm run test:seo`, `npm run lint`, and `npm run build` in frontend. After deployment, inspect response HTML, robots headers, sitemap, missing-post status, and image content types directly on the canonical origin. Ensure root and private routes do not share an indexability rule accidentally.
