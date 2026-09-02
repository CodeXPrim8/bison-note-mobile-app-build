import { randomInt, randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { ApiError } from '@/lib/api/errors'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { normalizePhone } from '@/lib/phone'
import { createDataClient } from '@/lib/supabase/data'

function splitName(name?: string | null) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const first_name = parts[0] || 'Guest'
  const last_name = parts.slice(1).join(' ') || null
  return { first_name, last_name, account_name: [first_name, last_name].filter(Boolean).join(' ') }
}

function syntheticPhone(userId: string) {
  const digits = userId.replace(/\D/g, '').padEnd(8, '0').slice(0, 8)
  return `234000${digits.slice(0, 7)}`
}

async function tryWallet(userId: string) {
  const db = createDataClient()
  const first = await db.from('wallets').upsert(
    { user_id: userId, bu_balance: 0, naira_available: 0 },
    { onConflict: 'user_id' },
  )
  if (!first.error) return
  await db.from('wallets').upsert({ user_id: userId, balance: 0 } as never, { onConflict: 'user_id' })
}

/** Find an existing live ɃU user, or mint a guest so tickets have a buyer_id. */
export async function ensureGatewayGuestUser(input: {
  email: string
  name?: string | null
  phone?: string | null
}): Promise<string> {
  const existing = await resolveLiveCelebrantId({
    id: '',
    email: input.email,
    phone: input.phone,
  })
  if (existing) return existing

  const db = createDataClient()
  const id = randomUUID()
  const phone = normalizePhone(input.phone ?? '') || syntheticPhone(id)
  const names = splitName(input.name)
  const pin_hash = await bcrypt.hash(String(100000 + randomInt(900000)), 10)

  const insert = await db
    .from('users')
    .insert({
      id,
      phone_number: phone,
      first_name: names.first_name,
      last_name: names.last_name,
      account_name: names.account_name,
      email: input.email.trim().toLowerCase(),
      role: 'guest',
      pin_hash,
    })
    .select('id')
    .maybeSingle()

  if (insert.data && typeof (insert.data as { id?: string }).id === 'string') {
    const userId = (insert.data as { id: string }).id
    await tryWallet(userId)
    return userId
  }

  const retry = await resolveLiveCelebrantId({
    id: '',
    email: input.email,
    phone: input.phone || phone,
  })
  if (retry) return retry

  throw new ApiError(
    503,
    'GUEST_CREATE_FAILED',
    insert.error?.message ?? 'Could not create a guest buyer for this ticket.',
  )
}
