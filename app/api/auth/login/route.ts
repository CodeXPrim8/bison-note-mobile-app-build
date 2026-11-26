import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { normalizePhone } from '@/lib/phone'
import { authEmailsFromBuId, contactEmail, pinSchema } from '@/lib/auth/pin'
import { signInWithPinPassword, upgradeStoredAuthPassword } from '@/lib/auth/auth-password'
import { clientIp, rateLimit } from '@/lib/api/rate-limit'
import { isSupabaseConfigured } from '@/lib/env'
import { pinMatches, verifyLegacyBuPin } from '@/lib/auth/legacy-login'
import {
  assertPinOpen,
  clearPinFailures,
  LOGIN_IP_LIMIT,
  LOGIN_IP_WINDOW_MS,
  notePinFailure,
  pinAttemptKeys,
} from '@/lib/auth/pin-attempts'
import { ensureLiveBuUser } from '@/lib/auth/live-user'
import { attachBuSession, writeBuSession } from '@/lib/auth/bu-session'
import { getUserControl } from '@/lib/admin/platform'

async function assertActiveAccount(userId: string) {
  const control = await getUserControl(userId)
  if (control.deleted_at || control.suspended) {
    throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'This ɃU account is suspended.')
  }
}

const schema = z
  .object({
    phone: z.string().min(7).max(32).optional(),
    email: z.string().email().optional(),
    pin: pinSchema,
  })
  .refine((value) => Boolean(value.phone || value.email), {
    message: 'Enter your ɃU ID (phone number) or email',
  })

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      throw new ApiError(
        503,
        'AUTH_UNAVAILABLE',
        'Sign-in is not connected. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the server.',
      )
    }

    const ip = clientIp(request)
    const loginIpKeys = [`login-ip:${ip}`]
    const limited = rateLimit(`login:${ip}`, 8, 60_000)
    if (!limited.ok) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again shortly.')
    }
    await assertPinOpen(loginIpKeys, LOGIN_IP_LIMIT)
    const loginFailed = async (message: string): Promise<never> => {
      await notePinFailure(loginIpKeys, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS)
      throw new ApiError(401, 'LOGIN_FAILED', message)
    }

    const body = schema.parse(await request.json())
    const supabase = await createClient()
    const admin = tryCreateAdminClient()
    const emails: string[] = []
    let pinHash: string | null = null
    let missingVerifier = false

    if (body.phone) {
      const legacy = await verifyLegacyBuPin(body.phone, body.pin)
      if ('session' in legacy) {
        await assertActiveAccount(legacy.session.id)
        await writeBuSession(legacy.session)
        await upgradeStoredAuthPassword(legacy.session.id, body.pin)
        if (legacy.session.email) {
          await signInWithPinPassword(supabase, legacy.session.email, body.pin)
        }
        return attachBuSession(successResponse({ user: { id: legacy.session.id, email: legacy.session.email } }, 'Signed in'), legacy.session)
      }
      if ('wrongPin' in legacy) {
        return loginFailed('That ɃU ID is registered. The PIN does not match. Use the same PIN as the live ɃU app.')
      }
      if ('missingVerifier' in legacy) {
        missingVerifier = true
      }

      const phoneE164 = normalizePhone(body.phone)
      if (!phoneE164) {
        throw new ApiError(400, 'INVALID_BU_ID', 'Enter a valid ɃU ID (phone number)')
      }
      emails.push(...authEmailsFromBuId(phoneE164))
      if (admin) {
        const { data: profile } = await admin
          .from('profiles')
          .select('email, pin_hash')
          .eq('phone_e164', phoneE164)
          .maybeSingle()
        if (profile?.email && !emails.includes(profile.email as string)) {
          emails.push(profile.email as string)
        }
        pinHash = (profile?.pin_hash as string | null) ?? null
      }
    } else if (body.email) {
      const email = body.email.trim().toLowerCase()
      emails.push(email)
      if (admin) {
        const { data: profile } = await admin
          .from('profiles')
          .select('email, pin_hash, phone_e164')
          .eq('email', email)
          .maybeSingle()
        pinHash = (profile?.pin_hash as string | null) ?? null
        const profilePhone = (profile?.phone_e164 as string | null) ?? null
        if (profilePhone) {
          for (const extra of authEmailsFromBuId(profilePhone)) {
            if (!emails.includes(extra)) emails.push(extra)
          }
        }
        const { data: legacyUser } = await admin.from('users').select('*').eq('email', email).maybeSingle()
        if (legacyUser?.pin_hash) {
          const storedHash = String(legacyUser.pin_hash)
          const emailKeys = pinAttemptKeys({
            userId: typeof legacyUser.id === 'string' ? legacyUser.id : null,
            email,
            phone: (legacyUser.phone_number as string | null) ?? null,
          })
          await assertPinOpen(emailKeys)
          const ok = await pinMatches(body.pin, storedHash)
          if (ok) {
            await clearPinFailures(emailKeys)
            const phone = (legacyUser.phone_number as string | null) ?? email
            const legacy = await verifyLegacyBuPin(phone, body.pin, { skipAttemptGuard: true })
            if ('session' in legacy) {
              await assertActiveAccount(legacy.session.id)
              await writeBuSession(legacy.session)
              return attachBuSession(successResponse({ user: { id: legacy.session.id, email: legacy.session.email } }, 'Signed in'), legacy.session)
            }
          } else if (storedHash.startsWith('$2')) {
            await notePinFailure(emailKeys)
            return loginFailed('Invalid ɃU ID or PIN')
          }
        }
      }
    }

    if (pinHash) {
      const hashKeys = pinAttemptKeys({ email: body.email, phone: body.phone })
      await assertPinOpen(hashKeys)
      const ok = await pinMatches(body.pin, pinHash)
      if (ok) {
        await clearPinFailures(hashKeys)
      } else if (pinHash.startsWith('$2')) {
        await notePinFailure(hashKeys)
        return loginFailed('Invalid ɃU ID or PIN')
      }
    }

    let confirmBlocked = false
    for (const email of emails) {
      const signed = await signInWithPinPassword(supabase, email, body.pin)
      const data = { user: signed.user }
      const error = signed.errorMessage ? { message: signed.errorMessage } : null
      if (!error && data.user) {
        if (signed.legacy) await upgradeStoredAuthPassword(data.user.id, body.pin)
        const displayName =
          (data.user.user_metadata?.display_name as string | undefined) || 'ɃU member'
        const phone =
          (data.user.user_metadata?.phone_e164 as string | undefined) ||
          (data.user.user_metadata?.phone as string | undefined) ||
          body.phone ||
          null
        let userId = data.user.id
        let resolvedEmail =
          contactEmail((data.user.user_metadata?.ticket_email as string | undefined) ?? null) ||
          contactEmail((data.user.user_metadata?.email as string | undefined) ?? null) ||
          contactEmail(body.email) ||
          null
        if (admin && !resolvedEmail) {
          const { data: profileRow } = await admin
            .from('profiles')
            .select('email')
            .eq('id', data.user.id)
            .maybeSingle()
          resolvedEmail = contactEmail((profileRow?.email as string | null) ?? null)
          if (!resolvedEmail) {
            const { data: liveRow } = await admin
              .from('users')
              .select('email')
              .eq('id', data.user.id)
              .maybeSingle()
            resolvedEmail = contactEmail((liveRow?.email as string | null) ?? null)
          }
        }
        if (phone) {
          const live = await ensureLiveBuUser({
            id: data.user.id,
            displayName,
            phone,
            email: resolvedEmail,
            pin: body.pin,
            pinHash,
            role: (data.user.user_metadata?.role as string | undefined) || 'guest',
          })
          if (live.ok) userId = live.userId
        }
        const session = {
          id: userId,
          email: resolvedEmail,
          display_name: displayName,
          phone: (data.user.user_metadata?.phone as string | undefined) ?? body.phone ?? null,
          phone_e164:
            (data.user.user_metadata?.phone_e164 as string | undefined) ??
            (phone ? normalizePhone(phone) : null),
          role: (data.user.user_metadata?.role as string | undefined) || 'guest',
        }
        await assertActiveAccount(session.id)
        await writeBuSession(session)
        return attachBuSession(successResponse({ user: { id: session.id, email: session.email } }, 'Signed in'), session)
      }
      if (error && /confirm/i.test(error.message)) confirmBlocked = true
    }

    if (confirmBlocked) {
      throw new ApiError(
        400,
        'CONFIRM_EMAIL',
        'This account still needs email confirmation. In Supabase: Authentication > Providers > Email, turn off Confirm email.',
      )
    }

    if (missingVerifier) {
      throw new ApiError(
        503,
        'PIN_LOOKUP',
        'Could not check your ɃU PIN yet. In the Supabase SQL editor, run supabase/migrations/0007_bu_login_row.sql, then try again.',
      )
    }

    return loginFailed('Invalid ɃU ID or PIN')
  } catch (error) {
    return handleRouteError(error)
  }
}
