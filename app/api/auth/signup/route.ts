import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { createClient } from '@/lib/supabase/server'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { normalizePhone, phoneLookupVariants } from '@/lib/phone'
import { authEmailsFromBuId, pinSchema, supabasePinPassword } from '@/lib/auth/pin'
import { isSupabaseConfigured } from '@/lib/env'
import { attachBuSession, writeBuSession } from '@/lib/auth/bu-session'
import { liveAccountExistsForPhone } from '@/lib/auth/legacy-login'

const schema = z.object({
  display_name: z.string().min(2).max(80),
  phone: z.string().min(7).max(32),
  pin: pinSchema,
  email: z.preprocess((value) => (value === '' || value === undefined ? undefined : value), z.string().email().optional()),
  role: z.enum(['guest', 'celebrant', 'vendor', 'merchant', 'organizer']).optional(),
})

function alreadyRegistered(message: string) {
  return /already|registered|exists/i.test(message)
}

function rateLimited(message: string) {
  return /rate limit/i.test(message)
}

function invalidEmail(message: string) {
  return /email address .* is invalid/i.test(message)
}

function needsEmailConfirm(message: string) {
  return /confirm|not confirmed|email not confirmed/i.test(message)
}

function throwSignupError(message: string): never {
  if (alreadyRegistered(message)) {
    throw new ApiError(409, 'BU_ID_TAKEN', 'This ɃU ID is already registered. Log in with your PIN.')
  }
  if (rateLimited(message)) {
    throw new ApiError(
      429,
      'SIGNUP_RATE_LIMIT',
      'Too many new accounts right now. In Supabase: Authentication > Providers > Email, turn off Confirm email. Wait a minute, then try again.',
    )
  }
  throw new ApiError(400, 'SIGNUP_FAILED', message)
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      throw new ApiError(
        503,
        'AUTH_UNAVAILABLE',
        'Sign-up is not connected. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the server.',
      )
    }

    const body = schema.parse(await request.json())
    const phoneE164 = normalizePhone(body.phone)
    if (!phoneE164) {
      throw new ApiError(400, 'INVALID_BU_ID', 'Enter a valid phone number as your ɃU ID')
    }

    const ticketEmail = body.email?.trim().toLowerCase() ?? null
    const pinHash = await bcrypt.hash(body.pin, 10)
    const password = supabasePinPassword(body.pin)
    const metadata = {
      display_name: body.display_name,
      role: 'guest',
      phone: body.phone,
      phone_e164: phoneE164,
      ticket_email: ticketEmail,
    }

    const admin = tryCreateAdminClient()
    if (await liveAccountExistsForPhone(body.phone)) {
      throw new ApiError(409, 'BU_ID_TAKEN', 'This ɃU ID is already registered. Log in with your PIN.')
    }
    if (admin) {
      const variants = phoneLookupVariants(body.phone)
      for (const variant of variants) {
        const byE164 = await admin.from('profiles').select('id').eq('phone_e164', variant).maybeSingle()
        const byPhone = await admin.from('profiles').select('id').eq('phone', variant).maybeSingle()
        if (byE164.data || byPhone.data) {
          throw new ApiError(409, 'BU_ID_TAKEN', 'This ɃU ID is already registered. Log in with your PIN.')
        }
      }
      if (ticketEmail) {
        const byEmail = await admin.from('profiles').select('id').eq('email', ticketEmail).maybeSingle()
        const byLiveEmail = await admin.from('users').select('id').eq('email', ticketEmail).maybeSingle()
        if (byEmail.data || byLiveEmail.data) {
          throw new ApiError(409, 'BU_ID_TAKEN', 'This ɃU ID is already registered. Log in with your PIN.')
        }
      }
    }

    const supabase = await createClient()
    const authEmails = authEmailsFromBuId(phoneE164).filter((email) => !email.endsWith('@id.bu.app'))

    let createdUser: { id: string } | null = null
    let signedIn = false
    let usedEmail = authEmails[0]

    if (admin) {
      let lastError: string | null = null
      for (const email of authEmails) {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: metadata,
        })
        if (!error && data.user) {
          usedEmail = email
          createdUser = data.user
          break
        }
        lastError = error?.message ?? lastError
        if (error && alreadyRegistered(error.message)) {
          throwSignupError(error.message)
        }
        if (error && !invalidEmail(error.message)) {
          throwSignupError(error.message)
        }
      }
      if (!createdUser) {
        throwSignupError(lastError ?? 'Could not create account')
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email: usedEmail, password })
      if (signInError) throwSignupError(signInError.message)
      signedIn = true

      await admin
        .from('profiles')
        .update({
          phone: body.phone,
          phone_e164: phoneE164,
          email: ticketEmail ?? usedEmail,
          pin_hash: pinHash,
          display_name: body.display_name,
          ...(body.role === 'organizer' ? { role: 'organizer' } : {}),
        })
        .eq('id', createdUser.id)
      await admin
        .from('event_invitations')
        .update({ invited_user_id: createdUser.id })
        .eq('invited_bu_id', phoneE164)
        .is('invited_user_id', null)

      const session = {
        id: createdUser.id,
        email: ticketEmail ?? usedEmail,
        display_name: body.display_name,
        phone: body.phone,
        phone_e164: phoneE164,
        role: body.role === 'organizer' ? 'organizer' : 'guest',
      }
      await writeBuSession(session)
      return attachBuSession(successResponse({ user: createdUser, bu_id: phoneE164 }, 'Account created'), session)
    }

    let lastError: string | null = null
    for (const email of authEmails) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata },
      })
      if (error) {
        lastError = error.message
        if (invalidEmail(error.message)) continue
        throwSignupError(error.message)
      }
      usedEmail = email
      createdUser = data.user
      if (data.session) {
        signedIn = true
      }
      break
    }

    if (!createdUser && lastError) {
      throwSignupError(lastError)
    }

    if (!signedIn) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: usedEmail, password })
      if (signInError) {
        if (needsEmailConfirm(signInError.message)) {
          throw new ApiError(
            400,
            'CONFIRM_EMAIL',
            'Account created, but email confirmation is still on in Supabase. Turn it off under Authentication > Providers > Email, then sign in with your ɃU ID and PIN.',
          )
        }
        throwSignupError(signInError.message)
      }
    }

    if (createdUser) {
      await supabase
        .from('profiles')
        .update({
          phone: body.phone,
          phone_e164: phoneE164,
          email: ticketEmail ?? usedEmail,
          display_name: body.display_name,
        })
        .eq('id', createdUser.id)
    }

    if (createdUser) {
      const session = {
        id: createdUser.id,
        email: ticketEmail ?? usedEmail,
        display_name: body.display_name,
        phone: body.phone,
        phone_e164: phoneE164,
        role: 'guest',
      }
      await writeBuSession(session)
      return attachBuSession(successResponse({ user: createdUser, bu_id: phoneE164 }, 'Account created'), session)
    }

    return successResponse({ user: createdUser, bu_id: phoneE164 }, 'Account created')
  } catch (error) {
    return handleRouteError(error)
  }
}
