import { z } from 'zod'

export const pinSchema = z
  .string()
  .regex(/^\d{4,6}$/, 'PIN must be 4–6 digits')

/** Supabase requires 6+ character passwords; PIN stays 4–6 digits in the UI. */
export function supabasePinPassword(pin: string): string {
  return `BU-PIN-${pin}`
}

/** Auth identity is always derived from the ɃU ID so phone + PIN can sign in without a service-role lookup. */
export function authEmailFromBuId(phoneE164: string): string {
  return `bu${phoneE164}@bu.app`
}

export function authEmailsFromBuId(phoneE164: string): string[] {
  return [`bu${phoneE164}@bu.app`, `bu${phoneE164}@gmail.com`, `bu${phoneE164}@id.bu.app`]
}

export function isSyntheticBuAuthEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const value = email.trim().toLowerCase()
  return /@bu\.app$/.test(value) || /@id\.bu\.app$/.test(value) || /^bu[\d+]+@gmail\.com$/.test(value)
}

export function contactEmail(email: string | null | undefined): string | null {
  if (!email?.trim()) return null
  const value = email.trim().toLowerCase()
  if (!value.includes('@') || isSyntheticBuAuthEmail(value)) return null
  return value
}

export function accountEmailFromPhone(phoneE164: string, email?: string | null): string {
  if (email && email.includes('@')) return email.trim().toLowerCase()
  return authEmailFromBuId(phoneE164)
}
