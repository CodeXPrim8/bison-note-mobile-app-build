/**
 * Wallet FX. Live `wallets.balance` stays naira.
 * Display: 1 ɃU = ₦1. Peer send/tip: free (receiver gets face amount).
 * Spray: fee-on-top. Card Fund Wallet: 5% buy spread.
 * Bank transfer in: free under ₦10,000. From ₦10,000: ₦25 up to ₦20,000, then 0.3% capped at ₦150.
 * Withdraw: face to bank; Paystack + platform on top.
 * Ticket prices and the 5% ticket service fee stay naira and are separate.
 */
export const BU_NAIRA_VALUE = 1
export const BU_NAIRA_BUY = 1.05
export const BU_NAIRA_BUY_MAX = 1.08
export const BU_MIN_PURCHASE = 2000
export const BU_MIN_SPRAY = 200
export const BU_MIN_TRANSFER = 1
export const BU_MIN_WITHDRAW = 100
export const BU_WITHDRAW_PLATFORM_FEE = 25
export const BU_VTU_MARKUP = 1.02
export const BU_SPRAY_NOTES = [200, 500, 1000] as const
export const BU_BUY_PRESETS = [100, 500, 1000, 2000, 5000, 10000, 20000, 50000] as const

let runtimeBuNairaValue = BU_NAIRA_VALUE

export function setRuntimeBuNairaValue(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 1000) return
  runtimeBuNairaValue = roundMoney(value, 4)
}

export function getBuNairaValue() {
  return runtimeBuNairaValue
}

export class BuyQuoteError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'BuyQuoteError'
    this.code = code
  }
}

export class WalletAmountError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'WalletAmountError'
    this.code = code
  }
}

export type BuyQuote = {
  bu: number
  buyRate: number
  valueRate: number
  chargeNaira: number
  creditNaira: number
}

export type WithdrawQuote = {
  bu: number
  naira: number
  bankNaira: number
  paystackFee: number
  platformFee: number
  totalDebit: number
  totalDebitBu: number
}

export type PeerFeeQuote = {
  bu: number
  naira: number
  feeBu: number
  feeNaira: number
  totalDebitBu: number
  totalDebitNaira: number
}

export function roundMoney(amount: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round((amount + Number.EPSILON) * factor) / factor
}

export function cardBuyRate(): number {
  return Math.min(BU_NAIRA_BUY, BU_NAIRA_BUY_MAX)
}

export function minPurchaseChargeNaira(): number {
  return roundMoney(BU_MIN_PURCHASE * cardBuyRate())
}

export function nairaFromBu(bu: number): number {
  return roundMoney(bu * getBuNairaValue())
}

export function buFromNaira(naira: number): number {
  const rate = getBuNairaValue()
  return roundMoney(naira / (rate || 1), 2)
}

/**
 * Paystack Nigeria Transfers API, deducted from the merchant balance
 * (not from the guest's ɃU). Stamp duty is government, from ₦10,000.
 */
export function paystackTransferFeeNaira(amountNaira: number): number {
  if (!Number.isFinite(amountNaira) || amountNaira <= 0) return 0
  const transfer = amountNaira <= 5000 ? 10 : amountNaira <= 50000 ? 25 : 50
  const stampDuty = amountNaira >= 10000 ? 50 : 0
  return transfer + stampDuty
}

export function publicBuRates() {
  return {
    value: getBuNairaValue(),
    buy: cardBuyRate(),
    buy_max: BU_NAIRA_BUY_MAX,
    min_purchase_bu: BU_MIN_PURCHASE,
    min_purchase_naira: minPurchaseChargeNaira(),
    min_spray_bu: BU_MIN_SPRAY,
    min_withdraw_bu: BU_MIN_WITHDRAW,
    spray_notes: [...BU_SPRAY_NOTES],
    buy_presets: [...BU_BUY_PRESETS],
  }
}

export function quoteBuyBu(bu: number): BuyQuote {
  if (!Number.isFinite(bu) || bu <= 0) {
    throw new BuyQuoteError('Enter how many ɃU to buy', 'INVALID_BU')
  }
  if (bu + 1e-9 < BU_MIN_PURCHASE) {
    throw new BuyQuoteError(
      `Minimum top-up is ${BU_MIN_PURCHASE.toLocaleString('en-NG')} ɃU (₦${minPurchaseChargeNaira().toLocaleString('en-NG')})`,
      'MIN_PURCHASE',
    )
  }
  const buyRate = cardBuyRate()
  const roundedBu = roundMoney(bu, 2)
  return {
    bu: roundedBu,
    buyRate,
    valueRate: getBuNairaValue(),
    chargeNaira: roundMoney(roundedBu * buyRate),
    creditNaira: nairaFromBu(roundedBu),
  }
}

export function quoteBuyFromChargeNaira(chargeNaira: number): BuyQuote {
  if (!Number.isFinite(chargeNaira) || chargeNaira <= 0) {
    throw new BuyQuoteError('Enter the naira you will pay', 'INVALID_AMOUNT')
  }
  const minCharge = minPurchaseChargeNaira()
  if (chargeNaira + 1e-9 < minCharge) {
    throw new BuyQuoteError(
      `Minimum top-up is ₦${minCharge.toLocaleString('en-NG')} (${BU_MIN_PURCHASE.toLocaleString('en-NG')} ɃU)`,
      'MIN_PURCHASE',
    )
  }
  return quoteBuyBu(chargeNaira / cardBuyRate())
}

/** ɃU → ɃU send / tip: free. Receiver gets full `bu`; no platform charge. */
export function peerTransferFeeBu(_bu: number): number {
  return 0
}

/** Quiet spray fee. Receiver / event gets full face; fee on top. */
export function sprayFeeBu(bu: number): number {
  const amount = roundMoney(bu, 2)
  if (!(amount > 0)) return 0
  return Math.min(100, Math.max(10, roundMoney(amount * 0.01, 2)))
}

export function quotePeerMoveBu(
  bu: number,
  kind: 'transfer' | 'tip' | 'spray' = 'transfer',
): PeerFeeQuote {
  const roundedBu = roundMoney(bu, 2)
  const feeBu = kind === 'spray' ? sprayFeeBu(roundedBu) : peerTransferFeeBu(roundedBu)
  const naira = nairaFromBu(roundedBu)
  const feeNaira = nairaFromBu(feeBu)
  return {
    bu: roundedBu,
    naira,
    feeBu,
    feeNaira,
    totalDebitBu: roundMoney(roundedBu + feeBu, 2),
    totalDebitNaira: roundMoney(naira + feeNaira),
  }
}

/** Bank transfer into ɃU. Free under ₦10,000. From ₦10,000 the pay-in fee applies. */
export function dvaCreditFeeNaira(grossNaira: number): number {
  const gross = roundMoney(grossNaira)
  if (!(gross > 0) || gross + 1e-9 < 10000) return 0
  if (gross + 1e-9 <= 20000) return 25
  return Math.min(150, Math.max(25, roundMoney(gross * 0.003)))
}

export function dvaNetCreditNaira(grossNaira: number): { gross: number; fee: number; net: number } {
  const gross = roundMoney(grossNaira)
  const fee = dvaCreditFeeNaira(gross)
  return { gross, fee, net: roundMoney(Math.max(0, gross - fee)) }
}

/** VTU debit (face to provider; markup kept). */
export function vtuDebitNaira(faceNaira: number): { face: number; debit: number; fee: number } {
  const face = roundMoney(faceNaira)
  const debit = roundMoney(face * BU_VTU_MARKUP)
  return { face, debit, fee: roundMoney(debit - face) }
}

/**
 * Send-to-bank quote. Bank always receives the full face amount (`bankNaira`).
 * Paystack + platform fees are charged on top to the sender (`totalDebit`).
 * If wallet balance < totalDebit → insufficient funds (do not shrink the bank amount).
 */
export function quoteWithdrawBu(bu: number): WithdrawQuote {
  if (!Number.isFinite(bu) || bu <= 0) {
    throw new WalletAmountError('Enter how many ɃU to withdraw', 'INVALID_BU')
  }
  if (bu + 1e-9 < BU_MIN_WITHDRAW) {
    throw new WalletAmountError(
      `Minimum withdrawal is ${BU_MIN_WITHDRAW.toLocaleString('en-NG')} ɃU (₦${nairaFromBu(BU_MIN_WITHDRAW).toLocaleString('en-NG')})`,
      'MIN_WITHDRAW',
    )
  }
  const roundedBu = roundMoney(bu, 2)
  const naira = nairaFromBu(roundedBu)
  const paystackFee = paystackTransferFeeNaira(naira)
  const platformFee = BU_WITHDRAW_PLATFORM_FEE
  const totalDebit = roundMoney(naira + paystackFee + platformFee)
  return {
    bu: roundedBu,
    naira,
    bankNaira: naira,
    paystackFee,
    platformFee,
    totalDebit,
    totalDebitBu: buFromNaira(totalDebit),
  }
}

export function formatBu(bu: number): string {
  const rounded = roundMoney(bu, 2)
  const whole = Math.abs(rounded - Math.round(rounded)) < 1e-9
  return rounded.toLocaleString('en-NG', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

export function formatNairaPlain(naira: number): string {
  return naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatNairaRate(naira: number): string {
  return naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
