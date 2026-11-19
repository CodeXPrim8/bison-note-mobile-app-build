import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { writeAdminAudit } from '@/lib/admin/platform'
import { isPaystackConfigured } from '@/lib/env'
import {
  adminPaystackSnapshot,
  clearPaystackBalanceCache,
  createPaystackRefund,
  listPaystackTransactions,
  verifyTransaction,
} from '@/lib/payments/paystack'

const refundSchema = z.object({
  action: z.literal('refund'),
  reference: z.string().min(4),
})

const refreshSchema = z.object({
  action: z.literal('refresh').optional(),
})

/**
 * Paystack Transfers Balance can only be funded from the Paystack Dashboard Topup button.
 * A normal `/transaction/initialize` charge is a customer payment — it settles to your bank,
 * it does NOT raise the Transfers wallet used for withdrawals.
 */
export async function GET() {
  try {
    const { liveId } = await requireAdmin()
    if (!isPaystackConfigured()) {
      throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Settlement is not configured.')
    }

    clearPaystackBalanceCache()
    const paystack = await adminPaystackSnapshot()
    let mistaken: Array<{
      reference: string
      amount_naira: number
      status: string
      paid_at: string | null
    }> = []

    try {
      const rows = await listPaystackTransactions({ perPage: 50 })
      mistaken = rows
        .filter((row) => String(row.reference ?? '').startsWith('SETTLE_'))
        .map((row) => ({
          reference: String(row.reference),
          amount_naira: Math.round(Number(row.amount ?? 0)) / 100,
          status: String(row.status ?? ''),
          paid_at: row.paid_at ?? row.created_at ?? null,
        }))
    } catch {
      mistaken = []
    }

    await writeAdminAudit(liveId, 'settlement.balance.refresh', null, {
      naira: paystack.naira,
      mistaken_count: mistaken.length,
    })

    return successResponse({
      paystack,
      dashboard_topup_url: 'https://dashboard.paystack.com/#/balance',
      dashboard_transactions_url: 'https://dashboard.paystack.com/#/transactions',
      howto: [
        'Open Paystack Dashboard → Balance (or Home) → Topup.',
        'Pay that checkout — only Dashboard Topup credits the Transfers wallet.',
        'Do not use a normal payment link; those settle to your bank, not Transfers.',
        'Set business/trading name to ASCII BUCKS in Paystack Settings (Ƀucks becomes EFUCKS/UCKS on rails).',
      ],
      mistaken_settle_charges: mistaken,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { liveId } = await requireAdmin()
    if (!isPaystackConfigured()) {
      throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Settlement is not configured.')
    }

    const json = await request.json().catch(() => ({}))
    const refundParsed = refundSchema.safeParse(json)
    if (refundParsed.success) {
      const reference = refundParsed.data.reference.trim()
      if (!reference.startsWith('SETTLE_')) {
        throw new ApiError(
          400,
          'INVALID_REFERENCE',
          'Only mistaken SETTLE_ checkout charges can be refunded here.',
        )
      }

      const verified = await verifyTransaction(reference)
      if (verified.status !== 'success') {
        throw new ApiError(402, 'PAYMENT_FAILED', `Charge status is ${verified.status}, not refundable yet.`)
      }

      const refund = await createPaystackRefund({
        reference,
        merchantNote: 'Refund mistaken admin settlement checkout — use Paystack Dashboard Topup instead',
      })

      clearPaystackBalanceCache()
      await writeAdminAudit(liveId, 'settlement.topup.refund', reference, {
        refund_id: refund.id,
        refund_status: refund.status,
        amount_kobo: refund.amount,
      })

      return successResponse({
        reference,
        refund_id: refund.id,
        refund_status: refund.status,
        amount_naira: Math.round(Number(refund.amount ?? verified.amount ?? 0)) / 100,
        message: 'Refund started. Money returns to the card/account that was charged (may take a few days).',
      })
    }

    const refreshParsed = refreshSchema.safeParse(json)
    if (!refreshParsed.success) {
      throw new ApiError(
        400,
        'USE_DASHBOARD_TOPUP',
        'Settlement cannot be topped up from this app. Use Paystack Dashboard → Balance → Topup. If you were charged on a SETTLE_ checkout, refund it from Money.',
      )
    }

    clearPaystackBalanceCache()
    const paystack = await adminPaystackSnapshot()
    return successResponse({
      paystack,
      dashboard_topup_url: 'https://dashboard.paystack.com/#/balance',
      message: 'Balance refreshed. Fund Transfers only via Paystack Dashboard → Topup.',
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
