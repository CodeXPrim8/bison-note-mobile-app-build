/** Ƀucks brand palette — midnight navy · cyber blue · cyan · purple · magenta. */
export const BU_BRAND_NAVY = '#0b1733'
export const BU_BRAND_NAVY_DEEP = '#07101f'
export const BU_BRAND_CYBER = '#2f7bff'
export const BU_BRAND_CYAN = '#22e0ff'
export const BU_BRAND_PURPLE = '#8b5cf6'
export const BU_BRAND_MAGENTA = '#ff2d95'
/** @deprecated Prefer BU_BRAND_MAGENTA / BU_BRAND_CYBER for new UI. */
export const BU_BRAND_RED = '#C41E3A'
export const BU_BRAND_DARK = BU_BRAND_NAVY_DEEP

export const BU_SITE_NAME = 'Ƀucks'
export const BU_SITE_TITLE = 'Ƀucks — The digital voucher for the night.'
export const BU_SITE_DESCRIPTION =
  'Ƀucks is a digital voucher for African parties — 1 ɃU = ₦1. Fund, send, spray, buy tickets, and redeem. Coming to App Store and Google Play.'

export const BU_CANONICAL_ORIGIN = 'https://buapp.vercel.app'

export function canonicalAppOrigin(origin?: string | null) {
  const raw = (origin ?? '').trim().replace(/\/$/, '')
  if (/bu-app\.vercel\.app/i.test(raw)) return BU_CANONICAL_ORIGIN
  return raw
}

/** Guest-facing links always go to the live Ƀucks site, never a paused Vercel alias. */
export function publicShareOrigin() {
  return BU_CANONICAL_ORIGIN
}
