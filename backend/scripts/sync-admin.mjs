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
const { data: existing, error: findError } = await supabase.from('admins').select('id,password_hash,auth_user_id').eq('email', email).maybeSingle()
if (findError) throw findError

let authUser = null
if (existing?.auth_user_id) {
  const found = await supabase.auth.admin.getUserById(existing.auth_user_id)
  if (found.error) throw found.error
  authUser = found.data.user
} else {
  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listed.error) throw listed.error
  authUser = listed.data.users.find((user) => user.email?.toLowerCase() === email) || null
}

if (authUser) {
  const linkedUser = await supabase.from('users').select('id').eq('auth_user_id', authUser.id).maybeSingle()
  if (linkedUser.error) throw linkedUser.error
  if (linkedUser.data) throw new Error('The administrator email is already linked to a regular user account.')
  const updated = await supabase.auth.admin.updateUserById(authUser.id, {
    email,
    password,
    email_confirm: true,
    user_metadata: { ...authUser.user_metadata, name, role: 'admin' },
    app_metadata: { ...authUser.app_metadata, role: 'admin' },
  })
  if (updated.error || !updated.data.user) throw updated.error || new Error('Failed to update the administrator Auth user.')
  authUser = updated.data.user
} else {
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: 'admin' },
    app_metadata: { role: 'admin' },
  })
  if (created.error || !created.data.user) throw created.error || new Error('Failed to create the administrator Auth user.')
  authUser = created.data.user
}

const password_hash = existing && await bcrypt.compare(password, existing.password_hash)
  ? existing.password_hash
  : await bcrypt.hash(password, 12)
const { error } = await supabase.from('admins').upsert({ email, name, password_hash, auth_user_id: authUser.id }, { onConflict: 'email' })
if (error) throw error
console.log(`Administrator ${existing ? 'updated' : 'created'} and linked to Supabase Auth: ${email}`)
