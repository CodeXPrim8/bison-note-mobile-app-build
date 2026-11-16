import type { SupabaseClient } from '@supabase/supabase-js'
import { isPaystackConfigured } from '@/lib/env'
import { createTransferRecipient, initiateTransfer, listPaystackNgnBanks, nairaToKobo, resolveNuban } from '@/lib/payments/paystack'
import { bankCodeFromName, displayBankName, NGN_BANKS, payoutBankCodes } from '@/lib/payments/ngn-banks'
import { moveLiveWallet } from '@/lib/wallet/move'

export function paystackPayoutMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Bank transfer failed')
  if (/third party payouts|starter business|transfers are not available/i.test(message)) {
    return 'Automatic bank payouts are not enabled yet. Try again later or contact support.'
  }
  if (/insufficient|not enough balance|balance is low|not enough to fulfil|not enough to fulfill/i.test(message)) {
    return 'Settlement balance is too low to send this payout right now. Try again later.'
  }
  if (/otp/i.test(message)) {
    return 'This payout needs an extra confirmation step. Try again shortly, or contact support.'
  }
  if (/bank is invalid/i.test(message)) {
    return 'This bank is not valid for payouts. Choose OPay, Kuda, PalmPay, or a listed Nigerian bank and use the 10-digit account number, not a phone number.'
  }
  if (/invalid.*account|could not resolve account|could not confirm/i.test(message)) {
    return 'Bank account could not be verified. Check the 10-digit NUBAN and bank, then retry.'
  }
  return message.slice(0, 500)
}

export function publicWithdrawalStatus(status: string) {
  if (status === 'paid') return 'completed'
  if (status === 'approved') return 'processing'
  if (status === 'pending') return 'pending'
  return 'failed'
}

export function publicWithdrawalLabel(status: string) {
  if (status === 'paid') return 'Paid to bank'
  if (status === 'approved') return 'Sending to bank'
  if (status === 'pending') return 'Waiting for approval'
  if (status === 'rejected' || status === 'reversed') return 'Returned to wallet'
  if (status === 'payout_failed') return 'Payout failed'
  if (status === 'failed') return 'Failed'
  return status
}

function transferReference(id: string) {
  const compact = id.replace(/-/g, '')
  return `buwd${compact.slice(0, 18)}${Date.now().toString(36)}`.slice(0, 50)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

async function updateWithdrawal(db: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const rpc = await db.rpc('bu_update_withdrawal', { p_id: id, p_patch: patch })
  if (!rpc.error) return
  if (!/schema cache|does not exist|Could not find the function/i.test(rpc.error.message)) {
    throw new Error(rpc.error.message)
  }
  let updated = await db.from('bu_withdrawals').update(patch).eq('id', id)
  if (updated.error && /column|schema cache/i.test(updated.error.message)) {
    if (patch.status == null) return
    updated = await db
      .from('bu_withdrawals')
      .update({
        status: patch.status,
        note: typeof patch.transfer_error === 'string' ? patch.transfer_error : patch.note,
        reviewed_at: patch.reviewed_at ?? new Date().toISOString(),
      })
      .eq('id', id)
  }
  if (updated.error) throw new Error(updated.error.message)
}

export async function insertWithdrawalRow(db: SupabaseClient, payload: Record<string, unknown>) {
  const rpc = await db.rpc('bu_insert_withdrawal', { p_row: payload })
  if (!rpc.error) {
    return asRecord(rpc.data) ?? payload
  }
  const rpcMissing = /schema cache|does not exist|Could not find the function/i.test(rpc.error.message)
  if (!rpcMissing) {
    if (/row-level security/i.test(rpc.error.message)) {
      throw new Error(
        'Bank send needs a Supabase update. Run supabase/run_once_withdrawals_rpc.sql in the SQL editor.',
      )
    }
    throw new Error(rpc.error.message)
  }
  let inserted = await db.from('bu_withdrawals').insert(payload).select('*').maybeSingle()
  if (inserted.error && /column|schema cache/i.test(inserted.error.message)) {
    inserted = await db
      .from('bu_withdrawals')
      .insert({
        id: payload.id,
        user_id: payload.user_id,
        bu: payload.bu,
        naira: payload.naira,
        bank_name: payload.bank_name,
        account_number: payload.account_number,
        account_name: payload.account_name,
        status: payload.status,
        mode: payload.mode,
        reviewed_at: payload.reviewed_at ?? null,
      })
      .select('*')
      .maybeSingle()
  }
  if (inserted.error) {
    if (/row-level security/i.test(inserted.error.message)) {
      throw new Error(
        'Bank send needs a Supabase update. Run supabase/run_once_withdrawals_rpc.sql in the SQL editor.',
      )
    }
    throw new Error(inserted.error.message)
  }
  return (inserted.data as Record<string, unknown> | null) ?? payload
}

export async function listWithdrawalRows(db: SupabaseClient, userId: string, limit = 50) {
  const rpc = await db.rpc('bu_list_withdrawals', { p_user_id: userId, p_limit: limit })
  if (!rpc.error) {
    const raw = rpc.data
    if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown
        return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : []
      } catch {
        return []
      }
    }
    return []
  }
  const result = await db
    .from('bu_withdrawals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (result.error) return []
  return (result.data ?? []) as Array<Record<string, unknown>>
}

export async function createPayoutRecipient(row: Record<string, unknown>) {
  const accountNumber = String(row.account_number || '').replace(/\s+/g, '')
  const accountName = String(row.account_name || '').trim()
  if (!/^\d{10}$/.test(accountNumber)) {
    throw new Error('Account number must be a 10-digit NUBAN.')
  }
  const codes = payoutBankCodes(String(row.bank_code || ''), String(row.bank_name || ''))
  if (!codes.length) {
    throw new Error('Unknown bank. Choose a listed Nigerian bank.')
  }
  let lastError: unknown
  for (const bankCode of codes) {
    try {
      let name = accountName
      try {
        const resolved = await resolveNuban(accountNumber, bankCode)
        if (resolved.account_name) name = resolved.account_name
      } catch {
        /* some wallets still accept a recipient even if resolve fails */
      }
      const recipient = await createTransferRecipient({
        name,
        accountNumber,
        bankCode,
      })
      return { recipient, bankCode, accountName: name }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Bank is invalid')
}

export async function sendWithdrawalPayout(row: Record<string, unknown>, db: SupabaseClient) {
  if (!isPaystackConfigured()) {
    throw new Error('Bank payouts are not available right now.')
  }
  const id = String(row.id)
  const reuse =
    String(row.paystack_recipient || '').trim() &&
    !/bank is invalid/i.test(String(row.transfer_error || ''))
  const ready = reuse
    ? {
        recipient: { recipient_code: String(row.paystack_recipient) },
        bankCode: String(row.bank_code || bankCodeFromName(String(row.bank_name || ''))),
        accountName: String(row.account_name || ''),
      }
    : await createPayoutRecipient(row)
  await updateWithdrawal(db, id, {
    bank_code: ready.bankCode,
    bank_name: displayBankName(String(row.bank_name || ''), ready.bankCode),
    account_name: ready.accountName || row.account_name,
    paystack_recipient: ready.recipient.recipient_code,
  })
  const transfer = await initiateTransfer({
    amountKobo: nairaToKobo(Number(row.naira)),
    recipient: ready.recipient.recipient_code,
    reference: transferReference(id),
    reason: 'ɃU wallet withdrawal',
  })
  const success = /success/i.test(transfer.status || '')
  const inFlight = /otp|pending|received|queued/i.test(transfer.status || '')
  const status = success ? 'paid' : inFlight || transfer.status ? 'approved' : 'approved'
  await updateWithdrawal(db, id, {
    status,
    bank_code: ready.bankCode,
    bank_name: displayBankName(String(row.bank_name || ''), ready.bankCode),
    account_name: ready.accountName || row.account_name,
    paystack_recipient: ready.recipient.recipient_code,
    paystack_transfer_code: transfer.transfer_code,
    paystack_reference: transfer.reference,
    transfer_error: null,
    reviewed_at: new Date().toISOString(),
    paid_at: success ? new Date().toISOString() : null,
  })
  return { status, reference: transfer.reference, transferStatus: transfer.status }
}

export async function guestBanks() {
  const rank = (name: string) => (/opay|kuda|palm|monie/i.test(name) ? 0 : 1)
  const sortBanks = (banks: Array<{ name: string; code: string }>) =>
    [...banks].sort((a, b) => {
      const diff = rank(a.name) - rank(b.name)
      return diff !== 0 ? diff : a.name.localeCompare(b.name)
    })
  if (!isPaystackConfigured()) {
    return sortBanks(NGN_BANKS.map((bank) => ({ name: bank.name, code: bank.code })))
  }
  try {
    const live = await listPaystackNgnBanks()
    const preferred = new Map<string, { name: string; code: string }>()
    for (const bank of NGN_BANKS) preferred.set(bank.code, { name: bank.name, code: bank.code })
    for (const bank of live) {
      const name = displayBankName(bank.name, bank.code)
      if (preferred.has(bank.code) || /opay|paycom|kuda|palm|monie/i.test(`${bank.name} ${bank.slug ?? ''}`)) {
        preferred.set(bank.code, { name, code: bank.code })
      }
    }
    return sortBanks([...preferred.values()])
  } catch {
    return sortBanks(NGN_BANKS.map((bank) => ({ name: bank.name, code: bank.code })))
  }
}

export async function markWithdrawalFailed(id: string, message: string, db: SupabaseClient, status = 'payout_failed') {
  await updateWithdrawal(db, id, {
    status,
    transfer_error: message.slice(0, 500),
    reviewed_at: new Date().toISOString(),
  })
}

export async function applyPaystackTransferEvent(
  event: { event?: string; data?: { reference?: string; transfer_code?: string; status?: string } },
  db: SupabaseClient,
) {
  const reference = String(event.data?.reference || '').trim()
  const transferCode = String(event.data?.transfer_code || '').trim()
  if (!reference && !transferCode) return { ok: false as const, reason: 'no reference' }

  let found = reference
    ? await db.from('bu_withdrawals').select('*').eq('paystack_reference', reference).maybeSingle()
    : { data: null, error: null as { message?: string } | null }
  if (found.error && /column|schema cache/i.test(String(found.error.message ?? ''))) {
    return { ok: false as const, reason: 'sql 0023' }
  }
  if (!found.data && transferCode) {
    found = await db.from('bu_withdrawals').select('*').eq('paystack_transfer_code', transferCode).maybeSingle()
  }
  if (found.error && /column|schema cache/i.test(String(found.error.message ?? ''))) {
    return { ok: false as const, reason: 'sql 0023' }
  }
  if (!found.data) return { ok: false as const, reason: 'not found' }

  const row = found.data as Record<string, unknown>
  const name = String(event.event || '')
  const transferStatus = String(event.data?.status || '')
  if (name === 'transfer.success' || transferStatus === 'success') {
    await updateWithdrawal(db, String(row.id), {
      status: 'paid',
      transfer_error: null,
      paid_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      paystack_reference: reference || row.paystack_reference,
      paystack_transfer_code: transferCode || row.paystack_transfer_code,
    })
    return { ok: true as const, id: String(row.id), status: 'paid' }
  }
  if (name === 'transfer.reversed' || transferStatus === 'reversed') {
    if (String(row.status) === 'rejected' || String(row.status) === 'failed' || String(row.status) === 'reversed') {
      return { ok: true as const, id: String(row.id), status: String(row.status) }
    }
    try {
      await moveLiveWallet(db, {
        userId: String(row.user_id),
        naira: Number(row.naira),
        direction: 'credit',
        type: 'refund',
        description: 'Withdrawal reversed',
        metadata: { withdrawal_id: row.id, reason: name || transferStatus },
      })
      await updateWithdrawal(db, String(row.id), {
        status: 'reversed',
        transfer_error: null,
        note: 'The bank transfer was reversed. ɃU returned to the wallet.',
        reviewed_at: new Date().toISOString(),
      })
      return { ok: true as const, id: String(row.id), status: 'reversed' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'wallet credit failed'
      await markWithdrawalFailed(String(row.id), `Bank transfer reversed. ${message}`, db)
      return { ok: true as const, id: String(row.id), status: 'payout_failed' }
    }
  }
  if (name === 'transfer.failed' || transferStatus === 'failed') {
    if (String(row.status) === 'rejected' || String(row.status) === 'failed' || String(row.status) === 'reversed') {
      return { ok: true as const, id: String(row.id), status: String(row.status) }
    }
    await markWithdrawalFailed(String(row.id), `Transfer ${name || transferStatus}`, db)
    return { ok: true as const, id: String(row.id), status: 'payout_failed' }
  }
  return { ok: true as const, id: String(row.id), status: String(row.status) }
}
