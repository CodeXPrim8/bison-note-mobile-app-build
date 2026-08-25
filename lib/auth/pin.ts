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

export function accountEmailFromPhone(phoneE164: string, email?: string | null): string {
  if (email && email.includes('@')) return email.trim().toLowerCase()
  return authEmailFromBuId(phoneE164)
}
