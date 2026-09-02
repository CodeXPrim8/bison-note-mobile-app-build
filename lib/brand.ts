/** ɃU brand mark — burgundy used on the site header and event CTAs. */
export const BU_BRAND_RED = '#C41E3A'
export const BU_BRAND_DARK = '#111111'

export const BU_SITE_NAME = 'ɃU'
export const BU_SITE_TITLE = 'ɃU — Create Events. Sell Tickets. Celebrate.'
export const BU_SITE_DESCRIPTION =
  'ɃU is the event, ticketing and celebration wallet for African parties. Public events, private invites, Paystack checkout, and QR check-in.'

export const BU_CANONICAL_ORIGIN = 'https://buapp.vercel.app'

export function canonicalAppOrigin(origin?: string | null) {
  const raw = (origin ?? '').trim().replace(/\/$/, '')
  if (/^https?:\/\/bu-app\.vercel\.app$/i.test(raw)) return BU_CANONICAL_ORIGIN
  return raw
}
