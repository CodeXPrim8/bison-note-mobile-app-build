import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Resend } from 'resend'
import { ApiError } from '@/lib/api/errors'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { contactEmail } from '@/lib/auth/pin'
import { strongPinPassword } from '@/lib/auth/auth-password'
import { normalizePhone, phoneLookupVariants } from '@/lib/phone'
import { getAppUrl, getBankEncryptionKey, getResendConfig } from '@/lib/env'
import { BU_SITE_NAME } from '@/lib/brand'
import { findProfileByBuId } from '@/lib/auth/live-user'

const OTP_TTL_MS = 15 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ChallengePayload = {
  userId: string
  phone: string
  email: string
  otpHash: string
  exp: number
}

function signingKey() {
  return getBankEncryptionKey()
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function signChallenge(payload: ChallengePayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', signingKey()).update(body).digest('base64url')
  return `${body}.${sig}`
}

function readChallenge(token: string): ChallengePayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', signingKey()).update(body).digest('base64url')
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ChallengePayload
    if (!parsed?.userId || !parsed.phone || !parsed.otpHash || !parsed.exp) return null
    return parsed
  } catch {
    return null
  }
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '••••@••••'
  const head = local.slice(0, Math.min(2, local.length))
  return `${head}•••@${domain}`
}

function sixDigitOtp() {
  return String(randomInt(100000, 999999))
}

async function resolveAccountForPhone(phoneInput: string) {
  const phone = normalizePhone(phoneInput)
  if (!phone) return null

  const admin = tryCreateAdminClient()
  const db = admin ?? createDataClient()
  const variants = phoneLookupVariants(phoneInput)

  if (admin) {
    for (const variant of variants) {
      const { data } = await admin
        .from('users')
        .select('id, email, phone_number, first_name, last_name, account_name')
        .eq('phone_number', variant)
        .maybeSingle()
      if (data?.id) {
        const row = data as Record<string, unknown>
        const liveEmail = contactEmail(typeof row.email === 'string' ? row.email : null)
        let email = liveEmail
        if (!email) {
          const profile = await admin
            .from('profiles')
            .select('email')
            .eq('id', String(row.id))
            .maybeSingle()
          email = contactEmail((profile.data as { email?: string } | null)?.email)
        }
        return {
          userId: String(row.id),
          phone: normalizePhone(String(row.phone_number ?? phone)) || phone,
          email,
          name:
            [row.first_name, row.last_name].filter((p) => typeof p === 'string' && String(p).trim()).join(' ').trim() ||
            (typeof row.account_name === 'string' ? row.account_name : null) ||
            'ɃU member',
        }
      }
    }
  }

  const profile = await findProfileByBuId(phoneInput)
  if (profile?.id) {
    return {
      userId: profile.id,
      phone: normalizePhone(profile.phone_e164 || profile.phone || phone) || phone,
      email: contactEmail(profile.email),
      name: profile.display_name || 'ɃU member',
    }
  }

  // Keep db typed usage so createDataClient path stays warm for later updates.
  void db
  return null
}

async function sendResetEmail(input: { to: string; name: string; otp: string; phoneHint: string }) {
  const { apiKey, from } = getResendConfig()
  if (!apiKey?.trim()) {
    return { sent: false as const, reason: 'not_configured' as const, detail: 'RESEND_API_KEY missing' }
  }
  if (!EMAIL_RE.test(input.to)) {
    return { sent: false as const, reason: 'invalid' as const, detail: 'invalid recipient' }
  }

  const resend = new Resend(apiKey.trim())
  const origin = getAppUrl()
  const fromAddress = (() => {
    const raw = (from || 'Bucks <onboarding@resend.dev>').trim()
    const match = raw.match(/<([^>]+)>/)
    const address = match?.[1] || (raw.includes('@') ? raw : 'onboarding@resend.dev')
    return `Bucks <${address}>`
  })()
  const result = await resend.emails.send({
    from: fromAddress,
    to: input.to,
    subject: `Reset your ${BU_SITE_NAME} PIN`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#111">
      <p style="letter-spacing:0.18em;text-transform:uppercase;font-size:11px;font-weight:700;color:#2f7bff">${BU_SITE_NAME}</p>
      <h1 style="font-size:22px;margin:8px 0 12px">Reset your PIN</h1>
      <p style="margin:0 0 12px">Hi ${input.name}, use this code to set a new PIN for ɃU ID ending ${input.phoneHint}.</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:0.28em;margin:18px 0">${input.otp}</p>
      <p style="color:#555;margin:0 0 8px">This code expires in 15 minutes. If you did not ask for a reset, ignore this email.</p>
      <p style="margin:16px 0 0"><a href="${origin}/login" style="color:#2f7bff">Open Bucks login</a></p>
    </div>`,
  })
  if (result.error) {
    console.error('pin reset email failed', result.error)
    const detail = typeof result.error.message === 'string' ? result.error.message : 'send failed'
    const testingOnly = /only send testing emails to your own email/i.test(detail)
    return {
      sent: false as const,
      reason: (testingOnly ? 'domain_required' : 'send_failed') as 'domain_required' | 'send_failed',
      detail,
    }
  }
  return { sent: true as const }
}

export async function requestPinReset(phoneInput: string) {
  const account = await resolveAccountForPhone(phoneInput)
  // Always return a generic success shape to avoid account enumeration.
  const generic = {
    ok: true as const,
    message: 'If that ɃU ID has an email on file, we sent a reset code.',
  }
  if (!account) return { ...generic, email_hint: null as string | null, challenge: null as string | null }

  if (!account.email) return { ...generic, email_hint: null, challenge: null }

  const otp = sixDigitOtp()
  const challenge = signChallenge({
    userId: account.userId,
    phone: account.phone,
    email: account.email,
    otpHash: sha256(`${account.userId}:${otp}`),
    exp: Date.now() + OTP_TTL_MS,
  })

  const mailed = await sendResetEmail({
    to: account.email,
    name: account.name,
    otp,
    phoneHint: account.phone.slice(-4),
  })

  if (!mailed.sent) {
    throw new ApiError(
      503,
      'EMAIL_UNAVAILABLE',
      mailed.reason === 'not_configured'
        ? 'Email sending is not set up. Add RESEND_API_KEY on the server.'
        : mailed.reason === 'domain_required'
          ? 'Could not email the code. In Resend, verify your domain (Domains), then set RESEND_FROM to an address on that domain (for example Bucks <noreply@yourdomain.com>) and restart the app.'
          : 'Could not send the reset email right now. Try again in a minute.',
    )
  }

  return {
    ...generic,
    email_hint: maskEmail(account.email),
    challenge,
    delivery: 'email' as const,
    message: `Code sent to ${maskEmail(account.email)}`,
  }
}

export async function completePinReset(input: {
  challenge: string
  otp: string
  newPin: string
}) {
  const payload = readChallenge(input.challenge)
  if (!payload) throw new ApiError(400, 'INVALID_CHALLENGE', 'This reset link expired. Request a new code.')
  if (Date.now() > payload.exp) {
    throw new ApiError(400, 'OTP_EXPIRED', 'This code expired. Request a new one.')
  }
  if (!/^\d{4,6}$/.test(input.newPin)) {
    throw new ApiError(400, 'INVALID_PIN', 'PIN must be 4–6 digits.')
  }
  if (!/^\d{6}$/.test(input.otp)) {
    throw new ApiError(400, 'INVALID_OTP', 'Enter the 6-digit code from your email.')
  }

  const expected = sha256(`${payload.userId}:${input.otp}`)
  const a = Buffer.from(expected)
  const b = Buffer.from(payload.otpHash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ApiError(401, 'WRONG_OTP', 'That code is incorrect.')
  }

  const admin = tryCreateAdminClient()
  if (!admin) {
    throw new ApiError(503, 'AUTH_UNAVAILABLE', 'PIN reset needs the live ɃU service role key on this server.')
  }

  const pinHash = await bcrypt.hash(input.newPin, 10)
  const password = strongPinPassword(input.newPin)

  const profileUpdate = await admin.from('profiles').update({ pin_hash: pinHash }).eq('id', payload.userId)
  if (profileUpdate.error && !/does not exist|schema cache/i.test(profileUpdate.error.message)) {
    console.error('pin reset profiles', profileUpdate.error.message)
  }

  const liveUpdate = await admin.from('users').update({ pin_hash: pinHash }).eq('id', payload.userId)
  if (liveUpdate.error && !/does not exist|schema cache/i.test(liveUpdate.error.message)) {
    // Some live schemas use a different column set — try phone match too.
    const variants = phoneLookupVariants(payload.phone)
    for (const variant of variants) {
      await admin.from('users').update({ pin_hash: pinHash }).eq('phone_number', variant)
    }
  }

  const { error: passwordError } = await admin.auth.admin.updateUserById(payload.userId, { password })
  if (passwordError && !/user not found|User not found/i.test(passwordError.message)) {
    console.error('pin reset auth password', passwordError.message)
  }

  return {
    ok: true as const,
    message: 'PIN updated. You can log in with your new PIN.',
    phone: payload.phone,
  }
}
