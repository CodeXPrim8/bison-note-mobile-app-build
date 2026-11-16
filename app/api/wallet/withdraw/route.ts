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
import { NGN_BANKS, bankCodeFromName, displayBankName } from '@/lib/payments/ngn-banks'
import { moveLiveWallet } from '@/lib/wallet/move'
import { pinSchema } from '@/lib/auth/pin'
import { verifyLegacyBuPin } from '@/lib/auth/legacy-login'
import { resolveNuban } from '@/lib/payments/paystack'
import {
  createPayoutRecipient,
  guestBanks,
  insertWithdrawalRow,
  listWithdrawalRows,
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
  account_name: z.string().min(2).optional(),
  remark: z.string().max(160).optional(),
  pin: pinSchema,
}).refine((body) => body.bu != null || body.amount != null, {
  message: 'Enter ɃU to send',
})

const resolveSchema = z.object({
  bank_code: z.string().min(2),
  account_number: z.string().regex(/^\d{10}$/, 'Account number must be a 10-digit NUBAN'),
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

export async function GET(request: Request) {
  try {
    const { user, liveId } = await liveUser()
    const url = new URL(request.url)
    const accountNumber = url.searchParams.get('account_number')
    const bankCode = url.searchParams.get('bank_code')
    if (accountNumber && bankCode) {
      const parsed = resolveSchema.parse({ account_number: accountNumber, bank_code: bankCode })
      if (!isPaystackConfigured()) {
        throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Bank payouts are not available right now.')
      }
      try {
        const resolved = await resolveNuban(parsed.account_number, parsed.bank_code)
        return successResponse({
          account_number: resolved.account_number,
          account_name: resolved.account_name,
          bank_code: parsed.bank_code,
        })
      } catch (error) {
        throw new ApiError(400, 'BANK_INVALID', paystackPayoutMessage(error))
      }
    }

    const db = tryCreateAdminClient() ?? createDataClient()
    let rows = await listWithdrawalRows(db, liveId, 50)
    if ((!rows.length) && liveId !== user.id) {
      rows = await listWithdrawalRows(db, user.id, 50)
    }
    return successResponse({
      withdrawals: rows.map(guestRow),
      banks: await guestBanks(),
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
    const session = await readBuSession()
    const phone = session?.phone_e164 || session?.phone
    if (!phone) {
      throw new ApiError(400, 'PIN_REQUIRED', 'Enter the transaction PIN you created for this account.')
    }
    const pinCheck = await verifyLegacyBuPin(phone, body.pin)
    if ('wrongPin' in pinCheck) {
      throw new ApiError(401, 'WRONG_PIN', 'Incorrect transaction PIN.')
    }
    if (!('session' in pinCheck)) {
      throw new ApiError(400, 'PIN_NOT_SET', 'Create your transaction PIN at signup before sending to bank.')
    }

    const bankCode = (body.bank_code || bankCodeFromName(body.bank_name)).trim()
    if (!bankCode) {
      throw new ApiError(400, 'UNKNOWN_BANK', 'Choose a listed Nigerian bank.')
    }
    const bankName = displayBankName(
      NGN_BANKS.find((bank) => bank.code === bankCode)?.name ?? body.bank_name,
      bankCode,
    )
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
        'Bank payouts are not configured yet. Contact support or try again later.',
      )
    }

    let accountName = body.account_name?.trim() || ''
    let recipientReady: Awaited<ReturnType<typeof createPayoutRecipient>> | null = null
    if (isPaystackConfigured()) {
      try {
        if (!accountName) {
          const resolved = await resolveNuban(body.account_number, bankCode)
          accountName = resolved.account_name
        }
        recipientReady = await createPayoutRecipient({
          bank_code: bankCode,
          bank_name: bankName,
          account_number: body.account_number,
          account_name: accountName,
        })
        accountName = recipientReady.accountName || accountName
      } catch (error) {
        throw new ApiError(400, 'BANK_INVALID', paystackPayoutMessage(error))
      }
    }
    if (!accountName) {
      throw new ApiError(400, 'ACCOUNT_NAME_REQUIRED', 'Could not resolve the bank account name.')
    }

    const remark = body.remark?.trim() || ''
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
      account_name: accountName,
      remark: remark || null,
      kind: 'bank_send',
    }

    await moveLiveWallet(db, {
      userId: liveId,
      naira: quote.naira,
      direction: 'debit',
      type: 'withdrawal',
      description: remark ? `Sent to ${bankName} · ${remark}` : `Sent to ${bankName}`,
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
        bank_code: recipientReady?.bankCode ?? bankCode,
        account_number: body.account_number,
        account_name: recipientReady?.accountName || accountName,
        paystack_recipient: recipientReady?.recipient.recipient_code ?? null,
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
        description: 'Bank send rolled back',
        metadata: { ...meta, reason: 'insert_failed' },
      }).catch(() => undefined)
      throw new ApiError(500, 'WITHDRAW_FAILED', error instanceof Error ? error.message : 'Could not save bank send')
    }

    if (!automatic) {
      return successResponse(
        {
          ...guestRow(row),
          bank_naira: quote.bankNaira,
          paystack_transfer_fee: quote.paystackFee,
          remark: remark || null,
          invoice_number: id,
        },
        'Sent for Super Admin approval',
      )
    }

    try {
      const payout = await sendWithdrawalPayout(row, db)
      const paidRow = { ...row, status: payout.status, paid_at: payout.status === 'paid' ? new Date().toISOString() : null }
      return successResponse(
        {
          ...guestRow(paidRow),
          bank_naira: quote.bankNaira,
          paystack_transfer_fee: quote.paystackFee,
          paystack_reference: payout.reference,
          remark: remark || null,
          invoice_number: id,
        },
        payout.status === 'paid' ? 'Sent to bank' : 'Send submitted to bank',
      )
    } catch (error) {
      const message = paystackPayoutMessage(error)
      try {
        await moveLiveWallet(db, {
          userId: liveId,
          naira: quote.naira,
          direction: 'credit',
          type: 'refund',
          description: 'Bank send refunded after payout failed',
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
