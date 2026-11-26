import { parsePayQr, type PayQr } from '@/lib/pay-qr'

export type BankScanPrefill = {
  bankAccountNumber: string
  bankCode: string
  bankName?: string
  businessName?: string
  vendorId?: string
}

export type PosScanRoute =
  | ({ kind: 'bank' } & BankScanPrefill)
  | { kind: 'pos'; raw: string; vendorId: string; mode: 'business' | 'event' }
  | { kind: 'not_pos' }

const BANK_SCAN_KEY = 'bu_bank_scan'

export function stashBankScan(prefill: BankScanPrefill) {
  try {
    sessionStorage.setItem(BANK_SCAN_KEY, JSON.stringify(prefill))
  } catch {
    // Private mode can block sessionStorage.
  }
}

export function takeBankScan(): BankScanPrefill | null {
  try {
    const raw = sessionStorage.getItem(BANK_SCAN_KEY)
    if (!raw) return null
    sessionStorage.removeItem(BANK_SCAN_KEY)
    const parsed = JSON.parse(raw) as Partial<BankScanPrefill>
    const bankAccountNumber = String(parsed.bankAccountNumber ?? '').replace(/\D/g, '').slice(0, 10)
    const bankCode = String(parsed.bankCode ?? '').trim()
    if (bankAccountNumber.length !== 10 || !bankCode) return null
    return {
      bankAccountNumber,
      bankCode,
      bankName: parsed.bankName ? String(parsed.bankName) : undefined,
      businessName: parsed.businessName ? String(parsed.businessName) : undefined,
      vendorId: parsed.vendorId ? String(parsed.vendorId) : undefined,
    }
  } catch {
    return null
  }
}

function isPosQr(parsed: PayQr | null, raw: string): boolean {
  if (parsed?.type === 'pos') return true
  try {
    const obj = JSON.parse(raw) as { type?: string }
    return String(obj.type ?? '') === 'pos'
  } catch {
    return false
  }
}

/**
 * Resolve a scanned POS QR into bank-send vs wallet POS.
 * Live pay-card settlement wins over stale QR fields. Event POS always stays wallet POS.
 */
export async function resolvePosScanRoute(raw: string): Promise<PosScanRoute> {
  const text = raw.trim()
  if (!text) return { kind: 'not_pos' }
  const parsed = parsePayQr(text)
  if (!isPosQr(parsed, text)) return { kind: 'not_pos' }

  const vendorId = String(parsed?.vendorId ?? '').trim()
  if (!vendorId) return { kind: 'not_pos' }

  const mode: 'business' | 'event' =
    parsed?.eventId || parsed?.mode === 'event' ? 'event' : 'business'

  // Event POS stays 90/10 wallet flow — never auto bank-send.
  if (mode === 'event') {
    return { kind: 'pos', raw: text, vendorId, mode: 'event' }
  }

  let settlement = parsed?.settlement
  let bankAccountNumber = parsed?.bankAccountNumber
  let bankCode = parsed?.bankCode
  let bankName = parsed?.bankName
  let businessName = parsed?.businessName

  try {
    const res = await fetch(`/api/vendor/pay-card?user_id=${encodeURIComponent(vendorId)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    const json = await res.json()
    if (json.status) {
      settlement = json.data?.settlement === 'bank' ? 'bank' : 'wallet'
      const liveAccount = String(json.data?.bank_account_number ?? '')
        .replace(/\D/g, '')
        .slice(0, 10)
      const liveCode = String(json.data?.bank_code ?? '').trim()
      if (liveAccount.length === 10) bankAccountNumber = liveAccount
      if (liveCode) bankCode = liveCode
      if (json.data?.bank_name) bankName = String(json.data.bank_name)
      if (json.data?.business_name) businessName = String(json.data.business_name)
    }
  } catch {
    // Fall back to QR fields.
  }

  const digits = String(bankAccountNumber ?? '')
    .replace(/\D/g, '')
    .slice(0, 10)
  const code = String(bankCode ?? '').trim()

  if (settlement === 'bank' && digits.length === 10 && code) {
    return {
      kind: 'bank',
      vendorId,
      bankAccountNumber: digits,
      bankCode: code,
      bankName: bankName || undefined,
      businessName: businessName || undefined,
    }
  }

  return { kind: 'pos', raw: text, vendorId, mode: 'business' }
}
