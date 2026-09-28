import { authRoutes } from './auth-routes.ts'
import { postRoutes } from './post-routes.ts'
import { adminRoutes } from './admin-routes.ts'
import { corsHeaders, HttpError, json, routePath } from '../_shared/http.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })

  try {
    const path = routePath(request)
    if (request.method === 'GET' && (path === '/' || path === '/health')) {
      return json(request, { status: 'ok', runtime: 'supabase-edge', timestamp: new Date().toISOString() })
    }

    const response = await authRoutes(request, path)
      || await postRoutes(request, path)
      || await adminRoutes(request, path)
    return response || json(request, { message: 'Route not found.' }, 404)
  } catch (error) {
    if (error instanceof HttpError) return json(request, { message: error.message }, error.status)
    console.error(error)
    return json(request, { message: '서버 내부 오류가 발생했습니다.' }, 500)
  }
})
