import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { MissingEnvError, getServiceRoleKey, getSupabasePublicConfig, isServiceRoleConfigured } from '@/lib/env'

/**
 * Same ɃU Supabase project as the live app.
 * Production always uses the service role. Privileged RPCs are not granted to the anon key.
 * Local dev may fall back to the anon key only when the service role is not configured.
 */
export function createDataClient(): SupabaseClient {
  const { url, anonKey } = getSupabasePublicConfig()
  if (!isServiceRoleConfigured()) {
    if (process.env.VERCEL_ENV === 'production') {
      throw new MissingEnvError('SUPABASE_SERVICE_ROLE_KEY is required in production.')
    }
  }
  const key = isServiceRoleConfigured() ? getServiceRoleKey() : anonKey
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
