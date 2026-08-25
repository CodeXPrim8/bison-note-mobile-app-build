import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getServiceRoleKey, getSupabasePublicConfig, isServiceRoleConfigured } from '@/lib/env'

/** Same ɃU Supabase project as the live app. Uses service_role when it is a real JWT, otherwise the anon key. */
export function createDataClient(): SupabaseClient {
  const { url, anonKey } = getSupabasePublicConfig()
  const key = isServiceRoleConfigured() ? getServiceRoleKey() : anonKey
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
