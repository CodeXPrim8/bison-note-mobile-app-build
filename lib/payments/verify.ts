import { clearPaystackBalanceCache, isPaystackConfigured, verifyTransaction } from '@/lib/payments/paystack'
import { failPayment, fulfillSuccessfulPayment } from '@/lib/payments/fulfill'
import { fulfillLiveTicketPayment, isLiveTicketReference } from '@/lib/payments/live-ticket'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { isServiceRoleConfigured } from '@/lib/env'
import { ApiError } from '@/lib/api/errors'
import { nairaFromBu } from '@/lib/bu-rate'
import { moveLiveWallet } from '@/lib/wallet/move'
import type { Payment } from '@/lib/types/database'

export async function fulfillDepositReference(reference: string) {
  if (!isPaystackConfigured()) {
    throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Checkout is not available right now.')
  }
  const verified = await verifyTransaction(reference)
  if (verified.status !== 'success') {
    throw new ApiError(402, 'PAYMENT_FAILED', 'Payment was not successful', {
      paystack_status: verified.status,
    })
  }
  const meta = verified.metadata ?? {}
  const userId = typeof meta.user_id === 'string' ? meta.user_id : ''
  const creditNaira = Number(meta.credit_naira ?? 0)
  const bu = Number(meta.bu ?? 0)
  const amountToCredit =
    Number.isFinite(creditNaira) && creditNaira > 0
      ? creditNaira
      : Number.isFinite(bu) && bu > 0
        ? nairaFromBu(bu)
        : Math.round(Number(verified.amount ?? 0)) / 100
  if (userId && amountToCredit > 0) {
    const db = createDataClient()
    const prior = await db.from('bu_wallet_ledger').select('id').eq('user_id', userId).eq('reference', reference).limit(1)
    if (!prior.data?.length) {
      await moveLiveWallet(db, {
        userId,
        naira: amountToCredit,
        direction: 'credit',
        type: 'deposit',
        description: 'Wallet top-up',
        metadata: { ...meta, reference, move_id: reference, kind: 'deposit' },
      })
    }
  }
  return {
    payment: {
      reference,
      status: 'success',
      kind: 'deposit',
      user_id: userId || null,
      amount: amountToCredit,
      callback_url: null,
    },
    tickets: [],
  }
}

/** Confirm admin settlement funding when `public.payments` is unavailable. */
export async function fulfillSettlementTopupReference(reference: string) {
  if (!isPaystackConfigured()) {
    throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Settlement is not configured.')
  }
  const verified = await verifyTransaction(reference)
  if (verified.status !== 'success') {
    throw new ApiError(402, 'PAYMENT_FAILED', 'Payment was not successful', {
      paystack_status: verified.status,
    })
  }
  const meta = (verified.metadata ?? {}) as Record<string, unknown>
  const amount = Math.round(Number(verified.amount ?? 0)) / 100
  clearPaystackBalanceCache()
  try {
    const { writeAdminAudit } = await import('@/lib/admin/platform')
    const adminId = typeof meta.admin_id === 'string' ? meta.admin_id : null
    if (adminId) {
      await writeAdminAudit(adminId, 'settlement.topup.confirmed', reference, {
        amount_naira: amount,
        paystack_status: verified.status,
      })
    }
  } catch {
    /* audit is optional */
  }
  return {
    payment: {
      reference,
      status: 'success',
      kind: 'deposit',
      user_id: typeof meta.admin_id === 'string' ? meta.admin_id : null,
      amount,
      callback_url: null,
      metadata: { ...meta, kind: 'settlement_topup' },
    },
    tickets: [],
  }
}

export async function verifyReference(reference: string) {
  if (reference.startsWith('SETTLE_')) {
    if (isServiceRoleConfigured()) {
      try {
        const admin = createAdminClient()
        const found = await admin.from('payments').select('*').eq('reference', reference).maybeSingle()
        if (!found.error && found.data) {
          const payment = found.data as Payment
          if (payment.status === 'success' || payment.status === 'settled') {
            clearPaystackBalanceCache()
            return { payment, tickets: [] }
          }
          if (isPaystackConfigured() && payment.amount > 0) {
            const verified = await verifyTransaction(reference)
            if (verified.status === 'success') {
              const fulfilled = await fulfillSuccessfulPayment(reference)
              clearPaystackBalanceCache()
              return fulfilled
            }
            await failPayment(reference, verified.status)
            throw new ApiError(402, 'PAYMENT_FAILED', 'Payment was not successful', {
              paystack_status: verified.status,
            })
          }
        }
      } catch (error) {
        if (error instanceof ApiError) throw error
        /* payments table missing or fulfill failed — verify against Paystack only */
      }
    }
    return fulfillSettlementTopupReference(reference)
  }

  if (reference.startsWith('DEPOSIT_')) {
    if (!isServiceRoleConfigured()) return fulfillDepositReference(reference)
  }
  if (isLiveTicketReference(reference) || !isServiceRoleConfigured()) {
    return fulfillLiveTicketPayment(reference)
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('payments').select('*').eq('reference', reference).maybeSingle()
  if (error && /payments/i.test(error.message) && /schema cache|does not exist|could not find the table/i.test(error.message)) {
    if (reference.startsWith('SETTLE_')) return fulfillSettlementTopupReference(reference)
    return fulfillLiveTicketPayment(reference)
  }
  if (!data) {
    return fulfillLiveTicketPayment(reference)
  }
  const payment = data as Payment

  if (payment.status === 'success' || payment.status === 'settled') {
    const { data: tickets } = await admin.from('tickets').select('*').eq('payment_id', payment.id)
    return { payment, tickets: tickets ?? [] }
  }

  if (isPaystackConfigured() && payment.amount > 0) {
    const verified = await verifyTransaction(reference)
    if (verified.status === 'success') {
      const fulfilled = await fulfillSuccessfulPayment(reference)
      const meta =
        payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
          ? (payment.metadata as Record<string, unknown>)
          : {}
      if (String(meta.kind ?? '').toLowerCase() === 'settlement_topup' || reference.startsWith('SETTLE_')) {
        clearPaystackBalanceCache()
      }
      return fulfilled
    }
    await failPayment(reference, verified.status)
    throw new ApiError(402, 'PAYMENT_FAILED', 'Payment was not successful', {
      paystack_status: verified.status,
    })
  }

  throw new ApiError(409, 'PAYMENT_PENDING', 'Payment is still pending')
}
