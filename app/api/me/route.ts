import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getSessionUser, getProfile, requireUser } from '@/lib/api/session'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { pinSchema, supabasePinPassword } from '@/lib/auth/pin'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return successResponse({ user: null, profile: null })
    const profile = await getProfile(user.id)
    return successResponse({ user: { id: user.id, email: user.email }, profile })
  } catch (error) {
    return handleRouteError(error)
  }
}

const patchSchema = z.object({
  display_name: z.string().min(2).max(80).optional(),
  phone: z.string().min(7).max(32).optional(),
  current_pin: pinSchema.optional(),
  new_pin: pinSchema.optional(),
})

export async function PATCH(request: Request) {
  try {
    const user = await requireUser()
    const body = patchSchema.parse(await request.json())
    const admin = createAdminClient()
    const updates: Record<string, string> = {}
    if (body.display_name) updates.display_name = body.display_name
    if (body.phone) {
      const phoneE164 = normalizePhone(body.phone)
      if (!phoneE164) throw new ApiError(400, 'INVALID_BU_ID', 'Enter a valid phone number as your ɃU ID')
      const { data: taken } = await admin
        .from('profiles')
        .select('id')
        .eq('phone_e164', phoneE164)
        .neq('id', user.id)
        .maybeSingle()
      if (taken) throw new ApiError(409, 'BU_ID_TAKEN', 'This ɃU ID is already registered')
      updates.phone = body.phone
      updates.phone_e164 = phoneE164
      await admin
        .from('event_invitations')
        .update({ invited_user_id: user.id })
        .eq('invited_bu_id', phoneE164)
        .is('invited_user_id', null)
    }
    if (body.new_pin) {
      if (!body.current_pin) {
        throw new ApiError(400, 'PIN_REQUIRED', 'Enter your current PIN to set a new one')
      }
      const { data: row } = await admin.from('profiles').select('pin_hash').eq('id', user.id).maybeSingle()
      if (row?.pin_hash) {
        const ok = await bcrypt.compare(body.current_pin, row.pin_hash as string)
        if (!ok) throw new ApiError(401, 'LOGIN_FAILED', 'Current PIN is incorrect')
      }
      updates.pin_hash = await bcrypt.hash(body.new_pin, 10)
      const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, {
        password: supabasePinPassword(body.new_pin),
      })
      if (passwordError) throw new ApiError(500, 'UPDATE_FAILED', 'Could not update PIN')
    }
    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'NO_CHANGES', 'Nothing to update')
    }
    const { data, error } = await admin
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select('id, role, display_name, username, phone, phone_e164, email, avatar_url, created_at, updated_at')
      .single()
    if (error || !data) throw new ApiError(500, 'UPDATE_FAILED', 'Could not update profile')
    return successResponse({ profile: data }, 'Saved')
  } catch (error) {
    return handleRouteError(error)
  }
}
