import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_URL and a Supabase secret key are required.')

const supabase = createClient(url, key, { auth: { persistSession: false } })
const tables = ['admins', 'users', 'posts', 'comments', 'post_views', 'post_reactions']
for (const table of tables) {
  const { error } = await supabase.from(table).select('*').limit(1)
  if (error) throw new Error(`${table}: ${error.message}`)
}
console.log(`Supabase connected: ${tables.join(', ')}`)
