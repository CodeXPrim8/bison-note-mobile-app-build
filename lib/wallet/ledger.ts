import type { SupabaseClient } from '@supabase/supabase-js'

const LEDGER_TYPES = new Set([
  'deposit',
  'spray',
  'purchase',
  'ticket_purchase',
  'withdrawal',
  'spray_credit',
  'refund',
])

function ledgerType(type: string, direction: 'debit' | 'credit') {
  if (LEDGER_TYPES.has(type)) return type
  return direction === 'debit' ? 'withdrawal' : 'refund'
}

function uuidOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
}

function missingTable(message?: string) {
  return /schema cache|does not exist|could not find the table/i.test(message ?? '')
}

export type WalletLedgerInput = {
  userId: string
  naira: number
  direction: 'debit' | 'credit'
  type: string
  description: string
  metadata?: Record<string, unknown>
  reference?: string
}

/** Persist a wallet movement even when bu_transactions cannot accept live users.id. */
export async function recordWalletLedger(db: SupabaseClient, input: WalletLedgerInput) {
  const reference = input.reference || crypto.randomUUID()
  const metadata = {
    ...(input.metadata ?? {}),
    direction: input.direction,
    requested_type: input.type,
    move_id: reference,
    description: input.description,
  }
  const eventId = uuidOrNull(metadata.event_id)
  const txType = ledgerType(input.type, input.direction)
  const kind = input.direction === 'debit' ? 'wallet_debit' : 'wallet_credit'

  const dedicated = await db.from('bu_wallet_ledger').upsert(
    {
      user_id: input.userId,
      direction: input.direction,
      type: txType,
      naira: input.naira,
      description: input.description,
      reference,
      metadata,
    },
    { onConflict: 'user_id,reference', ignoreDuplicates: true },
  )
  if (dedicated.error && !missingTable(dedicated.error.message) && !/unique|duplicate/i.test(dedicated.error.message)) {
    const plain = await db.from('bu_wallet_ledger').insert({
      user_id: input.userId,
      direction: input.direction,
      type: txType,
      naira: input.naira,
      description: input.description,
      reference,
      metadata,
    })
    if (plain.error && !missingTable(plain.error.message) && !/unique|duplicate/i.test(plain.error.message)) {
      console.error('bu_wallet_ledger', plain.error.message)
    }
  }

  const txRow = {
    user_id: input.userId,
    type: txType,
    amount: input.naira,
    description: input.description,
    metadata,
  }
  const firstTx = await db.from('bu_transactions').insert(txRow)
  if (firstTx.error && !missingTable(firstTx.error.message) && !/unique|duplicate/i.test(firstTx.error.message)) {
    const fallbackType = input.direction === 'debit' ? 'withdrawal' : 'refund'
    if (txType !== fallbackType) {
      const retry = await db.from('bu_transactions').insert({ ...txRow, type: fallbackType })
      if (retry.error && !missingTable(retry.error.message)) {
        console.error('bu_transactions', retry.error.message)
      }
    }
  }

  const salePayload = {
    reference,
    user_id: input.userId,
    kind,
    naira: input.naira,
    metadata,
    applied: true as const,
  }
  const sale = await db.from('bu_sale_credits').upsert(
    { ...salePayload, event_id: eventId },
    { onConflict: 'reference,user_id,kind', ignoreDuplicates: true },
  )
  if (sale.error && !missingTable(sale.error.message) && !/unique|duplicate/i.test(sale.error.message)) {
    const retry = await db.from('bu_sale_credits').insert({
      ...salePayload,
      event_id: eventId,
    })
    if (retry.error && /event_id|foreign key/i.test(retry.error.message)) {
      await db.from('bu_sale_credits').insert(salePayload)
    } else if (retry.error && !missingTable(retry.error.message) && !/unique|duplicate/i.test(retry.error.message)) {
      console.error('bu_sale_credits ledger', retry.error.message)
    }
  }
