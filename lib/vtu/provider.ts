import { isVtpassConfigured } from '@/lib/vtu/vtpass'

/**
 * Public buy UI / routes. Off by default so Airtime & Data stay “Coming soon”
 * until live VTpass is ready. Set NEXT_PUBLIC_VTU_ENABLED=true to open them.
 */
export function isVtuPublicEnabled() {
  const raw = process.env.NEXT_PUBLIC_VTU_ENABLED?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

/** True when a live airtime/data provider is configured. */
export function isVtuProviderConfigured() {
  if (isVtpassConfigured()) return true
  return Boolean(process.env.VTU_API_KEY?.trim() && process.env.VTU_API_URL?.trim())
}
