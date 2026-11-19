/** Client-safe referral constants (no server imports). */
export const REFERRAL_REWARD_BU = 1000
/** Friend must fund or spend at least this much ɃU before the referrer is paid. */
export const REFERRAL_QUALIFY_BU = 3000

export function normalizeReferralCode(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}
