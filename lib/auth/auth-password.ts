import { createHmac } from 'node:crypto'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getBankEncryptionKey } from '@/lib/env'
import { supabasePinPassword } from '@/lib/auth/pin'
import { tryCreateAdminClient } from '@/lib/supabase/admin'

/**
 * Auth password is a server-side HMAC of the PIN.
 * The short BU-PIN form still signs in once, then it is replaced.
 * Guessing that short form from outside this server does not produce this value.
 */
export function strongPinPassword(pin: string): string {
  const mac = createHmac('sha256', getBankEncryptionKey()).update(`bu-auth-v2:${pin}`).digest('base64url')
  return `bu2.${mac}`
}

export async function signInWithPinPassword(
  supabase: SupabaseClient,
  email: string,
  pin: string,
): Promise<{ user: User | null; legacy: boolean; errorMessage: string | null }> {
  const passwords = [strongPinPassword(pin), supabasePinPassword(pin), pin]
  let lastError: string | null = null
  for (let index = 0; index < passwords.length; index += 1) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: passwords[index] })
    if (!error && data.user) return { user: data.user, legacy: index > 0, errorMessage: null }
    lastError = error?.message ?? lastError
  }
  return { user: null, legacy: false, errorMessage: lastError }
}

/** Replace a short auth password after a successful sign-in. Failure must not block the session. */
export async function upgradeStoredAuthPassword(userId: string, pin: string) {
  const admin = tryCreateAdminClient()
  if (!admin || !userId) return
  const { error } = await admin.auth.admin.updateUserById(userId, { password: strongPinPassword(pin) })
  if (error && !/user not found/i.test(error.message)) {
    console.error('auth password upgrade skipped', error.message)
  }
}
