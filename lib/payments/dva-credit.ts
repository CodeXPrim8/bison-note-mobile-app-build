import { ApiError } from '@/lib/api/errors'
import { isPaystackConfigured, listPaystackTransactions, verifyTransaction } from '@/lib/payments/paystack'
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

export async function fulfillDedicatedNubanCharge(data: PaystackChargeData) {
  if (!isPaystackConfigured()) {
    throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Paystack is not configured.')
  }
  const reference = String(data.reference || '').trim()
  if (!reference) {
    throw new ApiError(400, 'NO_REFERENCE', 'Missing transaction reference')
  }

  const verified = await verifyTransaction(reference)
  if (verified.status !== 'success') {
    throw new ApiError(402, 'PAYMENT_FAILED', 'Payment was not successful', {
      paystack_status: verified.status,
    })
  }

  const verifiedAsCharge: PaystackChargeData = {
    reference: verified.reference,
    amount: verified.amount,
    status: verified.status,
    channel: verified.channel,
    fees: verified.fees,
    customer: verified.customer,
    metadata: verified.metadata,
    authorization: verified.authorization,
  }

  const verifiedMeta = (verified.metadata ?? {}) as Record<string, unknown>
  const amountKobo = Number(verified.amount ?? data.amount ?? 0)
  const creditNaira = Math.round(amountKobo) / 100
  if (!(creditNaira > 0)) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'Charge amount must be greater than zero')
  }

  const accountNumber = receiverAccountNumber(data) || receiverAccountNumber(verifiedAsCharge)
  const customerCode = String(data.customer?.customer_code || verified.customer?.customer_code || '').trim()
  const metaUserId = typeof verifiedMeta.user_id === 'string' ? verifiedMeta.user_id : ''

  let userId = metaUserId
  if (!userId && accountNumber) {
    const byAccount = await findVirtualAccountByAccountNumber(accountNumber)
    userId = byAccount?.user_id || ''
  }
  if (!userId && customerCode) {
    const byCustomer = await findVirtualAccountByCustomerCode(customerCode)
    userId = byCustomer?.user_id || ''
  }
  if (!userId) {
    throw new ApiError(404, 'VIRTUAL_ACCOUNT_USER_NOT_FOUND', 'No Bucks user matched this dedicated account payment', {
      reference,
      account_number: accountNumber || null,
      customer_code: customerCode || null,
    })
  }

  if (await walletHasReference(userId, reference)) {
    return {
      payment: {
        reference,
        status: 'success',
        kind: 'deposit',
        channel: 'dedicated_nuban',
        user_id: userId,
        amount: creditNaira,
        callback_url: null,
        already_credited: true,
      },
      tickets: [] as unknown[],
    }
  }

  const db = createDataClient()
  await moveLiveWallet(db, {
    userId,
    naira: creditNaira,
    direction: 'credit',
    type: 'deposit',
    description: 'Bank transfer top-up',
    metadata: {
      ...verifiedMeta,
      reference,
      move_id: reference,
      kind: 'deposit',
      channel: 'dedicated_nuban',
      account_number: accountNumber || null,
      customer_code: customerCode || null,
      paystack_amount_kobo: amountKobo,
      paystack_fees: data.fees ?? verified.fees ?? null,
    },
  })

  return {
    payment: {
      reference,
      status: 'success',
      kind: 'deposit',
      channel: 'dedicated_nuban',
      user_id: userId,
      amount: creditNaira,
      callback_url: null,
      already_credited: false,
    },
    tickets: [] as unknown[],
  }
}

/** Pull recent Paystack DVA charges for this user and credit any that are still missing. */
export async function syncUserDedicatedNubanCredits(userId: string) {
  if (!isPaystackConfigured()) {
    throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Paystack is not configured.')
  }
  const account = await getStoredVirtualAccount(userId)
  if (!account) {
    return { credited: [] as Array<{ reference: string; amount: number }>, checked: 0 }
  }

  const customerKey = account.customer_id || account.customer_code
  const rows = await listPaystackTransactions({ customer: customerKey, perPage: 30 })
  const credited: Array<{ reference: string; amount: number }> = []
  let checked = 0

  for (const row of rows) {
    if (String(row.status) !== 'success') continue
    if (!isDedicatedNubanCharge(row)) continue
    const receiver = receiverAccountNumber(row)
    if (receiver && receiver !== account.account_number) continue
    checked += 1
    const reference = String(row.reference || '')
    if (!reference) continue
    if (await walletHasReference(userId, reference)) continue
    const result = await fulfillDedicatedNubanCharge(row)
    if (!result.payment.already_credited) {
      credited.push({ reference, amount: Number(result.payment.amount) })
    }
  }

  return { credited, checked, account_number: account.account_number }
}
