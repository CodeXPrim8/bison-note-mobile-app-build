import { createClient } from '@/lib/supabase/server'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { clearBuSession, clearBuSessionOn } from '@/lib/auth/bu-session'

export async function POST() {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
    await clearBuSession()
    return clearBuSessionOn(successResponse({ ok: true }, 'Signed out'))
  } catch (error) {
    return handleRouteError(error)
  }
}
