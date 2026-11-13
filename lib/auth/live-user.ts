import bcrypt from 'bcryptjs'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { lookupLiveUser } from '@/lib/events/live'
import { normalizePhone } from '@/lib/phone'

function splitName(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  const first_name = parts[0] || 'Bucks'
  const last_name = parts.slice(1).join(' ') || null
  const account_name = [first_name, last_name].filter(Boolean).join(' ')
  return { first_name, last_name, account_name }
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

  const payload: Record<string, unknown> = {
    id: input.id,
    phone_number: phone,
    first_name: names.first_name,
    last_name: names.last_name,
    account_name: names.account_name,
    email: input.email?.trim().toLowerCase() || null,
    role: input.role === 'organizer' ? 'organizer' : 'guest',
    pin_hash,
  }

  const inserted = await db.from('users').insert(payload).select('id').maybeSingle()
  if (!inserted.error && inserted.data && typeof (inserted.data as { id?: string }).id === 'string') {
    await ensureWallet((inserted.data as { id: string }).id)
    return { ok: true, userId: (inserted.data as { id: string }).id }
  }

  // Some live schemas omit pin_hash or role constraints — retry a leaner row.
  if (inserted.error) {
    const lean = await db
      .from('users')
      .insert({
        id: input.id,
        phone_number: phone,
        first_name: names.first_name,
        last_name: names.last_name,
        account_name: names.account_name,
        email: input.email?.trim().toLowerCase() || null,
      })
      .select('id')
      .maybeSingle()
    if (!lean.error && lean.data && typeof (lean.data as { id?: string }).id === 'string') {
      await ensureWallet((lean.data as { id: string }).id)
      return { ok: true, userId: (lean.data as { id: string }).id }
    }
    console.error('ensureLiveBuUser', inserted.error.message, lean.error?.message)
    return { ok: false, reason: lean.error?.message || inserted.error.message }
  }

  return { ok: false, reason: 'insert failed' }
}
