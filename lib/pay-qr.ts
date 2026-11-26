import { isPurposeId, type PurposeId } from '@/lib/purpose'

export type PayQrSettlement = 'bank' | 'wallet'

export type PayQr = {
  type?: string
  vendorId?: string
  accountNumber?: string
  bankAccountNumber?: string
  bankCode?: string
  bankName?: string
  businessName?: string
  category?: PurposeId
  settlement?: PayQrSettlement
  mode?: 'business' | 'event'
  eventId?: string
}

export function parsePayQr(raw: string): PayQr | null {
  const text = raw.trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    const vendorId = String(parsed.vendor_id ?? parsed.vendorId ?? parsed.userId ?? parsed.user_id ?? '').trim()
    const accountNumber = String(
      parsed.account_number ?? parsed.phone ?? parsed.bu_id ?? parsed.username ?? '',
    )
      .replace(/[^\d]/g, '')
    const bankAccountNumber = String(parsed.bank_account_number ?? parsed.bank_account ?? '')
      .replace(/\D/g, '')
      .slice(0, 10)
    const categoryRaw = parsed.category ?? parsed.purpose
    const settlementRaw = String(parsed.settlement ?? '').toLowerCase()
    const settlement: PayQrSettlement | undefined =
      settlementRaw === 'bank' ? 'bank' : settlementRaw === 'wallet' ? 'wallet' : undefined
    const modeRaw = String(parsed.mode ?? '').toLowerCase()
    const eventId = parsed.event_id ? String(parsed.event_id) : undefined
    return {
      type: parsed.type ? String(parsed.type) : undefined,
      vendorId: vendorId || undefined,
      accountNumber: accountNumber.length >= 10 ? accountNumber : undefined,
      bankAccountNumber: bankAccountNumber.length === 10 ? bankAccountNumber : undefined,
      bankCode: parsed.bank_code ? String(parsed.bank_code) : undefined,
      bankName: parsed.bank_name ? String(parsed.bank_name) : undefined,
      businessName: parsed.business_name
        ? String(parsed.business_name)
        : parsed.label
          ? String(parsed.label)
          : undefined,
      category: isPurposeId(categoryRaw) ? categoryRaw : undefined,
      settlement,
      mode: eventId || modeRaw === 'event' ? 'event' : modeRaw === 'business' ? 'business' : undefined,
      eventId,
    }
  } catch {
    const digits = text.replace(/\D/g, '')
    if (digits.length >= 10 && digits.length <= 15) return { accountNumber: digits }
    return null
  }
}
