import { createDataClient } from '@/lib/supabase/data'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { roundMoney } from '@/lib/bu-rate'
import { ACCOUNT_ROLES_SQL_HINT, lookupAffiliateByCode } from '@/lib/account/roles'

export type SaleShareInput = {
  reference: string
  eventId: string
  organiserUserId: string
  ticketNaira: number
  affiliateEnabled: boolean
  affiliateCommissionPct: number
  affiliateCode?: string | null
}

export type SaleShareResult = {
  organiserUserId: string
  organiserNaira: number
  affiliateUserId: string | null
  affiliateNaira: number
}

function asNumber(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function creditShare(input: {
  userId: string
  naira: number
  kind: 'organiser_sale' | 'affiliate_commission'
  reference: string
  eventId: string
  organiserId: string
  affiliateId: string | null
  metadata: Record<string, unknown>
}) {
  if (!input.userId || input.naira <= 0) return { ok: false as const, reason: 'skip' }
  const db = createDataClient()
  const rpc = await db.rpc('bu_credit_sale_share', {
    p_user_id: input.userId,
    p_naira: input.naira,
    p_kind: input.kind,
    p_reference: input.reference,
    p_event_id: input.eventId,
    p_organiser_id: input.organiserId,
    p_affiliate_id: input.affiliateId,
    p_metadata: input.metadata,
  })
  if (!rpc.error) {
    const payload = rpc.data && typeof rpc.data === 'object' ? (rpc.data as Record<string, unknown>) : {}
    if (payload.ok === false) {
      console.error('bu_credit_sale_share rejected', payload.reason, input)
      return { ok: false as const, reason: String(payload.reason ?? 'rpc') }
    }
    if (payload.wallet_applied === false) {
      console.error('bu_credit_sale_share ledger saved but wallet not applied', payload.wallet_error, input)
    }
    return { ok: true as const, via: 'rpc' }
  }
  console.error('bu_credit_sale_share', rpc.error.message, input)
  if (!/could not find|schema cache/i.test(rpc.error.message)) {
    return { ok: false as const, reason: rpc.error.message || ACCOUNT_ROLES_SQL_HINT }
  }

  const admin = tryCreateAdminClient()
  if (admin) {
    const wallet = await admin.rpc('credit_wallet', {
      p_user_id: input.userId,
      p_amount: input.naira,
      p_type: 'deposit',
      p_description: input.kind === 'affiliate_commission' ? 'Affiliate commission' : 'Ticket sale',
      p_event_id: input.eventId,
      p_reference: input.reference,
      p_metadata: input.metadata,
    })
    if (!wallet.error) return { ok: true as const, via: 'credit_wallet' }
  }

  return { ok: false as const, reason: rpc.error.message || ACCOUNT_ROLES_SQL_HINT }
}

export async function creditTicketSaleShares(input: SaleShareInput): Promise<SaleShareResult> {
  const ticketNaira = roundMoney(Math.max(0, input.ticketNaira))
  const organiserId = input.organiserUserId
  let affiliateId: string | null = null
  let affiliateNaira = 0

  if (input.affiliateEnabled && input.affiliateCode && organiserId) {
    const affiliate = await lookupAffiliateByCode(input.affiliateCode)
    if (affiliate?.user_id && affiliate.user_id !== organiserId) {
      const pct = Math.min(80, Math.max(0, input.affiliateCommissionPct))
      affiliateId = affiliate.user_id
      affiliateNaira = roundMoney((ticketNaira * pct) / 100)
    }
  }

  const organiserNaira = roundMoney(ticketNaira - affiliateNaira)
  const meta = {
    event_id: input.eventId,
    ticket_naira: ticketNaira,
    affiliate_code: input.affiliateCode ?? null,
  }

  if (organiserId && organiserNaira > 0) {
    const credited = await creditShare({
      userId: organiserId,
      naira: organiserNaira,
      kind: 'organiser_sale',
      reference: input.reference,
      eventId: input.eventId,
      organiserId,
      affiliateId,
      metadata: meta,
    })
    if (!credited.ok) console.error('organiser ticket credit failed', credited.reason, input.reference)
  } else if (!organiserId) {
    console.error('ticket sale has no organiser id', input.reference, input.eventId)
  }

  if (affiliateId && affiliateNaira > 0) {
    const credited = await creditShare({
      userId: affiliateId,
      naira: affiliateNaira,
      kind: 'affiliate_commission',
      reference: input.reference,
      eventId: input.eventId,
      organiserId,
      affiliateId,
      metadata: meta,
    })
    if (!credited.ok) console.error('affiliate commission credit failed', credited.reason, input.reference)
  }

  return {
    organiserUserId: organiserId,
    organiserNaira,
    affiliateUserId: affiliateId,
    affiliateNaira,
  }
}

export function creditsByDay(rows: Array<Record<string, unknown>>, days = 14) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const buckets = Array.from({ length: days }, (_, i) => {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    const key = day.toISOString().slice(0, 10)
    return { key, label: day.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }), organiser: 0, affiliate: 0 }
  })
  const map = new Map(buckets.map((item) => [item.key, item]))
  for (const row of rows) {
    const created = typeof row.created_at === 'string' ? row.created_at.slice(0, 10) : ''
    const bucket = map.get(created)
    if (!bucket) continue
    const naira = asNumber(row.naira)
    if (row.kind === 'affiliate_commission') bucket.affiliate += naira
    else bucket.organiser += naira
  }
  return buckets
}

export function ticketsByDay(rows: Array<{ created_at?: unknown; amount_paid?: unknown }>, days = 14) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const buckets = Array.from({ length: days }, (_, i) => {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    const key = day.toISOString().slice(0, 10)
    return { key, label: day.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }), count: 0, naira: 0 }
  })
  const map = new Map(buckets.map((item) => [item.key, item]))
  for (const row of rows) {
    const created = typeof row.created_at === 'string' ? row.created_at.slice(0, 10) : ''
    const bucket = map.get(created)
    if (!bucket) continue
    bucket.count += 1
    bucket.naira += asNumber(row.amount_paid)
  }
  return buckets
}
