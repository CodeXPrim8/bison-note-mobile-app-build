import { createClient } from '@/lib/supabase/server'
import { handleRouteError, successResponse } from '@/lib/api/errors'

export async function POST() {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
    return successResponse({ ok: true }, 'Signed out')
  } catch (error) {
    return handleRouteError(error)
  }
}
