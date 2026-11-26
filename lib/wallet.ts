import { ApiError } from '@/lib/api/errors'
import { buFromNaira, getBuNairaValue, quotePeerMoveBu } from '@/lib/bu-rate'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { creditFaceThenCharge, debitFaceThenCharge, INSUFFICIENT_ACCOUNT, moveLiveWallet } from '@/lib/wallet/move'
import { isPurposeId, purposeLabel, type PurposeId } from '@/lib/purpose'
import { assertLockedGift, commitLockedGift, createLockedGift, lockedHoldBu } from '@/lib/purpose-gifts'

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
  purpose?: PurposeId
  locked?: boolean
  giftId?: string
}) {
  if (input.fromUserId === input.toUserId) {
    throw new ApiError(400, 'SELF_TRANSFER', 'You cannot send ɃU to yourself')
  }
  const db = tryCreateAdminClient() ?? createDataClient()
  const bu = buFromNaira(input.amount)
  const purpose = isPurposeId(input.purpose) ? input.purpose : undefined
  if (input.giftId) {
    await assertLockedGift({
      giftId: input.giftId,
      spenderId: input.fromUserId,
      vendorId: input.toUserId,
      amountBu: bu,
    })
  } else if (!input.isTip) {
    const held = await lockedHoldBu(input.fromUserId)
    if (held > 0) {
      const dbHold = tryCreateAdminClient() ?? createDataClient()
      const existing = await dbHold.from('wallets').select('*').eq('user_id', input.fromUserId).maybeSingle()
      const row = (existing.data ?? {}) as Record<string, unknown>
      const current = Math.max(
        Number(row.naira) || 0,
        Number(row.naira_available) || 0,
        Number(row.naira_balance) || 0,
        Number(row.balance) || 0,
        Number(row.bu_balance) || 0,
      )
      const free = current - held
      const need = quotePeerMoveBu(bu, input.eventId ? 'spray' : 'transfer').totalDebitNaira
      if (need > free + 1e-9) {
        if (input.amount + 1e-9 > free) {
          throw new ApiError(
            400,
            'LOCKED_GIFT',
            'Part of this balance is locked for a reason. Spend that from the gift on Home.',
          )
        }
        throw new ApiError(400, 'INSUFFICIENT_FUNDS', INSUFFICIENT_ACCOUNT)
      }
    }
  }
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
    note: input.note?.trim() || (purpose ? `For ${purposeLabel(purpose).toLowerCase()}` : null),
    purpose: purpose ?? null,
    locked: Boolean(input.locked && purpose),
    gift_id: input.giftId ?? null,
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
      : purpose
        ? toName
          ? `For ${purposeLabel(purpose).toLowerCase()} to ${toName}`
          : `For ${purposeLabel(purpose).toLowerCase()}`
        : toName
          ? `Sent ɃU to ${toName}`
          : 'Sent ɃU'
  const creditDescription = tipAnonymous
    ? 'Tip received'
    : input.eventId
      ? fromName
        ? `Event spray from ${fromName}`
        : 'Event spray received'
      : purpose
        ? fromName
          ? `For ${purposeLabel(purpose).toLowerCase()} from ${fromName}`
          : `For ${purposeLabel(purpose).toLowerCase()}`
        : fromName
          ? `Received ɃU from ${fromName}`
          : 'Received ɃU'
  const sharedMeta = { ...meta }
  let debited: Awaited<ReturnType<typeof debitFaceThenCharge>>
  try {
    debited = await debitFaceThenCharge(db, {
      userId: input.fromUserId,
      faceNaira: input.amount,
      chargeNaira: feeQuote.feeNaira,
      type: debitType,
      faceDescription: debitDescription,
      metadata: { ...sharedMeta, to: input.toUserId },
    })
  } catch (error) {
    if (error instanceof ApiError && error.code === 'INSUFFICIENT_FUNDS') {
      throw new ApiError(400, 'INSUFFICIENT_FUNDS', INSUFFICIENT_ACCOUNT)
    }
    throw error
  }
  const moveId = debited.faceMoveId
  try {
    await moveLiveWallet(db, {
      userId: input.toUserId,
      naira: input.amount,
      direction: 'credit',
      type: creditType,
      description: creditDescription,
      // Do not attach tipper user id on tip credits — history enrichment would reveal them.
      metadata: tipAnonymous
        ? { ...sharedMeta, move_id: moveId }
        : { ...sharedMeta, move_id: moveId, from: input.fromUserId },
    })
  } catch (error) {
    await creditFaceThenCharge(db, {
      userId: input.fromUserId,
      faceNaira: input.amount,
      chargeNaira: feeQuote.feeNaira,
      faceDescription: 'Send refunded',
      metadata: { ...sharedMeta, refund_of: moveId },
    }).catch(() => undefined)
    throw error
  }
  if (input.giftId) {
    await commitLockedGift(input.giftId, bu)
  }
  if (input.locked && purpose && !input.giftId && !input.isTip) {
    await createLockedGift({
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      fromName,
      purpose,
      amountBu: bu,
    })
  }
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
