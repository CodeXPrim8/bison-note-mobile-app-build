export type WalletDirection = 'credit' | 'debit'
export type HistoryBucket = 'topup' | 'purchase' | 'withdrawal' | 'bu_transfer'

function asMeta(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

const CREDIT_TYPES = new Set([
  'deposit',
  'topup',
  'refund',
  'spray_credit',
  'organiser_sale',
  'affiliate_commission',
])

const DEBIT_TYPES = new Set(['withdrawal', 'purchase', 'ticket_purchase', 'spray', 'bu_transfer'])

/** Incoming ɃU is a credit. Leaving ɃU is a debit. Amounts in the ledger are unsigned. */
export function walletDirection(input: {
  type?: string | null
  description?: string | null
  metadata?: unknown
  direction?: string | null
  amount?: number | null
}): WalletDirection {
  if (input.direction === 'credit' || input.direction === 'debit') return input.direction
  const meta = asMeta(input.metadata)
  if (meta.direction === 'credit' || meta.direction === 'debit') return meta.direction
  const amount = Number(input.amount)
  if (Number.isFinite(amount) && amount < 0) return 'debit'
  const type = String(input.type ?? '').toLowerCase()
  const desc = String(input.description ?? '').toLowerCase()
  if (/received|ticket sale|affiliate commission|wallet top-up|wallet top up/.test(desc)) return 'credit'
  if (/^sent Ƀu$|^sent bu$/.test(desc)) return 'debit'
  if (meta.from && !meta.to) return 'credit'
  if (meta.to && !meta.from) return 'debit'
  if (/withdraw|purchase|bought ticket/.test(desc)) return 'debit'
  if (type === 'bu_transfer' && /received/.test(desc)) return 'credit'
  if (CREDIT_TYPES.has(type)) return 'credit'
  if (DEBIT_TYPES.has(type)) return 'debit'
  if (/tip|bu transfer|spray/.test(desc)) return /received/.test(desc) ? 'credit' : 'debit'
  return 'credit'
}

export function historyBucket(input: { type?: string | null; description?: string | null }): HistoryBucket {
  const type = String(input.type ?? '').toLowerCase()
  const desc = String(input.description ?? '').toLowerCase()
  if (type === 'purchase' || type === 'ticket_purchase' || /ticket purchase|bought ticket/.test(desc)) {
    return 'purchase'
  }
  if (/event spray credit/.test(desc)) return 'topup'
  if (
    type === 'spray' ||
    type === 'spray_credit' ||
    type === 'bu_transfer' ||
    /bu transfer|bu received|sent Ƀu|sent bu|received Ƀu|received bu|tip/.test(desc)
  ) {
    return 'bu_transfer'
  }
  if (type === 'withdrawal' || /withdraw/.test(desc)) return 'withdrawal'
  return 'topup'
}

export function historyLabel(input: {
  type?: string | null
  description?: string | null
  direction?: WalletDirection | null
}): string {
  const desc = String(input.description ?? '').trim()
  const lower = desc.toLowerCase()
  const credit = input.direction === 'credit'
  if (/^bu transfer$/i.test(desc) || /^sent Ƀu$|^sent bu$/i.test(desc)) return credit ? 'Received ɃU' : 'Sent ɃU'
  if (/^bu received$|^received Ƀu$|^received bu$/i.test(desc)) return 'Received ɃU'
  if (/^tip$/i.test(desc)) return credit ? 'Tip received' : 'Tip sent'
  if (!desc) {
    const type = String(input.type ?? '').toLowerCase()
    if (type === 'deposit') return 'Wallet top-up'
    if (type === 'withdrawal') return 'Withdrawal'
    if (type === 'spray') return credit ? 'Received ɃU' : 'Sent ɃU'
    if (type === 'spray_credit') return 'Received ɃU'
    return 'ɃU movement'
  }
  if (lower === 'bu movement') return credit ? 'Received ɃU' : 'Sent ɃU'
  return desc
}

export function amountTone(direction: WalletDirection) {
  return direction === 'credit' ? 'text-green-500' : 'text-red-500'
}

export function amountIconTone(direction: WalletDirection) {
  return direction === 'credit' ? 'bg-green-500/20' : 'bg-red-500/20'
}
