import { ApiError } from '@/lib/api/errors'
import { getPlatformSettings } from '@/lib/admin/platform'
import { quotePayInCreditNaira } from '@/lib/bu-rate'
import { isSquadConfigured, listSquadCustomerTransactions, type SquadVaWebhookPayload } from '@/lib/payments/squad'
import { sumUnderFreeBankVolumeToday } from '@/lib/wallet/free-quota'
import {
  findVirtualAccountByAccountNumber,
  findVirtualAccountByCustomerCode,
  getStoredVirtualAccount,
} from '@/lib/payments/virtual-account'
import { createDataClient } from '@/lib/supabase/data'
import { moveLiveWallet } from '@/lib/wallet/move'

function money(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function walletHasReference(userId: string, reference: string): Promise<boolean> {
  const db = createDataClient()
  const rpc = await db.rpc('bu_wallet_has_reference', { p_user_id: userId, p_reference: reference })
  if (!rpc.error) return Boolean(rpc.data)
  const prior = await db.from('bu_wallet_ledger').select('id').eq('user_id', userId).eq('reference', reference).limit(1)
  return Boolean(prior.data?.length)
}

async function resolveSquadUserId(payload: SquadVaWebhookPayload) {
  const accountNumber = String(payload.virtual_account_number ?? '').replace(/\D/g, '')
  const customerCode = String(payload.customer_identifier ?? '').trim()
  if (accountNumber) {
    const byAccount = await findVirtualAccountByAccountNumber(accountNumber)
    if (byAccount?.user_id) return { userId: byAccount.user_id, accountNumber, customerCode }
  }
  if (customerCode) {
    const byCustomer = await findVirtualAccountByCustomerCode(customerCode)
    if (byCustomer?.user_id) return { userId: byCustomer.user_id, accountNumber, customerCode }
  }
  return { userId: '', accountNumber, customerCode }
}

export async function fulfillSquadVirtualAccountCredit(payload: SquadVaWebhookPayload) {
  if (!isSquadConfigured()) {
    throw new ApiError(503, 'SQUAD_REQUIRED', 'Squad bank-in is not configured.')
  }

  const indicator = String(payload.transaction_indicator ?? 'C').toUpperCase()
  if (indicator && indicator !== 'C') {
    return { ignored: true as const, reason: 'not_credit' }
  }

  const reference = String(payload.transaction_reference ?? '').trim()
  if (!reference) throw new ApiError(400, 'NO_REFERENCE', 'Missing Squad transaction reference')

  const grossNaira = money(payload.principal_amount)
  if (!(grossNaira > 0)) throw new ApiError(400, 'INVALID_AMOUNT', 'Squad amount must be greater than zero')

  const resolved = await resolveSquadUserId(payload)
  if (!resolved.userId) {
    throw new ApiError(404, 'VIRTUAL_ACCOUNT_USER_NOT_FOUND', 'No Ƀucks user matched this Squad virtual account', {
      reference,
      account_number: resolved.accountNumber || null,
      customer_identifier: resolved.customerCode || null,
    })
  }

  const db = createDataClient()
  const settings = await getPlatformSettings(db)
  const freeUsedToday = await sumUnderFreeBankVolumeToday(
    db,
    resolved.userId,
    settings.squad_fee_rules.free_under_naira,
  )
  const credited = quotePayInCreditNaira(grossNaira, {
    provider: 'squad',
    freeUsedToday,
    squadRules: settings.squad_fee_rules,
  })

  if (await walletHasReference(resolved.userId, reference)) {
    return {
      already_credited: true as const,
      userId: resolved.userId,
      amount: credited.net,
      reference,
      ignored: false as const,
    }
  }

  const ledgerMeta = {
    reference,
    move_id: reference,
    kind: 'deposit',
    channel: 'squad_virtual_account',
    provider: 'squad',
    account_number: resolved.accountNumber || null,
    customer_code: resolved.customerCode || null,
    squad_fee: money(payload.fee_charged),
    settled_amount: money(payload.settled_amount),
    gross_naira: credited.gross,
    fee_naira: credited.fee,
    partner_fee_naira: credited.partnerFee,
    platform_fee_naira: credited.platformFee,
    free_quota_applied: credited.freeQuotaApplied,
    net_naira: credited.net,
    remarks: payload.remarks ?? null,
    direction: 'credit',
    requested_type: 'deposit',
    description: 'Bank transfer top-up',
  }

  const claim = await db
    .from('bu_wallet_ledger')
    .insert({
      user_id: resolved.userId,
      direction: 'credit',
      type: 'deposit',
      naira: credited.net,
      description: 'Bank transfer top-up',
      reference,
      metadata: ledgerMeta,
    })
    .select('id')
    .maybeSingle()

  if (claim.error) {
    if (/unique|duplicate/i.test(claim.error.message)) {
      return {
        already_credited: true as const,
        userId: resolved.userId,
        amount: credited.net,
        reference,
        ignored: false as const,
      }
    }
    if (!/schema cache|does not exist|could not find the table/i.test(claim.error.message)) {
      throw new ApiError(500, 'LEDGER_CLAIM_FAILED', claim.error.message)
    }
  }

  await moveLiveWallet(db, {
    userId: resolved.userId,
    naira: credited.net,
    direction: 'credit',
    type: 'deposit',
    description: 'Bank transfer top-up',
    metadata: ledgerMeta,
  })

  return {
    already_credited: false as const,
    userId: resolved.userId,
    amount: credited.net,
    reference,
    ignored: false as const,
  }
}

/** Pull recent Squad VA credits for this user and credit any still missing. */
export async function syncUserSquadCredits(userId: string) {
  if (!isSquadConfigured()) {
    throw new ApiError(503, 'SQUAD_REQUIRED', 'Squad bank-in is not configured.')
  }
  const account = await getStoredVirtualAccount(userId)
  if (!account?.customer_code) {
    return { credited: [] as Array<{ reference: string; amount: number }>, checked: 0 }
  }
  if (String((account as { provider?: string }).provider || '').toLowerCase() === 'paystack') {
    // Stored Paystack DVA — leave to Paystack sync.
  }

  const rows = await listSquadCustomerTransactions(account.customer_code)
  const credited: Array<{ reference: string; amount: number }> = []
  let checked = 0

  for (const row of rows) {
    const reference = String(row.transaction_reference ?? '').trim()
    if (!reference) continue
    checked += 1
    if (await walletHasReference(userId, reference)) continue
    const result = await fulfillSquadVirtualAccountCredit({
      transaction_reference: reference,
      virtual_account_number: row.virtual_account_number || account.account_number,
      principal_amount: row.principal_amount,
      settled_amount: row.settled_amount,
      fee_charged: row.fee_charged,
      transaction_date: row.transaction_date,
      customer_identifier: row.customer_identifier || account.customer_code,
      transaction_indicator: 'C',
      currency: row.currency || 'NGN',
      channel: 'virtual-account',
    })
    if (!result.ignored && !result.already_credited) {
      credited.push({ reference, amount: result.amount })
    }
  }

  return { credited, checked, account_number: account.account_number }
}
