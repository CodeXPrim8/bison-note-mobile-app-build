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
  'wallet_credit',
  'vendor_commission',
])

const DEBIT_TYPES = new Set([
  'withdrawal',
  'purchase',
  'ticket_purchase',
  'spray',
  'bu_transfer',
  'wallet_debit',
])

/** Incoming ɃU is a credit. Leaving ɃU is a debit. Ledger amounts are usually unsigned. */
export function walletDirection(input: {
  type?: string | null
  description?: string | null
  metadata?: unknown
  direction?: string | null
  amount?: number | null
}): WalletDirection {
  const type = String(input.type ?? '').toLowerCase()
  const desc = String(input.description ?? '').toLowerCase()
  const meta = asMeta(input.metadata)

  // Description is the source of truth when it clearly says in/out
  if (
    /bank transfer top-up|wallet top-?up|received Ƀu|received bu|bu received|tip received|event spray (from|received)|ticket sale|affiliate commission|pos sale|vendor commission|business pos/.test(
      desc,
    )
  ) {
    return 'credit'
  }
  if (
    /withdraw|send to bank|sent Ƀu|sent bu|^sent |purchase|bought ticket|tip to |tip sent|event spray to|^airtime |^data |pos payment|pos ·/.test(
      desc,
    )
  ) {
    return 'debit'
  }

  const explicit = String(input.direction ?? '').toLowerCase()
  if (explicit === 'credit' || explicit === 'debit') return explicit

  const metaDir = String(meta.direction ?? '').toLowerCase()
  if (metaDir === 'credit' || metaDir === 'debit') return metaDir

  const amount = Number(input.amount)
  if (Number.isFinite(amount) && amount < -0.0001) return 'debit'

  if (CREDIT_TYPES.has(type)) return 'credit'
  if (meta.from && !meta.to) return 'credit'

  if (DEBIT_TYPES.has(type) && type !== 'bu_transfer') return 'debit'
  if (meta.to && !meta.from) return 'debit'

  // Peer transfers without a clear label: treat as outgoing
  if (type === 'bu_transfer') {
    if (/received/.test(desc)) return 'credit'
    return 'debit'
  }

  if (/^tip$|tip/.test(desc)) return /received/.test(desc) ? 'credit' : 'debit'
  if (/spray/.test(desc) || type === 'spray') return /credit|received/.test(desc) ? 'credit' : 'debit'

  return 'credit'
}

export function historyBucket(input: {
  type?: string | null
  description?: string | null
  metadata?: unknown
}): HistoryBucket {
  const type = String(input.type ?? '').toLowerCase()
  const desc = String(input.description ?? '').toLowerCase()
  const meta = asMeta(input.metadata)
  const metaKind = String(meta.kind ?? meta.requested_type ?? '').toLowerCase()

  if (
    type === 'purchase' ||
    type === 'ticket_purchase' ||
    /ticket purchase|bought ticket|^airtime |^data /.test(desc)
  ) {
    return 'purchase'
  }

  // Bank sends first — "Sent to GTBank" must not be treated as a peer ɃU transfer
  if (
    type === 'withdrawal' ||
    metaKind === 'bank_send' ||
    metaKind === 'withdrawal' ||
    /withdraw|send to bank|^sent to\s+|^withdrawal to\s+/.test(desc)
  ) {
    // Peer transfer / tip / spray descriptions that were stored with type=withdrawal still count as transfers
    if (
      /bu transfer|bu received|sent Ƀu|sent bu|received Ƀu|received bu|^tip\b|event spray|spray/.test(desc) ||
      metaKind === 'tip' ||
      metaKind === 'spray' ||
      metaKind === 'transfer'
    ) {
      return 'bu_transfer'
    }
    return 'withdrawal'
  }

  if (
    type === 'spray' ||
    type === 'spray_credit' ||
    type === 'bu_transfer' ||
    type === 'wallet_debit' ||
    type === 'wallet_credit' ||
    type === 'pos_sale' ||
    type === 'vendor_commission' ||
    metaKind === 'transfer' ||
    metaKind === 'tip' ||
    metaKind === 'spray' ||
    metaKind === 'pos_sale' ||
    metaKind === 'business_pos_terminal' ||
    /bu transfer|bu received|sent Ƀu|sent bu|received Ƀu|received bu|^tip\b|tip to |tip received|tip sent|event spray|\bspray\b|pos sale|pos payment|vendor commission|business pos|pos ·/.test(
      desc,
    )
  ) {
    return 'bu_transfer'
  }

  return 'topup'
}

export function historyLabel(input: {
  type?: string | null
  description?: string | null
  direction?: WalletDirection | null
}): string {
  const desc = String(input.description ?? '').trim()
  const lower = desc.toLowerCase()
  const type = String(input.type ?? '').toLowerCase()
  const credit = input.direction === 'credit'

  if (/^auto reverse/i.test(desc)) return desc.replace(/^auto reverse\s*·\s*/i, 'Refund · ') || 'Refund'
  if (/^airtime /i.test(desc)) return desc
  if (/^data /i.test(desc)) return desc
  if (/bank transfer top-up|wallet top-?up/i.test(desc) || (type === 'deposit' && !/sent|received|transfer|tip/i.test(desc))) {
    return 'Bank transfer top-up'
  }
  if (/^withdrawal to /i.test(desc)) {
    const bank = desc.replace(/^withdrawal to\s+/i, '').trim()
    return bank ? `Sent to ${bank}` : 'Send to bank'
  }
  if (/^sent to /i.test(desc)) return desc
  if (type === 'withdrawal' || /send to bank/i.test(desc)) {
    return desc && !/^send to bank$/i.test(desc) && !/^withdrawal$/i.test(desc) ? desc : 'Send to bank'
  }

  if (/^bu transfer/i.test(desc) || /^sent Ƀu|^sent bu/i.test(desc)) {
    const who = desc
      .replace(/^bu transfer(?: to)?\s*/i, '')
      .replace(/^sent Ƀu(?: to)?\s*/i, '')
      .replace(/^sent bu(?: to)?\s*/i, '')
      .trim()
    if (credit) return who ? `Received ɃU from ${who}` : 'Received ɃU'
    return who && !/^bu transfer$/i.test(who) ? `Sent ɃU to ${who}` : 'Sent ɃU'
  }
  if (/^bu received|^received Ƀu|^received bu/i.test(desc)) {
    const who = desc
      .replace(/^bu received(?: from)?\s*/i, '')
      .replace(/^received Ƀu(?: from)?\s*/i, '')
      .replace(/^received bu(?: from)?\s*/i, '')
      .trim()
    return who ? `Received ɃU from ${who}` : 'Received ɃU'
  }
  if (/^tip received/i.test(desc)) return 'Tip received'
  if (/^tip to /i.test(desc) || /^tip$/i.test(desc)) {
    return credit ? 'Tip received' : desc.replace(/^tip to /i, 'Tip sent to ') || 'Tip sent'
  }
  if (/^event spray/i.test(desc)) {
    if (credit) {
      return /^event spray received$/i.test(desc) ? 'Event spray received' : desc
    }
    return desc.replace(/^event spray to /i, 'Event spray to ') || 'Event spray'
  }
  if (type === 'vendor_commission' || /^vendor commission/i.test(desc)) {
    return desc || 'Vendor commission'
  }
  if (type === 'pos_sale' || /^pos\b/i.test(desc) || /^business pos/i.test(desc)) {
    if (credit) return desc || 'POS sale'
    return desc || 'POS payment'
  }
  if (!desc) {
    if (type === 'deposit') return 'Bank transfer top-up'
    if (type === 'withdrawal') return 'Send to bank'
    if (type === 'spray') return credit ? 'Received ɃU' : 'Sent ɃU'
    if (type === 'spray_credit') return 'Received ɃU'
    if (type === 'pos_sale') return credit ? 'POS sale' : 'POS payment'
    if (type === 'vendor_commission') return 'Vendor commission'
    return credit ? 'Received ɃU' : 'Sent ɃU'
  }
  if (lower === 'bu movement') return credit ? 'Received ɃU' : 'Sent ɃU'
  return desc
}

export function amountTone(direction: WalletDirection) {
  return direction === 'credit' ? 'bu-credit' : 'bu-debit'
}

export function amountIconTone(direction: WalletDirection) {
  return direction === 'credit' ? 'bg-green-500/15 text-green-600' : 'bg-red-500/15 text-red-600'
}
