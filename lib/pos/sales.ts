import { randomUUID } from 'crypto'
import { ApiError } from '@/lib/api/errors'
import { buFromNaira, nairaFromBu, quotePeerMoveBu, roundMoney } from '@/lib/bu-rate'
import { fetchEventRowBySlug, withLiveTiers } from '@/lib/events/live'
import {
  EVENT_VENDOR_COMMISSION_PCT,
  getApprovedEventVendor,
} from '@/lib/pos/event-vendors'
import { createDataClient } from '@/lib/supabase/data'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { debitFaceThenCharge, moveLiveWallet } from '@/lib/wallet/move'
import { reverseFailedDebit } from '@/lib/wallet/reverse'
import { settleVendorSale } from '@/lib/vendor-settle'

export type PosSaleStatus = 'pending_notes' | 'confirmed' | 'notes_issued' | 'cancelled'

export type PosSale = {
  id: string
  reference: string
  vendor_user_id: string
  celebrant_user_id: string | null
  guest_user_id: string
  event_id: string | null
  mode: 'event' | 'business'
  amount_naira: number
  celebrant_naira: number
  vendor_naira: number
  commission_pct: number
  status: PosSaleStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

function db() {
  return tryCreateAdminClient() ?? createDataClient()
}

function asSale(raw: unknown): PosSale | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const status = String(row.status ?? 'pending_notes') as PosSaleStatus
  const mode = String(row.mode ?? 'business')
  if (mode !== 'event' && mode !== 'business') return null
  return {
    id: String(row.id ?? ''),
    reference: String(row.reference ?? ''),
    vendor_user_id: String(row.vendor_user_id ?? ''),
    celebrant_user_id: row.celebrant_user_id ? String(row.celebrant_user_id) : null,
    guest_user_id: String(row.guest_user_id ?? ''),
    event_id: row.event_id ? String(row.event_id) : null,
    mode,
    amount_naira: Number(row.amount_naira ?? 0),
    celebrant_naira: Number(row.celebrant_naira ?? 0),
    vendor_naira: Number(row.vendor_naira ?? 0),
    commission_pct: Number(row.commission_pct ?? 0),
    status,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export async function listVendorPosSales(vendorUserId: string | string[], limit = 40) {
  const ids = [...new Set((Array.isArray(vendorUserId) ? vendorUserId : [vendorUserId]).filter(Boolean))]
  if (ids.length === 0) return []
  const client = db()
  let query = client
    .from('bu_pos_sales')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  query = ids.length === 1 ? query.eq('vendor_user_id', ids[0]) : query.in('vendor_user_id', ids)
  const { data, error } = await query
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) return []
    throw new ApiError(500, 'POS_LIST_FAILED', error.message)
  }
  const byId = new Map<string, PosSale>()
  for (const raw of data ?? []) {
    const sale = asSale(raw)
    if (sale) byId.set(sale.id, sale)
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

export async function updatePosSaleStatus(input: {
  saleId: string
  vendorUserId: string | string[]
  status: PosSaleStatus
}) {
  const ids = [...new Set((Array.isArray(input.vendorUserId) ? input.vendorUserId : [input.vendorUserId]).filter(Boolean))]
  if (ids.length === 0) throw new ApiError(404, 'NOT_FOUND', 'POS sale not found')
  const client = db()
  const updated = await client
    .from('bu_pos_sales')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', input.saleId)
    .in('vendor_user_id', ids)
    .select('*')
    .maybeSingle()
  if (updated.error) throw new ApiError(500, 'POS_UPDATE_FAILED', updated.error.message)
  if (!updated.data) throw new ApiError(404, 'NOT_FOUND', 'POS sale not found')
  return asSale(updated.data) as PosSale
}

/** Log a business POS sale when a guest pays via Send-to-bank after scanning a bank-settlement QR. */
export async function recordBusinessPosBankSale(input: {
  vendorUserId: string
  guestUserId: string
  amountNaira: number
  withdrawalId: string
  remark?: string | null
}) {
  const vendorUserId = input.vendorUserId.trim()
  const guestUserId = input.guestUserId.trim()
  if (!vendorUserId || !guestUserId) return null
  if (vendorUserId === guestUserId) return null
  const amountNaira = roundMoney(input.amountNaira)
  if (!(amountNaira > 0)) return null

  const client = db()
  const reference = `BANKPOS_${input.withdrawalId.replace(/-/g, '').slice(0, 20)}`
  const meta = {
    kind: 'business_pos_bank',
    mode: 'business',
    settlement: 'bank',
    withdrawal_id: input.withdrawalId,
    remark: input.remark || null,
    vendor_user_id: vendorUserId,
    guest_user_id: guestUserId,
  }

  const insert = await client
    .from('bu_pos_sales')
    .insert({
      id: randomUUID(),
      reference,
      vendor_user_id: vendorUserId,
      celebrant_user_id: null,
      guest_user_id: guestUserId,
      event_id: null,
      mode: 'business',
      amount_naira: amountNaira,
      celebrant_naira: 0,
      vendor_naira: amountNaira,
      commission_pct: 0,
      status: 'notes_issued',
      metadata: meta,
    })
    .select('*')
    .maybeSingle()

  if (insert.error) {
    if (/unique|duplicate/i.test(insert.error.message)) {
      const existing = await client.from('bu_pos_sales').select('*').eq('reference', reference).maybeSingle()
      return asSale(existing.data)
    }
    if (/schema cache|does not exist/i.test(insert.error.message)) return null
    // Don't fail the bank send if history insert fails.
    return null
  }
  return asSale(insert.data)
}

export async function payPosSale(input: {
  guestUserId: string
  vendorUserId: string
  eventId?: string | null
  amountBu: number
}) {
  if (input.guestUserId === input.vendorUserId) {
    throw new ApiError(400, 'SELF_PAY', 'You cannot pay your own POS.')
  }
  const amountBu = roundMoney(input.amountBu, 2)
  if (!(amountBu > 0)) throw new ApiError(400, 'INVALID_AMOUNT', 'Enter how many ɃU to pay.')

  const faceNaira = nairaFromBu(amountBu)
  const feeQuote = quotePeerMoveBu(amountBu, 'transfer')
  const reference = `POS_${randomUUID().replace(/-/g, '').slice(0, 16)}`
  const eventId = input.eventId?.trim() || null

  let mode: 'event' | 'business' = 'business'
  let celebrantId: string | null = null
  let commissionPct = 0
  let celebrantNaira = 0
  let vendorNaira = faceNaira
  let eventTitle = 'Business POS'

  if (eventId) {
    const link = await getApprovedEventVendor(eventId, input.vendorUserId)
    if (!link) {
      throw new ApiError(403, 'VENDOR_NOT_LINKED', 'This vendor is not approved for that event.')
    }
    const row = await fetchEventRowBySlug(eventId)
    if (!row) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found')
    const packed = withLiveTiers(row)
    celebrantId = String((row as { celebrant_id?: string }).celebrant_id || packed.organizer_id || '')
    if (!celebrantId) throw new ApiError(400, 'NO_CELEBRANT', 'Event has no celebrant wallet.')
    if (celebrantId === input.guestUserId) {
      throw new ApiError(400, 'SELF_PAY', 'Celebrant cannot buy notes from their own event POS as guest.')
    }
    mode = 'event'
    commissionPct = Number(link.commission_pct) || EVENT_VENDOR_COMMISSION_PCT
    vendorNaira = roundMoney(faceNaira * (commissionPct / 100))
    celebrantNaira = roundMoney(faceNaira - vendorNaira)
    eventTitle = packed.title || 'Event POS'
  }

  const client = db()
  const meta = {
    kind: 'pos_sale',
    mode,
    event_id: eventId,
    vendor_user_id: input.vendorUserId,
    celebrant_user_id: celebrantId,
    guest_user_id: input.guestUserId,
    amount_bu: amountBu,
    face_naira: faceNaira,
    fee_bu: feeQuote.feeBu,
    total_debit_bu: feeQuote.totalDebitBu,
    commission_pct: commissionPct,
    reference,
    move_id: reference,
  }

  const debited = await debitFaceThenCharge(client, {
    userId: input.guestUserId,
    faceNaira: faceNaira,
    chargeNaira: feeQuote.feeNaira,
    type: 'pos_sale',
    faceDescription: mode === 'event' ? `POS · ${eventTitle}` : 'Business POS purchase',
    metadata: meta,
  })

  try {
    if (mode === 'event' && celebrantId && celebrantNaira > 0) {
      await moveLiveWallet(client, {
        userId: celebrantId,
        naira: celebrantNaira,
        direction: 'credit',
        type: 'pos_sale',
        description: `POS sale · ${eventTitle}`,
        metadata: { ...meta, move_id: `${reference}_c`, share: 'celebrant' },
      })
    }
    if (vendorNaira > 0) {
      await moveLiveWallet(client, {
        userId: input.vendorUserId,
        naira: vendorNaira,
        direction: 'credit',
        type: mode === 'event' ? 'vendor_commission' : 'pos_sale',
        description:
          mode === 'event' ? `Vendor commission · ${eventTitle}` : 'Business POS sale',
        metadata: { ...meta, move_id: `${reference}_v`, share: 'vendor' },
      })
    }

    const insert = await client
      .from('bu_pos_sales')
      .insert({
        id: randomUUID(),
        reference,
        vendor_user_id: input.vendorUserId,
        celebrant_user_id: celebrantId,
        guest_user_id: input.guestUserId,
        event_id: eventId,
        mode,
        amount_naira: faceNaira,
        celebrant_naira: celebrantNaira,
        vendor_naira: vendorNaira,
        commission_pct: commissionPct,
        status: 'pending_notes',
        metadata: meta,
      })
      .select('*')
      .maybeSingle()

    if (insert.error) {
      if (/schema cache|does not exist/i.test(insert.error.message)) {
        throw new ApiError(503, 'POS_SQL_REQUIRED', 'Run supabase/migrations/0034_vendor_pos.sql in Supabase.')
      }
      throw new ApiError(500, 'POS_SAVE_FAILED', insert.error.message)
    }

    if (mode === 'business' && vendorNaira > 0) {
      await settleVendorSale(input.vendorUserId, vendorNaira).catch(() => undefined)
    }

    return {
      sale: asSale(insert.data) as PosSale,
      amountBu,
      amountNaira: faceNaira,
      totalDebitBu: feeQuote.totalDebitBu,
      celebrantBu: buFromNaira(celebrantNaira),
      vendorBu: buFromNaira(vendorNaira),
      eventTitle,
    }
  } catch (error) {
    await reverseFailedDebit(client, {
      userId: input.guestUserId,
      originalReference: debited.faceMoveId,
      naira: debited.face,
      reason: error instanceof Error ? error.message : 'pos_pay_failed',
    }).catch(() => undefined)
    if (debited.chargeMoveId && debited.charge > 0) {
      await reverseFailedDebit(client, {
        userId: input.guestUserId,
        originalReference: debited.chargeMoveId,
        naira: debited.charge,
        reason: error instanceof Error ? error.message : 'pos_pay_failed',
      }).catch(() => undefined)
    }
    throw error
  }
}
