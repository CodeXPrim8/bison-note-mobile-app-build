import type { SupabaseClient } from '@supabase/supabase-js'
import { isPaystackConfigured } from '@/lib/env'
import { createTransferRecipient, initiateTransfer, listPaystackNgnBanks, nairaToKobo, resolveNuban } from '@/lib/payments/paystack'
import { bankCodeFromName, displayBankName, NGN_BANKS, payoutBankCodes } from '@/lib/payments/ngn-banks'
import { moveLiveWallet } from '@/lib/wallet/move'

export function paystackPayoutMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Paystack transfer failed')
  if (/third party payouts|starter business|transfers are not available/i.test(message)) {
    return 'Paystack Transfers are not enabled on this business. Enable Transfers in Paystack, fund the balance, then retry.'
  }
  if (/insufficient|not enough balance|balance is low/i.test(message)) {
    return 'The Paystack balance is too low to pay this withdrawal. Fund Paystack, then retry.'
  }
  if (/otp/i.test(message)) {
    return 'Paystack is waiting for a transfer OTP. Complete it in the Paystack dashboard, or turn off Transfer OTP.'
  }
  if (/bank is invalid/i.test(message)) {
    return 'This bank is not valid for Paystack Transfers. Choose OPay, Kuda, PalmPay, or a listed Nigerian bank and use the 10-digit account number, not a phone number.'
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

async function updateWithdrawal(db: SupabaseClient, id: string, patch: Record<string, unknown>) {
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
  if (inserted.error) throw new Error(inserted.error.message)
  return (inserted.data as Record<string, unknown> | null) ?? payload
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
    throw new Error('Paystack is not configured. Add the live secret key, then enable Transfers in Paystack.')
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
        description: 'Withdrawal reversed by Paystack',
        metadata: { withdrawal_id: row.id, reason: name || transferStatus },
      })
      await updateWithdrawal(db, String(row.id), {
        status: 'reversed',
        transfer_error: null,
        note: 'Paystack reversed the bank transfer. ɃU returned to the wallet.',
        reviewed_at: new Date().toISOString(),
      })
      return { ok: true as const, id: String(row.id), status: 'reversed' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'wallet credit failed'
      await markWithdrawalFailed(String(row.id), `Paystack reversed the transfer. ${message}`, db)
      return { ok: true as const, id: String(row.id), status: 'payout_failed' }
    }
  }
  if (name === 'transfer.failed' || transferStatus === 'failed') {
    if (String(row.status) === 'rejected' || String(row.status) === 'failed' || String(row.status) === 'reversed') {
      return { ok: true as const, id: String(row.id), status: String(row.status) }
    }
    await markWithdrawalFailed(String(row.id), `Paystack ${name || transferStatus}`, db)
    return { ok: true as const, id: String(row.id), status: 'payout_failed' }
  }
  return { ok: true as const, id: String(row.id), status: String(row.status) }
}
