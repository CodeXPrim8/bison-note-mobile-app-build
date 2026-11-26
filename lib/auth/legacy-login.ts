import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { createClient } from '@/lib/supabase/server'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { normalizePhone, phoneLookupVariants } from '@/lib/phone'
import type { BuSession } from '@/lib/auth/bu-session-token'
import { contactEmail } from '@/lib/auth/pin'
import { assertPinOpen, clearPinFailures, notePinFailure, pinAttemptKeys } from '@/lib/auth/pin-attempts'

export interface LegacyUserRow {
  id: string
  email: string | null
  phone_number: string | null
  pin_hash: string | null
  first_name: string | null
  last_name: string | null
  account_name: string | null
  role: string | null
}

function toSession(row: LegacyUserRow): Omit<BuSession, 'exp'> {
  const email = contactEmail(row.email)
  const display =
    [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
    row.account_name ||
    email ||
    'ɃU member'
  return {
    id: row.id,
    email,
    display_name: display,
    phone: row.phone_number,
    phone_e164: row.phone_number ? normalizePhone(row.phone_number) : null,
    role: row.role || 'guest',
  }
}

function sha(alg: string, value: string) {
  return createHash(alg).update(value, 'utf8').digest('hex')
}

export async function pinMatches(pin: string, pinHash: string | null): Promise<boolean> {
  if (!pinHash) return false
  const hash = pinHash.trim()
  if (!hash) return false
  if (hash.startsWith('$2')) {
    try {
      if (await bcrypt.compare(pin, hash)) return true
    } catch {
      return false
    }
  }
  if (hash === pin) return true
  const lower = hash.toLowerCase()
  if (lower === sha('sha256', pin) || lower === sha('sha256', pin.trim())) return true
  if (lower === sha('sha1', pin) || lower === sha('md5', pin)) return true
  return false
}

function last10(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
}

async function rowForPhone(phone: string): Promise<LegacyUserRow | null | { missingVerifier: true }> {
  const admin = tryCreateAdminClient()
  const columns = 'id, email, phone_number, pin_hash, first_name, last_name, account_name, role'
  const needle = last10(phone)

  if (admin) {
    const variants = phoneLookupVariants(phone)
    // Parallel exact lookups — cut multi-hop wait on transaction PIN checks.
    const exactHits = await Promise.all(
      variants.map((variant) => admin.from('users').select(columns).eq('phone_number', variant).maybeSingle()),
    )
    for (const hit of exactHits) {
      if (hit.data) return hit.data as LegacyUserRow
    }
    if (needle.length === 10) {
      const { data } = await admin.from('users').select(columns).ilike('phone_number', `%${needle}%`).limit(5)
      const match = (data as LegacyUserRow[] | null)?.find((row) => last10(row.phone_number ?? '') === needle)
      if (match) return match
    }
    return null
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bu_login_row', { p_phone: phone })
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message) || /crypt\(/i.test(error.message)) {
      return { missingVerifier: true }
    }
    console.error('bu_login_row failed', error.message)
    return { missingVerifier: true }
  }
  const row = Array.isArray(data) ? data[0] : data
  return row?.id ? (row as LegacyUserRow) : null
}

export async function verifyLegacyBuPin(
  phone: string,
  pin: string,
  options?: { skipAttemptGuard?: boolean },
): Promise<{ session: Omit<BuSession, 'exp'> } | { missingVerifier: true } | { invalid: true } | { wrongPin: true }> {
  const keys = options?.skipAttemptGuard ? [] : pinAttemptKeys({ phone })
  if (keys.length) await assertPinOpen(keys)
  const row = await rowForPhone(phone)
  if (row && 'missingVerifier' in row) return { missingVerifier: true }
  if (!row) return { invalid: true }
  if (!(await pinMatches(pin, row.pin_hash))) {
    if (keys.length) await notePinFailure(keys)
    return { wrongPin: true }
  }
  if (keys.length) await clearPinFailures(keys)
  await upgradeWeakPinHash(row.id, pin, row.pin_hash)
  return { session: toSession(row) }
}

/** Replace plaintext / MD5 / SHA pins with bcrypt after a successful check. Failure must not block sign-in. */
export async function upgradeWeakPinHash(userId: string, pin: string, currentHash: string | null) {
  const hash = currentHash?.trim() ?? ''
  if (!userId || !hash || hash.startsWith('$2')) return
  const admin = tryCreateAdminClient()
  if (!admin) return
  try {
    const pinHash = await bcrypt.hash(pin, 10)
    await admin.from('users').update({ pin_hash: pinHash }).eq('id', userId)
    const profiles = await admin.from('profiles').update({ pin_hash: pinHash }).eq('id', userId)
    if (profiles.error && !/does not exist|schema cache|column/i.test(profiles.error.message)) {
      console.error('pin upgrade skipped', profiles.error.message)
    }
  } catch (error) {
    console.error('pin upgrade skipped', error instanceof Error ? error.message : 'unknown')
  }
}

/** True when this phone is already a ɃU account (live users table). */
export async function liveAccountExistsForPhone(phone: string): Promise<boolean> {
  const row = await rowForPhone(phone)
  if (!row || 'missingVerifier' in row) return false
  return Boolean(row.id)
}
