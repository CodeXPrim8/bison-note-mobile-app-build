import { ApiError } from '@/lib/api/errors'
import { buFromNaira, getBuNairaValue, quotePeerMoveBu } from '@/lib/bu-rate'
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
  const kind = input.eventId ? 'spray' : input.isTip ? 'tip' : 'transfer'
  const feeQuote = quotePeerMoveBu(bu, kind)
  const [fromName, toName] = await Promise.all([liveUserLabel(input.fromUserId), liveUserLabel(input.toUserId)])
  const tipAnonymous = Boolean(input.isTip)
  const meta = {
    kind,
    bu,
    naira: input.amount,
    fee_bu: feeQuote.feeBu,
    fee_naira: feeQuote.feeNaira,
    total_debit_bu: feeQuote.totalDebitBu,
    total_debit_naira: feeQuote.totalDebitNaira,
    value_rate: getBuNairaValue(),
    event_id: input.eventId ?? null,
    // Tips stay anonymous for the recipient — never expose tipper name/phone/id there.
    from_name: tipAnonymous ? null : fromName,
    to_name: toName,
    note: input.note?.trim() || null,
    anonymous: tipAnonymous || null,
  }
  const debitType = 'spray'
  const creditType = 'spray_credit'
  const debitDescription = input.isTip
    ? toName
      ? `Tip to ${toName}`
      : 'Tip'
    : input.eventId
      ? toName
        ? `Event spray to ${toName}`
        : 'Event spray'
      : toName
        ? `Sent ɃU to ${toName}`
        : 'Sent ɃU'
  const creditDescription = tipAnonymous
    ? 'Tip received'
    : input.eventId
      ? fromName
        ? `Event spray from ${fromName}`
        : 'Event spray received'
      : fromName
        ? `Received ɃU from ${fromName}`
        : 'Received ɃU'
  const moveId = crypto.randomUUID()
  const sharedMeta = { ...meta, move_id: moveId }
  await moveLiveWallet(db, {
    userId: input.fromUserId,
    naira: feeQuote.totalDebitNaira,
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
    // Do not attach tipper user id on tip credits — history enrichment would reveal them.
    metadata: tipAnonymous ? { ...sharedMeta } : { ...sharedMeta, from: input.fromUserId },
  })
  return {
    moveId,
    fromName: tipAnonymous ? '' : fromName,
    toName,
    bu,
    naira: input.amount,
    feeBu: feeQuote.feeBu,
    feeNaira: feeQuote.feeNaira,
    totalDebitBu: feeQuote.totalDebitBu,
    totalDebitNaira: feeQuote.totalDebitNaira,
    kind,
  }
}
