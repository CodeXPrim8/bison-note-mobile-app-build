import { ApiError } from '@/lib/api/errors'
import { buFromNaira, getBuNairaValue } from '@/lib/bu-rate'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { moveLiveWallet } from '@/lib/wallet/move'

async function liveUserLabel(userId: string) {
  const db = tryCreateAdminClient() ?? createDataClient()
  const { data } = await db
    .from('users')
    .select('first_name, last_name, account_name, phone_number')
    .eq('id', userId)
    .maybeSingle()
  const row = data as Record<string, unknown> | null
  if (!row) return ''
  const name = [row.first_name, row.last_name].filter((part) => typeof part === 'string' && part.trim()).join(' ').trim()
  if (name) return name
  if (typeof row.account_name === 'string' && row.account_name.trim()) return row.account_name.trim()
  if (typeof row.phone_number === 'string' && row.phone_number.trim()) return row.phone_number.trim()
  return ''
}

export async function transferBu(input: {
  fromUserId: string
  toUserId: string
  amount: number
  eventId?: string
  isTip?: boolean
  note?: string
}) {
  if (input.fromUserId === input.toUserId) {
    throw new ApiError(400, 'SELF_TRANSFER', 'You cannot send ɃU to yourself')
  }
  const db = tryCreateAdminClient() ?? createDataClient()
  const bu = buFromNaira(input.amount)
  const [fromName, toName] = await Promise.all([liveUserLabel(input.fromUserId), liveUserLabel(input.toUserId)])
  const meta = {
    kind: input.eventId ? 'spray' : input.isTip ? 'tip' : 'transfer',
    bu,
    naira: input.amount,
    value_rate: getBuNairaValue(),
    event_id: input.eventId ?? null,
    from_name: fromName,
    to_name: toName,
    note: input.note?.trim() || null,
  }
  const debitType = 'spray'
  const creditType = 'spray_credit'
  const debitDescription = input.isTip
    ? toName
      ? `Tip to ${toName}`
      : 'Tip'
    : toName
      ? `BU transfer to ${toName}`
      : 'BU transfer'
  const creditDescription = input.isTip
    ? fromName
      ? `Tip received from ${fromName}`
      : 'Tip received'
    : fromName
      ? `BU received from ${fromName}`
      : 'BU received'
  const moveId = crypto.randomUUID()
  const sharedMeta = { ...meta, move_id: moveId }
  await moveLiveWallet(db, {
    userId: input.fromUserId,
    naira: input.amount,
    direction: 'debit',
    type: debitType,
    description: debitDescription,
    metadata: { ...sharedMeta, to: input.toUserId },
  })
  await moveLiveWallet(db, {
    userId: input.toUserId,
    naira: input.amount,
    direction: 'credit',
    type: creditType,
    description: creditDescription,
    metadata: { ...sharedMeta, from: input.fromUserId },
  })
  return {
    moveId,
    fromName,
    toName,
    bu,
    naira: input.amount,
    kind: input.eventId ? 'spray' : input.isTip ? 'tip' : 'transfer',
  }
}
