/** Season of love — Christmas & New Year (Africa/Lagos). Additive only. */

export const SEASON_STRIP_KEY = 'bu_season_strip_dismissed_2025'
export const SEASON_POPUP_KEY = 'bu_season_popup_seen_at'
export const SEASON_POPUP_INTERVAL_MS = 1000 * 60 * 60 * 24 * 5
export const REFER_POPUP_KEY = 'bu_refer_popup_seen_at'

export const SEASON_COPY = {
  eyebrow: 'Season of love · Season of joy',
  strip: "Distance shouldn't stop a gift. Send ɃU to anyone you love.",
  stripLockChip: 'Lock Gift · Coming soon',
  guestTitle: 'This season, love travels as ɃU',
  guestBody:
    "Can't be there in person? Send celebration money straight to their Ƀucks. Lock Gift for fuel and transport is coming soon.",
  guestCta: 'Create free wallet',
  guestSignIn: 'Already have Ƀucks? Sign in',
  memberTitle: "Someone's waiting on your joy",
  memberBody: 'Fund once. Send ɃU before the year turns. Lock Gift is coming soon.',
  memberCtaSend: 'Send ɃU',
  memberCtaFund: 'Fund wallet',
  lockChip: 'Lock Gift · Coming soon',
  lockSoonTitle: 'Lock Gift is coming soon',
  lockSoonBody:
    "Soon you'll lock ɃU for fuel, transport, food, and more. Open send works today.",
  lockSoonCta: 'Send ɃU now',
  lockSoonDismiss: 'Got it',
  campaignTitle: 'Season of love',
  campaignBody: 'Send ɃU across any distance. Lock Gift — Coming soon.',
} as const

function lagosParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(now)
  return {
    month: Number(parts.find((p) => p.type === 'month')?.value ?? 1),
    day: Number(parts.find((p) => p.type === 'day')?.value ?? 1),
  }
}

export function isSeasonActive(now = new Date()) {
  const { month, day } = lagosParts(now)
  return (month === 12 && day >= 1) || (month === 1 && day <= 7)
}

export function isSeasonPreview() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const value = params.get('seasonPreview') ?? params.get('preview_season')
  if (value == null) return params.has('seasonPreview') || params.has('preview_season')
  return value === '' || value === '1' || value.toLowerCase() === 'true'
}

export function shouldShowSeason(now = new Date()) {
  if (typeof window !== 'undefined' && isSeasonPreview()) return true
  return isSeasonActive(now)
}

export function wasReferPopupShownRecently(withinMs = 1000 * 60 * 30) {
  if (typeof window === 'undefined') return false
  const last = Number(window.localStorage.getItem(REFER_POPUP_KEY) || 0)
  return Number.isFinite(last) && last > 0 && Date.now() - last < withinMs
}
