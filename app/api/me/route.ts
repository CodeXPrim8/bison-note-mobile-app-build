import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getSessionUser, getProfile, requireUser } from '@/lib/api/session'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { isSupabaseConfigured } from '@/lib/env'
import { normalizePhone } from '@/lib/phone'
import { contactEmail, pinSchema, supabasePinPassword } from '@/lib/auth/pin'
import { attachBuSession, readBuSession } from '@/lib/auth/bu-session'
import type { Profile } from '@/lib/types/database'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return successResponse({ user: null, profile: null })
    const profile = await getProfile(user.id)
    const email = profile?.email ?? contactEmail(user.email)
    return successResponse({ user: { id: user.id, email }, profile })
  } catch (error) {
    return handleRouteError(error)
  }
}

const patchSchema = z.object({
  display_name: z.string().min(2).max(80).optional(),
  phone: z.string().min(7).max(32).optional(),
  email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  current_pin: pinSchema.optional(),
  new_pin: pinSchema.optional(),
})

function dbClient() {
  return tryCreateAdminClient() ?? (isSupabaseConfigured() ? createDataClient() : null)
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser()
    const body = patchSchema.parse(await request.json())
    const admin = tryCreateAdminClient()
    const db = dbClient()
    const updates: Record<string, string | null> = {}
    const session = await readBuSession()

    if (body.display_name) updates.display_name = body.display_name
    if (body.phone) {
      const phoneE164 = normalizePhone(body.phone)
      if (!phoneE164) throw new ApiError(400, 'INVALID_BU_ID', 'Enter a valid phone number as your ɃU ID')
      if (db) {
        const { data: taken } = await db
          .from('profiles')
          .select('id')
          .eq('phone_e164', phoneE164)
          .neq('id', user.id)
          .maybeSingle()
        if (taken) throw new ApiError(409, 'BU_ID_TAKEN', 'This ɃU ID is already registered')
        await db
          .from('event_invitations')
          .update({ invited_user_id: user.id })
          .eq('invited_bu_id', phoneE164)
          .is('invited_user_id', null)
      }
      updates.phone = body.phone
      updates.phone_e164 = phoneE164
    }

    let nextEmail: string | null | undefined
    if (body.email !== undefined) {
      nextEmail = body.email ? contactEmail(body.email) : null
      if (body.email && !nextEmail) {
        throw new ApiError(400, 'INVALID_EMAIL', 'Enter a real email address')
      }
      if (nextEmail && db) {
        const { data: takenProfile } = await db
          .from('profiles')
          .select('id')
          .eq('email', nextEmail)
          .neq('id', user.id)
          .maybeSingle()
        const { data: takenUser } = await db
          .from('users')
          .select('id')
          .eq('email', nextEmail)
          .neq('id', user.id)
          .maybeSingle()
        if (takenProfile || takenUser) {
          throw new ApiError(409, 'EMAIL_TAKEN', 'This email is already on another ɃU account')
        }
      }
      updates.email = nextEmail ?? null
    }

    if (body.new_pin) {
      if (!body.current_pin) {
        throw new ApiError(400, 'PIN_REQUIRED', 'Enter your current PIN to set a new one')
      }
      if (!admin) {
        throw new ApiError(503, 'AUTH_UNAVAILABLE', 'PIN changes need the live ɃU service role key on this server.')
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

    let profileRow: Profile | null = null
    let profileErrorMessage: string | null = null
    if (db) {
      const { data, error: profileError } = await db
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select('id, role, display_name, username, phone, phone_e164, email, avatar_url, created_at, updated_at')
        .maybeSingle()
      profileRow = (data as Profile | null) ?? null
      if (profileError) profileErrorMessage = profileError.message

      const liveUpdates: Record<string, string | null> = {}
      if (nextEmail !== undefined) liveUpdates.email = nextEmail
      if (body.display_name) liveUpdates.account_name = body.display_name
      if (body.phone) liveUpdates.phone_number = body.phone
      if (Object.keys(liveUpdates).length) {
        const { error: liveError } = await db.from('users').update(liveUpdates).eq('id', user.id)
        if (liveError && /unique|duplicate/i.test(liveError.message)) {
          throw new ApiError(409, 'EMAIL_TAKEN', 'This email is already on another ɃU account')
        }
      }
    }

    const profile = profileRow ?? (await getProfile(user.id))
    if (profileErrorMessage && !profile && !session) {
      throw new ApiError(500, 'UPDATE_FAILED', 'Could not update profile')
    }
    const saved: Profile = profile
      ? { ...profile, email: nextEmail !== undefined ? nextEmail : contactEmail(profile.email) }
      : {
          id: user.id,
          role: 'guest',
          display_name: body.display_name ?? session?.display_name ?? 'ɃU member',
          username: null,
          phone: session?.phone ?? null,
          phone_e164: session?.phone_e164 ?? null,
          email: nextEmail !== undefined ? nextEmail : null,
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

    const message = nextEmail === null ? 'Email removed' : nextEmail ? 'Email saved' : 'Saved'
    const response = successResponse({ profile: saved }, message)
    if (session && session.id === user.id) {
      return attachBuSession(response, {
        id: session.id,
        email: nextEmail !== undefined ? nextEmail : session.email,
        display_name: body.display_name ?? session.display_name,
        phone: body.phone ?? session.phone,
        phone_e164: updates.phone_e164 ?? session.phone_e164,
        role: session.role,
      })
    }
    return response
  } catch (error) {
    return handleRouteError(error)
  }
}
