/**
 * Wallet FX. Live `wallets.balance` stays naira.
 * Display: 1 ɃU = ₦1. Peer send/tip: free (receiver gets full face).
 * Spray: fee-on-top. Card Fund Wallet: 5% buy spread.
 * Bank transfer in/out: first 3 under ₦10,000 per wallet per WAT day are free;
 * after that (or from ₦10,000) guest pays partner pass-through + 0.05% Bucks keep.
 * Pay-out also adds ₦50 stamp from ₦10,000. No flat ₦25 platform fee.
 * Ticket prices and the 5% ticket service fee stay naira and are separate.
 */
export const BU_NAIRA_VALUE = 1
export const BU_NAIRA_BUY = 1.05
export const BU_NAIRA_BUY_MAX = 1.08
export const BU_MIN_PURCHASE = 2000
export const BU_MIN_SPRAY = 200
export const BU_MIN_TRANSFER = 1
export const BU_MIN_WITHDRAW = 100
/** @deprecated Flat withdraw platform fee removed; kept for PnL fallback on old rows. */
export const BU_WITHDRAW_PLATFORM_FEE = 0
export const BU_VTU_MARKUP = 1.02
export const BU_SPRAY_NOTES = [200, 500, 1000] as const
export const BU_BUY_PRESETS = [100, 500, 1000, 2000, 5000, 10000, 20000, 50000] as const

export const FREE_UNDER_NAIRA = 10000
export const FREE_UNDER_PER_DAY = 3
/** Bucks platform keep as percent points (0.05 → 0.05% → ₦5 at ₦10,000). */
export const PLATFORM_FEE_PERCENT = 0.05

export type FeeProvider = 'paystack' | 'squad'

export type PayInFeeBand = {
  partnerPercent: number
  partnerCapNaira: number | null
  platformPercent: number
}

export type PayOutFeeBand = {
  kind: 'paystack_bands' | 'percent'
  partnerPercent: number
  partnerCapNaira: number | null
  partnerFloorNaira: number | null
  platformPercent: number
  stampFromNaira: number
  stampNaira: number
}

export type BankFeePolicy = {
  freeUnderNaira: number
  freeUnderPerDay: number
  payIn: PayInFeeBand
  payOut: PayOutFeeBand
}

/** Persisted Super Admin Squad rules (+ shared free quota). */
export type SquadFeeRulesSettings = {
  free_under_naira: number
  free_under_per_day: number
  pay_in: {
    partner_percent: number
    partner_cap_naira: number | null
    platform_percent: number
  }
  pay_out: {
    partner_percent: number
    partner_cap_naira: number | null
    platform_percent: number
    stamp_from_naira: number
    stamp_naira: number
  }
}

export const DEFAULT_SQUAD_FEE_RULES: SquadFeeRulesSettings = {
  free_under_naira: FREE_UNDER_NAIRA,
  free_under_per_day: FREE_UNDER_PER_DAY,
  pay_in: {
    partner_percent: 0.25,
    partner_cap_naira: 1000,
    platform_percent: PLATFORM_FEE_PERCENT,
  },
  pay_out: {
    partner_percent: 0.1,
    partner_cap_naira: null,
    platform_percent: PLATFORM_FEE_PERCENT,
    stamp_from_naira: FREE_UNDER_NAIRA,
    stamp_naira: 50,
  },
}

export const PAYSTACK_PAY_IN: PayInFeeBand = {
  partnerPercent: 1,
  partnerCapNaira: 300,
  platformPercent: PLATFORM_FEE_PERCENT,
}

export const PAYSTACK_PAY_OUT: PayOutFeeBand = {
  kind: 'paystack_bands',
  partnerPercent: 0,
  partnerCapNaira: null,
  partnerFloorNaira: null,
  platformPercent: PLATFORM_FEE_PERCENT,
  stampFromNaira: FREE_UNDER_NAIRA,
  stampNaira: 50,
}

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
  /** Partner transfer fee (Paystack bands or Squad %). */
  paystackFee: number
  /** Stamp duty when applicable. */
  stampFee: number
  /** Bucks platform keep (0.05% when charged). */
  platformFee: number
  totalDebit: number
  totalDebitBu: number
  freeQuotaApplied: boolean
  provider: FeeProvider
}

export type PeerFeeQuote = {
  bu: number
  naira: number
  feeBu: number
  feeNaira: number
  totalDebitBu: number
  totalDebitNaira: number
}

export type PayInCreditQuote = {
  gross: number
  fee: number
  net: number
  partnerFee: number
  platformFee: number
  freeQuotaApplied: boolean
  provider: FeeProvider
}

export type BankFeeQuoteOptions = {
  provider?: FeeProvider
  freeUsedToday?: number
  freeUnderNaira?: number
  freeUnderPerDay?: number
  squadRules?: SquadFeeRulesSettings | null
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

export function normalizeSquadFeeRules(raw: unknown): SquadFeeRulesSettings {
  const base = DEFAULT_SQUAD_FEE_RULES
  if (!raw || typeof raw !== 'object') return { ...base, pay_in: { ...base.pay_in }, pay_out: { ...base.pay_out } }
  const obj = raw as Record<string, unknown>
  const payIn = (obj.pay_in && typeof obj.pay_in === 'object' ? obj.pay_in : {}) as Record<string, unknown>
  const payOut = (obj.pay_out && typeof obj.pay_out === 'object' ? obj.pay_out : {}) as Record<string, unknown>
  const num = (value: unknown, fallback: number) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  const nullableNum = (value: unknown, fallback: number | null) => {
    if (value === null || value === undefined || value === '') return fallback
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  return {
    free_under_naira: Math.max(0, num(obj.free_under_naira, base.free_under_naira)),
    free_under_per_day: Math.max(0, Math.floor(num(obj.free_under_per_day, base.free_under_per_day))),
    pay_in: {
      partner_percent: Math.max(0, num(payIn.partner_percent, base.pay_in.partner_percent)),
      partner_cap_naira: nullableNum(payIn.partner_cap_naira, base.pay_in.partner_cap_naira),
      platform_percent: Math.max(0, num(payIn.platform_percent, base.pay_in.platform_percent)),
    },
    pay_out: {
      partner_percent: Math.max(0, num(payOut.partner_percent, base.pay_out.partner_percent)),
      partner_cap_naira: nullableNum(payOut.partner_cap_naira, base.pay_out.partner_cap_naira),
      platform_percent: Math.max(0, num(payOut.platform_percent, base.pay_out.platform_percent)),
      stamp_from_naira: Math.max(0, num(payOut.stamp_from_naira, base.pay_out.stamp_from_naira)),
      stamp_naira: Math.max(0, num(payOut.stamp_naira, base.pay_out.stamp_naira)),
    },
  }
}

export function policyForProvider(
  provider: FeeProvider,
  squadRules?: SquadFeeRulesSettings | null,
): BankFeePolicy {
  const squad = normalizeSquadFeeRules(squadRules ?? DEFAULT_SQUAD_FEE_RULES)
  if (provider === 'squad') {
    return {
      freeUnderNaira: squad.free_under_naira,
      freeUnderPerDay: squad.free_under_per_day,
      payIn: {
        partnerPercent: squad.pay_in.partner_percent,
        partnerCapNaira: squad.pay_in.partner_cap_naira,
        platformPercent: squad.pay_in.platform_percent,
      },
      payOut: {
        kind: 'percent',
        partnerPercent: squad.pay_out.partner_percent,
        partnerCapNaira: squad.pay_out.partner_cap_naira,
        partnerFloorNaira: null,
        platformPercent: squad.pay_out.platform_percent,
        stampFromNaira: squad.pay_out.stamp_from_naira,
        stampNaira: squad.pay_out.stamp_naira,
      },
    }
  }
  return {
    freeUnderNaira: squad.free_under_naira,
    freeUnderPerDay: squad.free_under_per_day,
    payIn: { ...PAYSTACK_PAY_IN },
    payOut: { ...PAYSTACK_PAY_OUT },
  }
}

function percentOf(amount: number, percentPoints: number): number {
  if (!(amount > 0) || !(percentPoints > 0)) return 0
  return roundMoney((amount * percentPoints) / 100)
}

function clampPartnerFee(raw: number, cap: number | null, floor: number | null): number {
  let fee = roundMoney(Math.max(0, raw))
  if (floor != null && Number.isFinite(floor)) fee = Math.max(floor, fee)
  if (cap != null && Number.isFinite(cap)) fee = Math.min(cap, fee)
  return roundMoney(fee)
}

/** Paystack Nigeria transfer bands (partner only, no stamp). */
export function paystackTransferPartnerFeeNaira(amountNaira: number): number {
  if (!Number.isFinite(amountNaira) || amountNaira <= 0) return 0
  if (amountNaira <= 5000) return 10
  if (amountNaira <= 50000) return 25
  return 50
}

/**
 * Paystack Nigeria Transfers API cost on merchant balance.
 * Stamp duty is government, from ₦10,000.
 */
export function paystackTransferFeeNaira(amountNaira: number): number {
  if (!Number.isFinite(amountNaira) || amountNaira <= 0) return 0
  const transfer = paystackTransferPartnerFeeNaira(amountNaira)
  const stampDuty = amountNaira >= FREE_UNDER_NAIRA ? 50 : 0
  return transfer + stampDuty
}

export function partnerPayInFeeNaira(grossNaira: number, band: PayInFeeBand): number {
  const gross = roundMoney(grossNaira)
  if (!(gross > 0)) return 0
  return clampPartnerFee(percentOf(gross, band.partnerPercent), band.partnerCapNaira, null)
}

export function partnerPayOutFeeNaira(amountNaira: number, band: PayOutFeeBand): number {
  const amount = roundMoney(amountNaira)
  if (!(amount > 0)) return 0
  if (band.kind === 'paystack_bands') return paystackTransferPartnerFeeNaira(amount)
  return clampPartnerFee(percentOf(amount, band.partnerPercent), band.partnerCapNaira, band.partnerFloorNaira)
}

export function platformKeepNaira(amountNaira: number, platformPercent: number): number {
  return percentOf(roundMoney(amountNaira), platformPercent)
}

export function isGuestChargedForBankAmount(
  amountNaira: number,
  freeUsedToday: number,
  freeUnderNaira: number,
  freeUnderPerDay: number,
): boolean {
  const amount = roundMoney(amountNaira)
  if (!(amount > 0)) return false
  if (amount + 1e-9 >= freeUnderNaira) return true
  return freeUsedToday >= freeUnderPerDay
}

export function resolveBankFeeOptions(options?: BankFeeQuoteOptions) {
  const provider: FeeProvider = options?.provider === 'squad' ? 'squad' : 'paystack'
  const policy = policyForProvider(provider, options?.squadRules)
  const freeUnderNaira = options?.freeUnderNaira ?? policy.freeUnderNaira
  const freeUnderPerDay = options?.freeUnderPerDay ?? policy.freeUnderPerDay
  const freeUsedToday = Math.max(0, Math.floor(options?.freeUsedToday ?? 0))
  return { provider, policy, freeUnderNaira, freeUnderPerDay, freeUsedToday }
}

export function quotePayInCreditNaira(grossNaira: number, options?: BankFeeQuoteOptions): PayInCreditQuote {
  const gross = roundMoney(grossNaira)
  const { provider, policy, freeUnderNaira, freeUnderPerDay, freeUsedToday } = resolveBankFeeOptions(options)
  if (!(gross > 0)) {
    return {
      gross: 0,
      fee: 0,
      net: 0,
      partnerFee: 0,
      platformFee: 0,
      freeQuotaApplied: false,
      provider,
    }
  }
  const charged = isGuestChargedForBankAmount(gross, freeUsedToday, freeUnderNaira, freeUnderPerDay)
  if (!charged) {
    return {
      gross,
      fee: 0,
      net: gross,
      partnerFee: 0,
      platformFee: 0,
      freeQuotaApplied: true,
      provider,
    }
  }
  const partnerFee = partnerPayInFeeNaira(gross, policy.payIn)
  const platformFee = platformKeepNaira(gross, policy.payIn.platformPercent)
  const fee = roundMoney(partnerFee + platformFee)
  return {
    gross,
    fee,
    net: roundMoney(Math.max(0, gross - fee)),
    partnerFee,
    platformFee,
    freeQuotaApplied: false,
    provider,
  }
}

/** @deprecated Use quotePayInCreditNaira — kept for older call sites. */
export function dvaCreditFeeNaira(grossNaira: number, options?: BankFeeQuoteOptions): number {
  return quotePayInCreditNaira(grossNaira, options).fee
}

export function dvaNetCreditNaira(
  grossNaira: number,
  options?: BankFeeQuoteOptions,
): { gross: number; fee: number; net: number } {
  const quoted = quotePayInCreditNaira(grossNaira, options)
  return { gross: quoted.gross, fee: quoted.fee, net: quoted.net }
}

export function publicBuRates(extra?: {
  free_under_used_today?: number
  free_under_remaining?: number
  payout_provider?: FeeProvider
}) {
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
    free_under_naira: FREE_UNDER_NAIRA,
    free_under_per_day: FREE_UNDER_PER_DAY,
    platform_fee_percent: PLATFORM_FEE_PERCENT,
    free_under_used_today: extra?.free_under_used_today ?? 0,
    free_under_remaining:
      extra?.free_under_remaining ?? Math.max(0, FREE_UNDER_PER_DAY - (extra?.free_under_used_today ?? 0)),
    payout_provider: extra?.payout_provider ?? 'paystack',
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

/** VTU debit (face to provider; markup kept). */
export function vtuDebitNaira(faceNaira: number): { face: number; debit: number; fee: number } {
  const face = roundMoney(faceNaira)
  const debit = roundMoney(face * BU_VTU_MARKUP)
  return { face, debit, fee: roundMoney(debit - face) }
}

/**
 * Send-to-bank quote. Bank always receives the full face amount (`bankNaira`).
 * Partner + stamp + platform are charged on top when the guest is billed.
 */
export function quoteWithdrawBu(bu: number, options?: BankFeeQuoteOptions): WithdrawQuote {
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
  const { provider, policy, freeUnderNaira, freeUnderPerDay, freeUsedToday } = resolveBankFeeOptions(options)
  const charged = isGuestChargedForBankAmount(naira, freeUsedToday, freeUnderNaira, freeUnderPerDay)
  if (!charged) {
    return {
      bu: roundedBu,
      naira,
      bankNaira: naira,
      paystackFee: 0,
      stampFee: 0,
      platformFee: 0,
      totalDebit: naira,
      totalDebitBu: roundedBu,
      freeQuotaApplied: true,
      provider,
    }
  }
  const partnerFee = partnerPayOutFeeNaira(naira, policy.payOut)
  const stampFee =
    naira + 1e-9 >= policy.payOut.stampFromNaira ? roundMoney(policy.payOut.stampNaira) : 0
  const platformFee = platformKeepNaira(naira, policy.payOut.platformPercent)
  const totalDebit = roundMoney(naira + partnerFee + stampFee + platformFee)
  return {
    bu: roundedBu,
    naira,
    bankNaira: naira,
    paystackFee: partnerFee,
    stampFee,
    platformFee,
    totalDebit,
    totalDebitBu: buFromNaira(totalDebit),
    freeQuotaApplied: false,
    provider,
  }
}

/** Preview helper for admin fee tables. */
export function previewPayInRow(
  amount: number,
  provider: FeeProvider,
  freeUsedToday: number,
  squadRules?: SquadFeeRulesSettings | null,
) {
  const quoted = quotePayInCreditNaira(amount, { provider, freeUsedToday, squadRules })
  const policy = policyForProvider(provider, squadRules)
  const partnerCost = partnerPayInFeeNaira(amount, policy.payIn)
  const bucksKeeps = quoted.freeQuotaApplied ? roundMoney(-partnerCost) : quoted.platformFee
  return {
    amount: roundMoney(amount),
    guestFee: quoted.fee,
    walletGets: quoted.net,
    partnerCost,
    bucksKeeps,
    freeQuotaApplied: quoted.freeQuotaApplied,
  }
}

export function previewPayOutRow(
  amount: number,
  provider: FeeProvider,
  freeUsedToday: number,
  squadRules?: SquadFeeRulesSettings | null,
) {
  const bu = buFromNaira(amount)
  let quoted: WithdrawQuote
  try {
    quoted = quoteWithdrawBu(bu, { provider, freeUsedToday, squadRules })
  } catch {
    return null
  }
  const policy = policyForProvider(provider, squadRules)
  const partnerCost = partnerPayOutFeeNaira(amount, policy.payOut)
  const stamp =
    amount + 1e-9 >= policy.payOut.stampFromNaira && !quoted.freeQuotaApplied
      ? policy.payOut.stampNaira
      : 0
  const partnerPlusStamp = quoted.freeQuotaApplied ? partnerCost : roundMoney(partnerCost + stamp)
  const bucksKeeps = quoted.freeQuotaApplied ? roundMoney(-partnerCost) : quoted.platformFee
  return {
    amount: roundMoney(amount),
    guestPaysOnTop: roundMoney(quoted.totalDebit - quoted.bankNaira),
    partnerPlusStamp,
    bucksKeeps,
    freeQuotaApplied: quoted.freeQuotaApplied,
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
