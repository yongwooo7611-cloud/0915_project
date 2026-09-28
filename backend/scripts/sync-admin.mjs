import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const password = String(process.env.ADMIN_PASSWORD || '')
const name = String(process.env.ADMIN_NAME || '관리자').trim()

if (!url || !key) throw new Error('SUPABASE_URL and a Supabase secret key are required.')
if (!email || password.length < 8) throw new Error('ADMIN_EMAIL and an ADMIN_PASSWORD of at least 8 characters are required.')

const supabase = createClient(url, key, { auth: { persistSession: false } })
const { data: existing, error: findError } = await supabase.from('admins').select('id,password_hash').eq('email', email).maybeSingle()
if (findError) throw findError
const password_hash = existing && await bcrypt.compare(password, existing.password_hash)
  ? existing.password_hash
  : await bcrypt.hash(password, 12)
const { error } = await supabase.from('admins').upsert({ email, name, password_hash }, { onConflict: 'email' })
if (error) throw error
console.log(`Administrator ${existing ? 'updated' : 'created'}: ${email}`)
