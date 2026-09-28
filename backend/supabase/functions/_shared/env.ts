function readJsonKey(name: string): string | undefined {
  const raw = Deno.env.get(name)
  if (!raw) return undefined
  try {
    return JSON.parse(raw).default
  } catch {
    return undefined
  }
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`필수 환경변수 ${name}이(가) 없습니다.`)
  return value
}

export function getSupabaseUrl(): string {
  return requiredEnv('SUPABASE_URL')
}

export function getSupabasePublicKey(): string {
  return Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim()
    || Deno.env.get('SUPABASE_ANON_KEY')?.trim()
    || readJsonKey('SUPABASE_PUBLISHABLE_KEYS')
    || ''
}

export function getSupabaseSecretKey(): string {
  return Deno.env.get('SUPABASE_SECRET_KEY')?.trim()
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
    || readJsonKey('SUPABASE_SECRET_KEYS')
    || requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
}
