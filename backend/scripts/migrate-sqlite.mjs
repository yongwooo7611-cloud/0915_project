import 'dotenv/config'
import Database from 'better-sqlite3'
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'

const databasePath = path.resolve(process.cwd(), process.env.SQLITE_DATABASE_PATH || './data/community.db')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_URL and a Supabase secret key are required.')

const source = new Database(databasePath, { readonly: true })
const supabase = createClient(url, key, { auth: { persistSession: false } })

function rows(table) {
  const exists = source.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table)
  return exists ? source.prepare(`select * from ${table} order by rowid`).all() : []
}

async function upsert(table, values, onConflict = 'id') {
  if (!values.length) return
  const { error } = await supabase.from(table).upsert(values, { onConflict })
  if (error) throw new Error(`${table}: ${error.message}`)
  console.log(`${table}: ${values.length} rows migrated`)
}

try {
  await upsert('admins', rows('admins'))
  await upsert('users', rows('users'))
  await upsert('posts', rows('posts').map((row) => ({ ...row, is_hidden: Boolean(row.is_hidden) })))
  await upsert('comments', rows('comments').map((row) => ({ ...row, is_hidden: Boolean(row.is_hidden) })))
  await upsert('post_reactions', rows('post_reactions'), 'post_id,user_id')

  const postViews = rows('post_views').flatMap((row) => {
    const match = String(row.viewer_key || '').match(/^user:(\d+)$/)
    return match ? [{ post_id: row.post_id, user_id: Number(match[1]), viewed_at: row.viewed_at }] : []
  })
  await upsert('post_views', postViews, 'post_id,user_id')

  const synced = await supabase.rpc('sync_identity_sequences')
  if (synced.error) throw synced.error
  console.log('SQLite to Supabase migration completed.')
} finally {
  source.close()
}
