import 'dotenv/config'

const groups = [
  ['SUPABASE_URL'],
  ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY'],
  ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  ['SUPABASE_ACCESS_TOKEN'],
  ['VERCEL_TOKEN', 'VERCEL_ACCESS_TOKEN'],
  ['USER_JWT_SECRET'],
  ['ADMIN_JWT_SECRET'],
  ['CORS_ORIGINS'],
]

const missing = groups.filter((names) => !names.some((name) => process.env[name]?.trim()))
if (missing.length) {
  console.error(`Missing environment values: ${missing.map((names) => names.join(' or ')).join(', ')}`)
  process.exit(1)
}
if (process.env.USER_JWT_SECRET.length < 32 || process.env.ADMIN_JWT_SECRET.length < 32) {
  console.error('USER_JWT_SECRET and ADMIN_JWT_SECRET must each be at least 32 characters.')
  process.exit(1)
}
console.log('Supabase, Vercel, JWT, and CORS environment variables are configured.')
