import { ApiError } from '@/lib/api/errors'
import {
  isPaystackConfigured,
  listPaystackTransactions,
  requeryDedicatedVirtualAccount,
  verifyTransaction,
} from '@/lib/payments/paystack'
import {
  findVirtualAccountByAccountNumber,
  findVirtualAccountByCustomerCode,
  getStoredVirtualAccount,
} from '@/lib/payments/virtual-account'
import { createDataClient } from '@/lib/supabase/data'
import { moveLiveWallet } from '@/lib/wallet/move'

export type PaystackChargeData = {
  reference?: string
  amount?: number
  status?: string
  channel?: string
  currency?: string
  fees?: number
  paid_at?: string
  customer?: { email?: string; customer_code?: string; id?: number }
  metadata?: Record<string, unknown> | null
  authorization?: {
    channel?: string
    receiver_bank_account_number?: string
    receiver_bank?: string
    account_number?: string
    bank?: string
  } | null
}

export function isDedicatedNubanCharge(data: PaystackChargeData | null | undefined): boolean {
  if (!data) return false
  const channel = String(data.authorization?.channel || data.channel || '').toLowerCase()
  return channel === 'dedicated_nuban'
}

function receiverAccountNumber(data: PaystackChargeData): string {
  const auth = data.authorization
  return String(auth?.receiver_bank_account_number || auth?.account_number || '').replace(/\D/g, '')
}

async function walletHasReference(userId: string, reference: string): Promise<boolean> {
  const db = createDataClient()
  const rpc = await db.rpc('bu_wallet_has_reference', { p_user_id: userId, p_reference: reference })
  if (!rpc.error) return Boolean(rpc.data)
  const prior = await db.from('bu_wallet_ledger').select('id').eq('user_id', userId).eq('reference', reference).limit(1)
  return Boolean(prior.data?.length)
}

async function resolveDvaUserId(data: PaystackChargeData, meta: Record<string, unknown>) {
  const accountNumber = receiverAccountNumber(data)
  const customerCode = String(data.customer?.customer_code || '').trim()
  const metaUserId = typeof meta.user_id === 'string' ? meta.user_id : ''
  if (metaUserId) return { userId: metaUserId, accountNumber, customerCode }
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

async function creditDedicatedNubanRow(
  knownUserId: string | null,
  data: PaystackChargeData,
  options?: { verify?: boolean },
) {
  const reference = String(data.reference || '').trim()
  if (!reference) {
    throw new ApiError(400, 'NO_REFERENCE', 'Missing transaction reference')
  }

  let charge = data
  if (options?.verify !== false) {
    const verified = await verifyTransaction(reference)
    if (verified.status !== 'success') {
      throw new ApiError(402, 'PAYMENT_FAILED', 'Payment was not successful', {
        paystack_status: verified.status,
      })
    }
    charge = {
      reference: verified.reference,
      amount: verified.amount,
      status: verified.status,
      channel: verified.channel,
      fees: verified.fees,
      customer: verified.customer,
      metadata: verified.metadata,
      authorization: verified.authorization,
    }
  }

  if (String(charge.status || data.status || '') !== 'success' && options?.verify === false) {
    throw new ApiError(402, 'PAYMENT_FAILED', 'Payment was not successful')
  }

  const meta = (charge.metadata ?? data.metadata ?? {}) as Record<string, unknown>
  const amountKobo = Number(charge.amount ?? data.amount ?? 0)
  const creditNaira = Math.round(amountKobo) / 100
  if (!(creditNaira > 0)) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'Charge amount must be greater than zero')
  }

  const resolved = await resolveDvaUserId({ ...data, ...charge }, meta)
  const userId = knownUserId || resolved.userId
  if (!userId) {
    throw new ApiError(404, 'VIRTUAL_ACCOUNT_USER_NOT_FOUND', 'No Ƀucks user matched this dedicated account payment', {
      reference,
      account_number: resolved.accountNumber || null,
      customer_code: resolved.customerCode || null,
    })
  }

  if (await walletHasReference(userId, reference)) {
    return { already_credited: true, userId, amount: creditNaira, reference }
  }

  const db = createDataClient()
  const ledgerMeta = {
    ...meta,
    reference,
    move_id: reference,
    kind: 'deposit',
    channel: 'dedicated_nuban',
    account_number: resolved.accountNumber || null,
    customer_code: resolved.customerCode || null,
    paystack_amount_kobo: amountKobo,
    paystack_fees: charge.fees ?? data.fees ?? null,
    direction: 'credit',
    requested_type: 'deposit',
    description: 'Bank transfer top-up',
  }

  // Claim the Paystack reference in the ledger first so concurrent sync/webhook
  // calls cannot credit the same transfer twice (unique user_id+reference).
  const claim = await db
    .from('bu_wallet_ledger')
    .insert({
      user_id: userId,
      direction: 'credit',
      type: 'deposit',
      naira: creditNaira,
      description: 'Bank transfer top-up',
      reference,
      metadata: ledgerMeta,
    })
    .select('id')
    .maybeSingle()

  if (claim.error) {
    if (/unique|duplicate/i.test(claim.error.message)) {
      return { already_credited: true, userId, amount: creditNaira, reference }
    }
    if (!/schema cache|does not exist|could not find the table/i.test(claim.error.message)) {
      throw new ApiError(500, 'LEDGER_CLAIM_FAILED', claim.error.message)
    }
  } else if (!claim.data) {
    // ignoreDuplicates / empty return — treat as already claimed
    if (await walletHasReference(userId, reference)) {
      return { already_credited: true, userId, amount: creditNaira, reference }
    }
  }

  await moveLiveWallet(db, {
    userId,
    naira: creditNaira,
    direction: 'credit',
    type: 'deposit',
    description: 'Bank transfer top-up',
    metadata: ledgerMeta,
  })

  return { already_credited: false, userId, amount: creditNaira, reference }
}

export async function fulfillDedicatedNubanCharge(data: PaystackChargeData) {
  if (!isPaystackConfigured()) {
    throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Funding is not available right now.')
  }
  const result = await creditDedicatedNubanRow(null, data, { verify: true })
  return {
    payment: {
      reference: result.reference,
      status: 'success',
      kind: 'deposit',
      channel: 'dedicated_nuban',
      user_id: result.userId,
      amount: result.amount,
      callback_url: null,
      already_credited: result.already_credited,
    },
    tickets: [] as unknown[],
  }
}

/** Pull recent Paystack DVA charges for this user and credit any that are still missing. */
export async function syncUserDedicatedNubanCredits(
  userId: string,
  options?: { requery?: boolean },
) {
  if (!isPaystackConfigured()) {
    throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Funding is not available right now.')
  }
  const account = await getStoredVirtualAccount(userId)
  if (!account) {
    return { credited: [] as Array<{ reference: string; amount: number }>, checked: 0 }
  }

  const shouldRequery = options?.requery !== false
  let requery: { ok: boolean; message?: string; skipped?: boolean } | null = null
  if (shouldRequery && account.bank_slug) {
    requery = await requeryDedicatedVirtualAccount({
      accountNumber: account.account_number,
      providerSlug: account.bank_slug,
    })
  }

  const customerKey = account.customer_id || account.customer_code
  const rows = await listPaystackTransactions({ customer: customerKey, perPage: 20 })
  const candidates = rows.filter((row) => {
    if (String(row.status) !== 'success') return false
    if (!isDedicatedNubanCharge(row)) return false
    const receiver = receiverAccountNumber(row)
    if (receiver && receiver !== account.account_number) return false
    return Boolean(row.reference)
  })

  const presence = await Promise.all(
    candidates.map(async (row) => ({
      row,
      seen: await walletHasReference(userId, String(row.reference)),
    })),
  )

  const credited: Array<{ reference: string; amount: number }> = []
  for (const item of presence) {
    if (item.seen) continue
    // List rows are already success on Paystack — credit immediately without a second verify round-trip.
    const result = await creditDedicatedNubanRow(userId, item.row, { verify: false })
    if (!result.already_credited) {
      credited.push({ reference: String(item.row.reference), amount: Number(result.amount) })
    }
  }

  return {
    credited,
    checked: candidates.length,
    account_number: account.account_number,
    requery,
  }
}
