import { z } from 'zod'
import { randomUUID } from 'crypto'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { getBuNairaValue, quoteWithdrawBu, WalletAmountError, BU_MIN_WITHDRAW } from '@/lib/bu-rate'
import { getPlatformSettings, getUserControl } from '@/lib/admin/platform'
import { createDataClient } from '@/lib/supabase/data'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { isPaystackConfigured } from '@/lib/env'
import { NGN_BANKS, bankCodeFromName } from '@/lib/payments/ngn-banks'
import { moveLiveWallet } from '@/lib/wallet/move'
import {
  insertWithdrawalRow,
  markWithdrawalFailed,
  paystackPayoutMessage,
  publicWithdrawalLabel,
  publicWithdrawalStatus,
  sendWithdrawalPayout,
} from '@/lib/wallet/payout'

const schema = z.object({
  amount: z.number().positive().optional(),
  bu: z.number().positive().optional(),
  bank_name: z.string().min(2),
  bank_code: z.string().min(2).optional(),
  account_number: z.string().regex(/^\d{10}$/, 'Account number must be a 10-digit NUBAN'),
  account_name: z.string().min(2),
}).refine((body) => body.bu != null || body.amount != null, {
  message: 'Enter ɃU to withdraw',
})

async function liveUser() {
  const user = await requireUser()
  const session = await readBuSession()
  const liveId =
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id
  return { user, liveId }
}

function guestRow(row: Record<string, unknown>) {
  const status = String(row.status ?? 'pending')
  const account = String(row.account_number ?? '')
  return {
    id: String(row.id),
    bu: Number(row.bu ?? 0),
    naira: Number(row.naira ?? 0),
    bank_name: String(row.bank_name ?? ''),
    account_name: String(row.account_name ?? ''),
    account_number: account.length >= 4 ? `****${account.slice(-4)}` : account,
    status,
    public_status: publicWithdrawalStatus(status),
    label: publicWithdrawalLabel(status),
    created_at: String(row.created_at ?? ''),
    paid_at: row.paid_at ? String(row.paid_at) : null,
  }
}

export async function GET() {
  try {
    const { user, liveId } = await liveUser()
    const db = tryCreateAdminClient() ?? createDataClient()
    let query = db.from('bu_withdrawals').select('*').eq('user_id', liveId).order('created_at', { ascending: false }).limit(50)
    let result = await query
    if ((!result.data || result.data.length === 0) && liveId !== user.id) {
      result = await db.from('bu_withdrawals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
    }
    const rows = result.error ? [] : ((result.data ?? []) as Array<Record<string, unknown>>)
    return successResponse({
      withdrawals: rows.map(guestRow),
      banks: NGN_BANKS.map((bank) => ({ name: bank.name, code: bank.code })),
      min_withdraw_bu: BU_MIN_WITHDRAW,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user, liveId } = await liveUser()
    const db = tryCreateAdminClient() ?? createDataClient()
    const control = await getUserControl(liveId, db)
    const sessionControl = liveId === user.id ? control : await getUserControl(user.id, db)
    if (control.suspended || control.deleted_at || sessionControl.suspended || sessionControl.deleted_at) {
      throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'This ɃU account is suspended.')
    }
    const settings = await getPlatformSettings(db)
    const body = schema.parse(await request.json())
    const bankCode = (body.bank_code || bankCodeFromName(body.bank_name)).trim()
    if (!bankCode) {
      throw new ApiError(400, 'UNKNOWN_BANK', 'Choose a listed Nigerian bank.')
    }
    const bankName = NGN_BANKS.find((bank) => bank.code === bankCode)?.name ?? body.bank_name
    let quote
    try {
      quote = quoteWithdrawBu(body.bu ?? body.amount ?? 0)
    } catch (error) {
      if (error instanceof WalletAmountError) {
        throw new ApiError(400, error.code, error.message)
      }
      throw error
    }

    const automatic = settings.withdrawal_mode !== 'manual'
    if (automatic && !isPaystackConfigured()) {
      throw new ApiError(
        503,
        'PAYSTACK_REQUIRED',
        'Bank payouts are not configured yet. Super Admin must add the live Paystack secret and enable Transfers.',
      )
    }

    const meta = {
      bu: quote.bu,
      naira: quote.naira,
      bank_naira: quote.bankNaira,
      paystack_transfer_fee: quote.paystackFee,
      fee_absorbed: true,
      value_rate: getBuNairaValue(),
      bank_name: bankName,
      bank_code: bankCode,
      account_number_last4: body.account_number.slice(-4),
      account_name: body.account_name,
    }

    await moveLiveWallet(db, {
      userId: liveId,
      naira: quote.naira,
      direction: 'debit',
      type: 'withdrawal',
      description: `Withdrawal to ${bankName}`,
      metadata: meta,
    })

    const id = randomUUID()
    const queuedStatus = automatic ? 'approved' : 'pending'
    let row: Record<string, unknown>
    try {
      row = await insertWithdrawalRow(db, {
        id,
        user_id: liveId,
        bu: quote.bu,
        naira: quote.naira,
        bank_name: bankName,
        bank_code: bankCode,
        account_number: body.account_number,
        account_name: body.account_name.trim(),
        status: queuedStatus,
        mode: settings.withdrawal_mode,
        reviewed_at: automatic ? new Date().toISOString() : null,
      })
    } catch (error) {
      await moveLiveWallet(db, {
        userId: liveId,
        naira: quote.naira,
        direction: 'credit',
        type: 'refund',
        description: 'Withdrawal rolled back',
        metadata: { ...meta, reason: 'insert_failed' },
      }).catch(() => undefined)
      throw new ApiError(500, 'WITHDRAW_FAILED', error instanceof Error ? error.message : 'Could not save withdrawal')
    }

    if (!automatic) {
      return successResponse(
        { ...guestRow(row), bank_naira: quote.bankNaira, paystack_transfer_fee: quote.paystackFee },
        'Withdrawal sent for Super Admin approval',
      )
    }

    try {
      const payout = await sendWithdrawalPayout(row, db)
      const paidRow = { ...row, status: payout.status, paid_at: payout.status === 'paid' ? new Date().toISOString() : null }
      return successResponse(
        { ...guestRow(paidRow), bank_naira: quote.bankNaira, paystack_transfer_fee: quote.paystackFee, paystack_reference: payout.reference },
        payout.status === 'paid' ? 'Naira sent to your bank' : 'Withdrawal sent to your bank',
      )
    } catch (error) {
      const message = paystackPayoutMessage(error)
      try {
        await moveLiveWallet(db, {
          userId: liveId,
          naira: quote.naira,
          direction: 'credit',
          type: 'refund',
          description: 'Withdrawal refunded after payout failed',
          metadata: { ...meta, withdrawal_id: id, reason: message },
        })
        await markWithdrawalFailed(id, message, db, 'failed')
      } catch (refundError) {
        await markWithdrawalFailed(
          id,
          `${message} Refund also failed: ${refundError instanceof Error ? refundError.message : 'unknown'}`,
          db,
        )
        throw new ApiError(502, 'PAYOUT_FAILED', `${message} ɃU was held. Super Admin can retry or refund.`)
      }
      throw new ApiError(502, 'PAYOUT_FAILED', message)
    }
  } catch (error) {
    return handleRouteError(error)
  }
}
