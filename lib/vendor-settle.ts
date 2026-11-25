import { randomUUID } from 'crypto'
import { getBuNairaValue, quoteWithdrawBu, roundMoney, WalletAmountError } from '@/lib/bu-rate'
import { isPaystackConfigured } from '@/lib/env'
import { displayBankName } from '@/lib/payments/ngn-banks'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { getPlatformSettings } from '@/lib/admin/platform'
import { createPayoutRecipient, insertWithdrawalRow, sendWithdrawalPayout } from '@/lib/wallet/payout'
import { debitFaceThenCharge, moveLiveWallet } from '@/lib/wallet/move'
import { getVendorProfile } from '@/lib/vendor-profile'

/** Best effort. A failed bank send leaves the sale in the BU wallet. */
export async function settleVendorSale(vendorUserId: string, naira: number) {
  const profile = await getVendorProfile(vendorUserId)
  if (profile.settlement !== 'bank') return
  if (profile.bank_account_number.length !== 10 || !profile.bank_code) return
  if (!isPaystackConfigured()) return
  let quote
  try {
    quote = quoteWithdrawBu(naira)
  } catch (error) {
    if (error instanceof WalletAmountError) return
    throw error
  }
  const db = tryCreateAdminClient() ?? createDataClient()
  const settings = await getPlatformSettings(db)
  const bankCode = profile.bank_code
  const bankName = displayBankName(profile.bank_name || 'Bank', bankCode)
  const ready = await createPayoutRecipient({
    bank_code: bankCode,
    bank_name: bankName,
    account_number: profile.bank_account_number,
    account_name: profile.business_name || 'BUCKS business',
  })
  const meta = {
    kind: 'bank_send',
    bu: quote.bu,
    naira: quote.naira,
    bank_naira: quote.bankNaira,
    total_debit: quote.totalDebit,
    value_rate: getBuNairaValue(),
    bank_name: bankName,
    bank_code: ready.bankCode,
    remark: 'Scan to pay settlement',
    auto_settlement: true,
  }
  let debited: Awaited<ReturnType<typeof debitFaceThenCharge>>
  try {
    debited = await debitFaceThenCharge(db, {
      userId: vendorUserId,
      faceNaira: quote.bankNaira,
      chargeNaira: roundMoney(quote.totalDebit - quote.bankNaira),
      type: 'withdrawal',
      faceDescription: `Sent to ${bankName}`,
      metadata: meta,
    })
  } catch {
    return
  }
  const id = randomUUID()
  try {
    const row = await insertWithdrawalRow(db, {
      id,
      user_id: vendorUserId,
      bu: quote.bu,
      naira: quote.bankNaira,
      bank_name: bankName,
      bank_code: ready.bankCode,
      account_number: profile.bank_account_number,
      account_name: ready.accountName || profile.business_name,
      paystack_recipient: ready.recipient.recipient_code,
      status: settings.withdrawal_mode === 'manual' ? 'pending' : 'approved',
      mode: settings.withdrawal_mode,
      reviewed_at: new Date().toISOString(),
    })
    if (settings.withdrawal_mode !== 'manual') {
      await sendWithdrawalPayout(row, db)
    }
  } catch {
    await moveLiveWallet(db, {
      userId: vendorUserId,
      naira: roundMoney(debited.face + debited.charge),
      direction: 'credit',
      type: 'refund',
      description: 'Bank send refunded',
      metadata: { ...meta, move_id: crypto.randomUUID(), refund_of: debited.faceMoveId },
    }).catch(() => undefined)
  }
}
