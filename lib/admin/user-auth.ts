import bcrypt from 'bcryptjs'
import { ApiError } from '@/lib/api/errors'
import { pinMatches, verifyLegacyBuPin } from '@/lib/auth/legacy-login'
import { contactEmail, pinSchema, supabasePinPassword } from '@/lib/auth/pin'
import { normalizePhone, phoneLookupVariants } from '@/lib/phone'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function requireAdminPin(adminPhone: string | null | undefined, adminPin: string) {
  const pin = pinSchema.parse(adminPin)
  if (!adminPhone) {
    throw new ApiError(400, 'PIN_REQUIRED', 'Your Super Admin session has no phone for PIN check.')
  }
  const check = await verifyLegacyBuPin(adminPhone, pin)
  if ('wrongPin' in check) throw new ApiError(401, 'WRONG_PIN', 'Incorrect Super Admin PIN.')
  if ('invalid' in check) {
    throw new ApiError(401, 'ADMIN_NOT_FOUND', 'Could not verify Super Admin PIN for this account.')
  }
  if ('missingVerifier' in check || !('session' in check)) {
    throw new ApiError(400, 'PIN_NOT_SET', 'Create your transaction PIN before unlocking auth controls.')
  }
  return check.session
}

function pinHashKind(hash: string | null | undefined) {
  if (!hash?.trim()) return 'none' as const
  if (hash.startsWith('$2')) return 'bcrypt' as const
  return 'legacy' as const
}

export async function readUserAuthSummary(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from('users')
    .select('id, phone_number, email, pin_hash')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new ApiError(500, 'USER_LOOKUP_FAILED', error.message)
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'User not found')
  const row = data as { id: string; phone_number?: string | null; email?: string | null; pin_hash?: string | null }
  const hash = typeof row.pin_hash === 'string' ? row.pin_hash : null
  return {
    user_id: row.id,
    phone: row.phone_number ?? null,
    email: row.email ?? null,
    pin_set: Boolean(hash?.trim()),
    pin_hash_kind: pinHashKind(hash),
    login_method: 'phone + PIN',
  }
}

async function saveUsersPinHash(
  admin: SupabaseClient,
  userId: string,
  phone: string | null,
  pinHash: string,
): Promise<boolean> {
  let saved = false
  const byId = await admin.from('users').update({ pin_hash: pinHash }).eq('id', userId).select('id').maybeSingle()
  if (!byId.error && byId.data?.id) saved = true

  if (phone) {
    for (const variant of phoneLookupVariants(phone)) {
      const byPhone = await admin
        .from('users')
        .update({ pin_hash: pinHash })
        .eq('phone_number', variant)
        .select('id')
      if (!byPhone.error && (byPhone.data?.length ?? 0) > 0) saved = true
    }
  }
  return saved
}

async function saveProfilesPinHash(
  admin: SupabaseClient,
  userId: string,
  phone: string | null,
  pinHash: string,
): Promise<void> {
  const byId = await admin.from('profiles').update({ pin_hash: pinHash }).eq('id', userId)
  if (byId.error && !/does not exist|schema cache|column/i.test(byId.error.message)) {
    console.error('admin set pin profiles', byId.error.message)
  }
  const phoneE164 = phone ? normalizePhone(phone) : null
  if (!phoneE164) return
  for (const column of ['phone_e164', 'phone'] as const) {
    const res = await admin.from('profiles').update({ pin_hash: pinHash }).eq(column, phoneE164)
    if (res.error && !/does not exist|schema cache|column/i.test(res.error.message)) {
      console.error(`admin set pin profiles.${column}`, res.error.message)
    }
  }
}

async function authIdsForUser(
  admin: SupabaseClient,
  userId: string,
  phone: string | null,
  email: string | null,
): Promise<string[]> {
  const ids = new Set<string>([userId])
  const phoneE164 = phone ? normalizePhone(phone) : null
  if (phoneE164) {
    for (const column of ['phone_e164', 'phone'] as const) {
      const { data } = await admin.from('profiles').select('id').eq(column, phoneE164).limit(5)
      for (const row of data ?? []) {
        if (row?.id) ids.add(String(row.id))
      }
    }
  }
  const ticket = contactEmail(email)
  if (ticket) {
    const { data } = await admin.from('profiles').select('id').eq('email', ticket).limit(5)
    for (const row of data ?? []) {
      if (row?.id) ids.add(String(row.id))
    }
  }
  return [...ids]
}

async function updateAuthPassword(
  admin: NonNullable<ReturnType<typeof tryCreateAdminClient>>,
  userId: string,
  phone: string | null,
  email: string | null,
  password: string,
): Promise<boolean> {
  const ids = await authIdsForUser(admin, userId, phone, email)
  let updated = false
  let lastHardError: string | null = null
  for (const id of ids) {
    const { error } = await admin.auth.admin.updateUserById(id, { password })
    if (!error) {
      updated = true
      continue
    }
    if (/user not found|User not found/i.test(error.message)) continue
    lastHardError = error.message
  }
  if (!updated && lastHardError) {
    throw new ApiError(500, 'PASSWORD_UPDATE_FAILED', lastHardError)
  }
  // No Auth user is OK when live PIN hash still drives phone login.
  return updated
}

async function verifySavedPin(admin: SupabaseClient, userId: string, phone: string | null, newPin: string) {
  const byId = await admin.from('users').select('pin_hash').eq('id', userId).maybeSingle()
  if (!byId.error && (await pinMatches(newPin, (byId.data?.pin_hash as string | null) ?? null))) {
    return true
  }
  if (!phone) return false
  for (const variant of phoneLookupVariants(phone)) {
    const byPhone = await admin.from('users').select('pin_hash').eq('phone_number', variant).maybeSingle()
    if (!byPhone.error && (await pinMatches(newPin, (byPhone.data?.pin_hash as string | null) ?? null))) {
      return true
    }
  }
  return false
}

export async function adminSetUserPin(input: {
  db: SupabaseClient
  userId: string
  phone: string | null
  email?: string | null
  newPin: string
}) {
  const newPin = pinSchema.parse(input.newPin)
  const admin = tryCreateAdminClient()
  if (!admin) {
    throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Setting a PIN needs the live ɃU service role key on this server.')
  }
  const pinHash = await bcrypt.hash(newPin, 10)
  const password = supabasePinPassword(newPin)

  await saveProfilesPinHash(admin, input.userId, input.phone, pinHash)
  const hashSaved = await saveUsersPinHash(admin, input.userId, input.phone, pinHash)
  const authUpdated = await updateAuthPassword(admin, input.userId, input.phone, input.email ?? null, password)

  const verified = await verifySavedPin(admin, input.userId, input.phone, newPin)
  if (!verified) {
    throw new ApiError(
      500,
      'PASSWORD_UPDATE_FAILED',
      hashSaved || authUpdated
        ? 'Password write did not verify. Refresh and try again.'
        : 'Could not save the new password for this user.',
    )
  }

  return { ok: true as const, pin_set: true, auth_updated: authUpdated }
}
