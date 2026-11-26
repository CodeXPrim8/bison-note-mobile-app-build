import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { pinMatches, upgradeWeakPinHash, verifyLegacyBuPin } from '@/lib/auth/legacy-login'
import { assertPinOpen, clearPinFailures, notePinFailure, pinAttemptKeys } from '@/lib/auth/pin-attempts'

/**
 * Fast transaction PIN check for an already-signed-in user.
 * Prefer primary-key lookup by user id (one round trip) before phone scan.
 */
export async function verifySessionPin(input: {
  userId: string
  phone?: string | null
  pin: string
}): Promise<{ ok: true } | { wrongPin: true } | { pinNotSet: true }> {
  const pin = String(input.pin || '').replace(/\D/g, '')
  const keys = pinAttemptKeys({ userId: input.userId, phone: input.phone })
  if (keys.length) await assertPinOpen(keys)
  if (!/^\d{4,6}$/.test(pin)) {
    if (keys.length) await notePinFailure(keys)
    return { wrongPin: true }
  }

  const admin = tryCreateAdminClient()
  if (admin && input.userId) {
    const { data, error } = await admin.from('users').select('pin_hash').eq('id', input.userId).maybeSingle()
    if (!error && data) {
      const hash = typeof data.pin_hash === 'string' ? data.pin_hash : null
      if (!hash) return { pinNotSet: true }
      if (await pinMatches(pin, hash)) {
        if (keys.length) await clearPinFailures(keys)
        await upgradeWeakPinHash(input.userId, pin, hash)
        return { ok: true }
      }
      if (keys.length) await notePinFailure(keys)
      return { wrongPin: true }
    }
  }

  const phone = String(input.phone || '').trim()
  if (!phone) return { pinNotSet: true }

  const legacy = await verifyLegacyBuPin(phone, pin, { skipAttemptGuard: true })
  if ('session' in legacy) {
    if (keys.length) await clearPinFailures(keys)
    return { ok: true }
  }
  if ('wrongPin' in legacy) {
    if (keys.length) await notePinFailure(keys)
    return { wrongPin: true }
  }
  return { pinNotSet: true }
}
