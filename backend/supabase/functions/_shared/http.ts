export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function allowedOrigin(request: Request): string {
  const origin = request.headers.get('origin') || ''
  const configured = (Deno.env.get('CORS_ORIGINS') || '*')
    .split(',').map((value) => value.trim()).filter(Boolean)
  if (configured.includes('*')) return '*'
  return configured.includes(origin) ? origin : configured[0] || '*'
}

export function corsHeaders(request: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(request),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

export function json(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders(request), 'Cache-Control': 'no-store' },
  })
}

export async function bodyJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, '요청 본문이 올바른 JSON 형식이 아닙니다.')
  }
}

export function positiveId(value: string | undefined): number {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new HttpError(400, '올바른 번호가 아닙니다.')
  return parsed
}

export function routePath(request: Request): string {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/'
  const marker = '/functions/v1/api'
  if (pathname.startsWith(marker)) return pathname.slice(marker.length) || '/'
  const apiIndex = pathname.indexOf('/api')
  return apiIndex >= 0 ? pathname.slice(apiIndex + 4) || '/' : pathname
}
