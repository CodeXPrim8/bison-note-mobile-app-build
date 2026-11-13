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

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
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
    if (error) {
      if (/pin_hash|column|schema cache|does not exist/i.test(error.message)) continue
      return null
    }
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
      if (error) {
        if (/pin_hash|column|schema cache|does not exist/i.test(error.message)) continue
        break
      }
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

async function ensureViaRpc(input: {
  id: string
  phone: string
  first_name: string
  last_name: string
  email?: string | null
  pin_hash?: string | null
  role?: string | null
}): Promise<string | null> {
  const db = tryCreateAdminClient() ?? createDataClient()
  const rpc = await db.rpc('bu_ensure_live_user', {
    p_id: input.id,
    p_phone: input.phone,
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_email: input.email ?? null,
    p_pin_hash: input.pin_hash ?? null,
    p_role: input.role ?? 'guest',
  })
  if (rpc.error) {
    if (!/could not find the function|schema cache|PGRST202/i.test(rpc.error.message)) {
      console.error('bu_ensure_live_user', rpc.error.message)
    }
    return null
  }
  if (typeof rpc.data === 'string') return rpc.data
  if (Array.isArray(rpc.data) && typeof rpc.data[0] === 'string') return rpc.data[0]
  return asId(rpc.data)
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

  const viaRpc = await ensureViaRpc({
    id: input.id,
    phone,
    first_name: names.first_name,
    last_name: names.last_name,
    email: input.email,
    pin_hash,
    role,
  })
  if (viaRpc) {
    await ensureWallet(viaRpc)
    return { ok: true, userId: viaRpc }
  }

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
    }
  }

  console.error('ensureLiveBuUser', lastError)
  return { ok: false, reason: lastError || 'insert failed' }
}

async function backfillFromAuth(buId: string) {
  const db = tryCreateAdminClient() ?? createDataClient()
  const rpc = await db.rpc('bu_backfill_live_user_by_phone', { p_phone: buId })
  if (rpc.error) {
    if (!/could not find the function|schema cache|PGRST202/i.test(rpc.error.message)) {
      console.error('bu_backfill_live_user_by_phone', rpc.error.message)
    }
    return null
  }
  const row = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as
    | { user_id?: string; phone_number?: string; display_name?: string }
    | null
    | undefined
  const id = asId(row?.user_id)
  if (!id) return null
  return {
    id,
    display_name: row?.display_name || 'Bucks member',
    phone: row?.phone_number || normalizePhone(buId),
    email: null as string | null,
  }
}

/**
 * Send-ɃU recipient lookup: live users first, then sync website profiles / auth into live users.
 */
export async function resolveSendBuRecipient(buId: string) {
  const found = await lookupLiveUser(buId)
  if (found?.id) return found

  const profile = await findProfileByBuId(buId)
  if (profile?.id) {
    const phone = profile.phone_e164 || profile.phone || buId
    const synced = await ensureLiveBuUser({
      id: profile.id,
      displayName: profile.display_name || 'Bucks member',
      phone,
      email: profile.email,
      pinHash: profile.pin_hash,
      role: profile.role,
    })
    if (synced.ok === true) {
      return (
        (await lookupLiveUser(phone)) ?? {
          id: synced.userId,
          display_name: profile.display_name || 'Bucks member',
          phone: normalizePhone(phone),
          email: profile.email,
        }
      )
    }
  }

  const backfilled = await backfillFromAuth(buId)
  if (backfilled?.id) {
    return (await lookupLiveUser(buId)) ?? backfilled
  }

  return null
}
