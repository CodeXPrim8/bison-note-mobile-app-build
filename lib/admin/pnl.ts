import { BU_WITHDRAW_PLATFORM_FEE } from '@/lib/bu-rate'

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function positive(...vals: unknown[]): number {
  for (const value of vals) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

function dayKey(iso: string) {
  return String(iso || '').slice(0, 10)
}

export type PnLPoint = {
  key: string
  day: string
  earned: number
  costs: number
}

/** Platform take and Paystack costs from one wallet / ledger row. */
export function pnlFromWalletRow(row: Record<string, unknown>): PnLPoint | null {
  const meta = asMeta(row.metadata)
  const type = String(row.type ?? meta.requested_type ?? '').toLowerCase()
  const direction = String(row.direction ?? meta.direction ?? '').toLowerCase()
  const kind = String(meta.kind ?? '').toLowerCase()
  const day = dayKey(String(row.created_at ?? ''))
  if (!day) return null

  const paymentId = String(meta.payment_id ?? '')
  const ref = String(row.reference ?? meta.move_id ?? meta.reference ?? row.id ?? '')
  let earned = 0
  let costs = 0

  const isDeposit = type === 'deposit' || kind === 'deposit' || kind === 'dedicated_nuban'
  const isBankSend =
    kind === 'bank_send' ||
    meta.bank_naira != null ||
    meta.platform_fee != null ||
    meta.paystack_transfer_fee != null

  if (isDeposit) {
    const charge = Number(meta.charge_naira ?? 0)
    const credit = Number(meta.credit_naira ?? meta.net_naira ?? 0)
    if (charge > 0 && credit > 0 && charge > credit) {
      earned += charge - credit
    } else {
      earned += positive(meta.fee_naira)
    }
  } else if (isBankSend && direction !== 'credit') {
    const platformFee = Number(meta.platform_fee)
    earned +=
      Number.isFinite(platformFee) && platformFee > 0
        ? platformFee
        : kind === 'bank_send' || meta.bank_naira != null
          ? BU_WITHDRAW_PLATFORM_FEE
          : 0
    costs += positive(meta.paystack_transfer_fee)
  } else if (direction === 'debit') {
    earned += positive(meta.fee_naira)
  }

  if (earned <= 0 && costs <= 0) return null

  const key =
    paymentId
      ? `payment:${paymentId}`
      : ref
        ? `move:${ref}:${direction || 'debit'}`
        : `row:${String(row.id ?? '')}:${type}:${earned}:${costs}`

  return { key, day, earned, costs }
}

/** Ticket service fee + card buy spread from a successful payment. */
export function pnlFromPayment(row: Record<string, unknown>): PnLPoint | null {
  const meta = asMeta(row.metadata)
  const day = dayKey(String(row.created_at ?? row.fulfilled_at ?? ''))
  if (!day) return null

  const status = String(row.status ?? '').toLowerCase()
  if (status && !['success', 'settled', 'paid'].includes(status)) return null

  const kind = String(row.kind ?? meta.kind ?? '').toLowerCase()
  const id = String(row.id ?? row.reference ?? '')
  let earned = 0

  // Admin funding Paystack settlement is not platform revenue.
  if (kind === 'settlement_topup' || meta.kind === 'settlement_topup') return null

  const serviceFee = positive(meta.service_fee, row.service_fee)
  if (serviceFee > 0) earned += serviceFee

  if (kind === 'deposit' || meta.bu != null || meta.credit_naira != null) {
    const charge = Number(meta.charge_naira ?? row.amount ?? 0)
    const credit = Number(meta.credit_naira ?? 0)
    if (charge > 0 && credit > 0 && charge > credit) {
      earned += charge - credit
    }
  }

  if (earned <= 0) return null
  return {
    key: id ? `payment:${id}` : `pay:${day}:${earned}`,
    day,
    earned,
    costs: 0,
  }
}

export function foldPnL(
  points: PnLPoint[],
  days: string[],
): {
  earned: number
  costs: number
  net: number
  series: { earned: number[]; costs: number[]; net: number[] }
} {
  const seen = new Set<string>()
  const earnedByDay = new Map(days.map((d) => [d, 0]))
  const costsByDay = new Map(days.map((d) => [d, 0]))
  let earned = 0
  let costs = 0

  for (const point of points) {
    if (seen.has(point.key)) continue
    seen.add(point.key)
    earned += point.earned
    costs += point.costs
    if (earnedByDay.has(point.day)) {
      earnedByDay.set(point.day, (earnedByDay.get(point.day) ?? 0) + point.earned)
      costsByDay.set(point.day, (costsByDay.get(point.day) ?? 0) + point.costs)
    }
  }

  const earnedSeries = days.map((d) => earnedByDay.get(d) ?? 0)
  const costsSeries = days.map((d) => costsByDay.get(d) ?? 0)

  return {
    earned,
    costs,
    net: earned - costs,
    series: {
      earned: earnedSeries,
      costs: costsSeries,
      net: earnedSeries.map((value, i) => value - (costsSeries[i] ?? 0)),
    },
  }
}
