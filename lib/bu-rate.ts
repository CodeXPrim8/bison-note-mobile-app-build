/**
 * Wallet FX. Live `wallets.balance` stays naira.
 * Spray / send / withdraw: 1 ɃU = ₦1 (display ɃU = ledger naira).
 * Card Fund Wallet: 5% buy spread so Paystack collection (~1.5% + ₦100)
 * and Paystack Transfers (₦10–₦50 + ₦50 stamp duty from ₦10,000) stay covered.
 * Ticket prices and the 5% ticket service fee stay naira and are separate.
 */
export const BU_NAIRA_VALUE = 1
export const BU_NAIRA_BUY = 1.05
export const BU_NAIRA_BUY_MAX = 1.08
export const BU_MIN_PURCHASE = 2000
export const BU_MIN_SPRAY = 200
export const BU_MIN_TRANSFER = 1
export const BU_MIN_WITHDRAW = 5000
export const BU_SPRAY_NOTES = [200, 500, 1000] as const
export const BU_BUY_PRESETS = [2000, 5000, 10000, 20000, 50000] as const

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
  return {
    bu: roundedBu,
    naira,
    bankNaira: naira,
    paystackFee: paystackTransferFeeNaira(naira),
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
