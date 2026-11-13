import bcrypt from 'bcryptjs'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { lookupLiveUser } from '@/lib/events/live'
import { normalizePhone, phoneLookupVariants } from '@/lib/phone'

function splitName(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  const first_name = parts[0] || 'Bucks'
  const last_name = parts.slice(1).join(' ') || 'Member'
  const account_name = [first_name, last_name].filter(Boolean).join(' ')
  return { first_name, last_name, account_name }
}

function isDuplicate(message?: string | null) {
  return /duplicate|unique|already exists/i.test(message ?? '')
}

async function ensureWallet(userId: string) {
  const db = tryCreateAdminClient() ?? createDataClient()
  const first = await db.from('wallets').upsert(
    { user_id: userId, bu_balance: 0, naira_available: 0 },
    { onConflict: 'user_id' },
  )
  if (!first.error) return
  await db.from('wallets').upsert({ user_id: userId, balance: 0 } as never, { onConflict: 'user_id' })
}

type ProfileHit = {
  id: string
  display_name: string | null
  email: string | null
  phone: string | null
  phone_e164: string | null
  pin_hash: string | null
  role: string | null
}

const PROFILE_COLUMNS = 'id, display_name, email, phone, phone_e164, pin_hash, role'
const PROFILE_COLUMNS_LEAN = 'id, display_name, email, phone, phone_e164, role'

function asProfileHit(data: Record<string, unknown> | null | undefined): ProfileHit | null {
  if (!data || typeof data.id !== 'string') return null
  return {
    id: data.id,
    display_name: typeof data.display_name === 'string' ? data.display_name : null,
    email: typeof data.email === 'string' ? data.email : null,
    phone: typeof data.phone === 'string' ? data.phone : null,
    phone_e164: typeof data.phone_e164 === 'string' ? data.phone_e164 : null,
    pin_hash: typeof data.pin_hash === 'string' ? data.pin_hash : null,
    role: typeof data.role === 'string' ? data.role : null,
  }
}

async function selectProfile(eqColumn: 'phone_e164' | 'phone', variant: string): Promise<ProfileHit | null> {
  const db = tryCreateAdminClient() ?? createDataClient()
  for (const columns of [PROFILE_COLUMNS, PROFILE_COLUMNS_LEAN]) {
    const { data, error } = await db.from('profiles').select(columns).eq(eqColumn, variant).maybeSingle()
    if (error && /pin_hash|column/i.test(error.message)) continue
    const hit = asProfileHit(data as Record<string, unknown> | null)
    if (hit) return hit
  }
  return null
}

/** Find a website profile that owns this ɃU ID / phone. */
export async function findProfileByBuId(phone: string): Promise<ProfileHit | null> {
  const db = tryCreateAdminClient() ?? createDataClient()
  const variants = phoneLookupVariants(phone)
  for (const variant of variants) {
    const byE164 = await selectProfile('phone_e164', variant)
    if (byE164) return byE164
    const byPhone = await selectProfile('phone', variant)
    if (byPhone) return byPhone
  }

  const needle = phone.replace(/[^\d]/g, '').slice(-10)
  if (needle.length === 10) {
    for (const columns of [PROFILE_COLUMNS, PROFILE_COLUMNS_LEAN]) {
      const { data, error } = await db
        .from('profiles')
        .select(columns)
        .or(`phone_e164.ilike.%${needle}%,phone.ilike.%${needle}%`)
        .limit(8)
      if (error && /pin_hash|column/i.test(error.message)) continue
      const match = ((data as Record<string, unknown>[] | null) ?? []).find((row) => {
        const digits = String(row.phone_e164 || row.phone || '').replace(/[^\d]/g, '')
        return digits.slice(-10) === needle
      })
      const hit = asProfileHit(match)
      if (hit) return hit
      break
    }
  }
  return null
}

/**
 * Make sure a signed-up account exists in live `users` so Send ɃU / lookup can find them.
 * Uses the same id as auth/profiles when possible.
 */
export async function ensureLiveBuUser(input: {
  id: string
  displayName: string
  phone: string
  email?: string | null
  pin?: string
  pinHash?: string | null
  role?: string | null
}): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const phone = normalizePhone(input.phone)
  if (!phone) return { ok: false, reason: 'invalid phone' }
  if (!input.id) return { ok: false, reason: 'missing id' }

  const db = tryCreateAdminClient() ?? createDataClient()
  const byId = await db.from('users').select('id').eq('id', input.id).maybeSingle()
  if (byId.data && typeof (byId.data as { id?: string }).id === 'string') {
    return { ok: true, userId: (byId.data as { id: string }).id }
  }

  const existing = await lookupLiveUser(phone)
  if (existing?.id) {
    return { ok: true, userId: existing.id }
  }

  const names = splitName(input.displayName)
  const pin_hash =
    input.pinHash ||
    (input.pin ? await bcrypt.hash(input.pin, 10) : await bcrypt.hash(`bu${input.id.replace(/-/g, '').slice(0, 8)}`, 10))

  const role =
    input.role === 'organizer' ||
    input.role === 'celebrant' ||
    input.role === 'vendor' ||
    input.role === 'merchant' ||
    input.role === 'guest'
      ? input.role
      : 'guest'

  const attempts: Record<string, unknown>[] = [
    {
      id: input.id,
      phone_number: phone,
      first_name: names.first_name,
      last_name: names.last_name,
      account_name: names.account_name,
      email: input.email?.trim().toLowerCase() || null,
      role,
      pin_hash,
    },
    {
      id: input.id,
      phone_number: phone,
      first_name: names.first_name,
      last_name: names.last_name,
      account_name: names.account_name,
      email: input.email?.trim().toLowerCase() || null,
      pin_hash,
    },
    {
      id: input.id,
      phone_number: phone,
      first_name: names.first_name,
      last_name: names.last_name,
      account_name: names.account_name,
      email: input.email?.trim().toLowerCase() || null,
      role,
    },
    {
      id: input.id,
      phone_number: phone,
      first_name: names.first_name,
      last_name: names.last_name,
      account_name: names.account_name,
    },
    {
      id: input.id,
      phone_number: `+${phone}`,
      first_name: names.first_name,
      last_name: names.last_name,
      account_name: names.account_name,
      email: input.email?.trim().toLowerCase() || null,
      role,
      pin_hash,
    },
    {
      id: input.id,
      phone_number: phone.startsWith('234') && phone.length === 13 ? `0${phone.slice(3)}` : phone,
      first_name: names.first_name,
      last_name: names.last_name,
      account_name: names.account_name,
      email: input.email?.trim().toLowerCase() || null,
      role,
      pin_hash,
    },
  ]

  let lastError: string | null = null
  for (const payload of attempts) {
    const inserted = await db.from('users').insert(payload).select('id').maybeSingle()
    if (!inserted.error && inserted.data && typeof (inserted.data as { id?: string }).id === 'string') {
      await ensureWallet((inserted.data as { id: string }).id)
      return { ok: true, userId: (inserted.data as { id: string }).id }
    }
    lastError = inserted.error?.message ?? lastError
    if (isDuplicate(inserted.error?.message)) {
      const again = await lookupLiveUser(phone)
      if (again?.id) return { ok: true, userId: again.id }
      const bySameId = await db.from('users').select('id').eq('id', input.id).maybeSingle()
      if (bySameId.data && typeof (bySameId.data as { id?: string }).id === 'string') {
        return { ok: true, userId: (bySameId.data as { id: string }).id }
      }
    }
  }

  console.error('ensureLiveBuUser', lastError)
  return { ok: false, reason: lastError || 'insert failed' }
}

/**
 * Send-ɃU recipient lookup: live users first, then sync website profiles into live users.
 */
export async function resolveSendBuRecipient(buId: string) {
  const found = await lookupLiveUser(buId)
  if (found?.id) return found

  const profile = await findProfileByBuId(buId)
  if (!profile?.id) return null

  const phone = profile.phone_e164 || profile.phone || buId
  const synced = await ensureLiveBuUser({
    id: profile.id,
    displayName: profile.display_name || 'Bucks member',
    phone,
    email: profile.email,
    pinHash: profile.pin_hash,
    role: profile.role,
  })
  if (synced.ok === false) {
    console.error('resolveSendBuRecipient sync failed', synced.reason)
    return null
  }

  return (
    (await lookupLiveUser(phone)) ?? {
      id: synced.userId,
      display_name: profile.display_name || 'Bucks member',
      phone: normalizePhone(phone),
      email: profile.email,
    }
  )
}
