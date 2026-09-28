import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const command = process.argv[2]
const cli = path.resolve('node_modules/supabase/dist/supabase.js')
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required in .env`)
  return value
}

function requiredProjectRef() {
  const configured = process.env.SUPABASE_PROJECT_REF?.trim()
  if (configured) return configured

  try {
    const hostname = new URL(required('SUPABASE_URL')).hostname
    const match = hostname.match(/^([^.]+)\.supabase\.co$/i)
    if (match) return match[1]
  } catch {
    // Report the actionable error below.
  }

  throw new Error('SUPABASE_URL must be a valid project URL when SUPABASE_PROJECT_REF is not set')
}

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token || '' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

function login() {
  run(['login', '--token', required('SUPABASE_ACCESS_TOKEN')])
}

function link() {
  required('SUPABASE_ACCESS_TOKEN')
  const args = ['link', '--project-ref', requiredProjectRef()]
  if (process.env.SUPABASE_DB_PASSWORD?.trim()) args.push('--password', process.env.SUPABASE_DB_PASSWORD.trim())
  run(args)
}

function dbPush() {
  required('SUPABASE_ACCESS_TOKEN')
  const args = ['db', 'push', '--project-ref', requiredProjectRef()]
  if (process.env.SUPABASE_DB_PASSWORD?.trim()) args.push('--password', process.env.SUPABASE_DB_PASSWORD.trim())
  run(args)
}

function pushSecrets() {
  required('SUPABASE_ACCESS_TOKEN')
  run([
    'secrets', 'set',
    `USER_JWT_SECRET=${required('USER_JWT_SECRET')}`,
    `ADMIN_JWT_SECRET=${required('ADMIN_JWT_SECRET')}`,
    `CORS_ORIGINS=${required('CORS_ORIGINS')}`,
    '--project-ref', requiredProjectRef(),
  ])
}

const actions = {
  login,
  link,
  'db-push': dbPush,
  'secrets-push': pushSecrets,
  'functions-deploy': () => { required('SUPABASE_ACCESS_TOKEN'); run(['functions', 'deploy', 'api', '--no-verify-jwt', '--use-api', '--project-ref', requiredProjectRef()]) },
  deploy: () => {
    required('SUPABASE_ACCESS_TOKEN')
    dbPush()
    pushSecrets()
    run(['functions', 'deploy', 'api', '--no-verify-jwt', '--use-api', '--project-ref', requiredProjectRef()])
  },
}

if (!actions[command]) throw new Error(`Unknown command: ${command || '(missing)'}`)
actions[command]()
