import { createClient } from '@supabase/supabase-js'
import { getSupabasePublicKey, getSupabaseSecretKey, getSupabaseUrl } from './env.ts'

export const db = createClient(getSupabaseUrl(), getSupabaseSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

export const auth = createClient(getSupabaseUrl(), getSupabasePublicKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

export function assertDatabase(error: { message: string; code?: string } | null): void {
  if (error) {
    console.error('Supabase database error:', error.code, error.message)
    throw new Error('데이터베이스 요청을 처리하지 못했습니다.')
  }
}
