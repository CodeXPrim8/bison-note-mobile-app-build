import { BU_CANONICAL_ORIGIN, canonicalAppOrigin } from '@/lib/brand'

export class MissingEnvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingEnvError'
  }
}

function optional(name: string): string | undefined {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

function requiredPublic(name: string): string {
  const value = optional(name)
  if (!value) {
    throw new MissingEnvError(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getAppUrl(): string {
  const explicit = optional('NEXT_PUBLIC_APP_URL')
  if (process.env.VERCEL && (!explicit || /localhost|127\.0\.0\.1|bu-app\.vercel\.app/i.test(explicit))) {
    return BU_CANONICAL_ORIGIN
  }
  if (explicit) return canonicalAppOrigin(explicit) || explicit.replace(/\/$/, '')
  return 'http://localhost:3000'
}

function isLegacyServiceRoleJwt(value: string | undefined): boolean {
  return Boolean(value && value.startsWith('eyJ') && value.split('.').length >= 3 && value.length > 80)
}

/** New Supabase secret keys (`sb_secret_…`) or legacy `service_role` JWTs. */
function isServiceRoleSecret(value: string | undefined): boolean {
  if (!value) return false
  if (value.startsWith('sb_secret_') && value.length > 20) return true
  return isLegacyServiceRoleJwt(value)
}

function resolveServiceRoleKey(): string | undefined {
  return optional('SUPABASE_SERVICE_ROLE_KEY') ?? optional('SUPABASE_SECRET_KEY')
}

export function isSupabaseConfigured(): boolean {
  return Boolean(optional('NEXT_PUBLIC_SUPABASE_URL') && optional('NEXT_PUBLIC_SUPABASE_ANON_KEY'))
}

export function getSupabasePublicConfig() {
  return {
    url: requiredPublic('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requiredPublic('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

export function isServiceRoleConfigured(): boolean {
  return isServiceRoleSecret(resolveServiceRoleKey())
}

export function getServiceRoleKey(): string {
  const key = resolveServiceRoleKey()
  if (!key || !isServiceRoleSecret(key)) {
    throw new MissingEnvError(
      'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) is missing — use a sb_secret_… key or legacy service_role JWT',
    )
  }
  return key
}

export function isPaystackConfigured(): boolean {
  return Boolean(optional('PAYSTACK_SECRET_KEY'))
}

/** Squad secret for virtual-account bank-in + webhook verification. */
export function isSquadConfigured(): boolean {
  return Boolean(optional('SQUAD_SECRET_KEY')?.trim())
}

export function getSquadSecret(): string {
  const key = optional('SQUAD_SECRET_KEY')?.trim()
  if (!key) throw new MissingEnvError('Missing SQUAD_SECRET_KEY')
  return key
}

export function getSquadPublicKey(): string | undefined {
  return optional('NEXT_PUBLIC_SQUAD_PUBLIC_KEY')?.trim()
}

/**
 * Merchant GTBank NUBAN where Squad settles customer VA credits.
 * Required to create permanent customer virtual accounts.
 */
export function getSquadBeneficiaryAccount(): string | undefined {
  const digits = optional('SQUAD_BENEFICIARY_ACCOUNT')?.replace(/\D/g, '') ?? ''
  return digits.length === 10 ? digits : undefined
}

/** Prefer Squad for bank-in when secret + beneficiary are set (Paystack remains for cards/payouts). */
export function isSquadBankInEnabled(): boolean {
  return isSquadConfigured() && Boolean(getSquadBeneficiaryAccount())
}

export function getSquadApiBase(): string {
  const key = optional('SQUAD_SECRET_KEY')?.trim() ?? ''
  if (key.startsWith('sandbox_')) return 'https://sandbox-api-d.squadco.com'
  const explicit = optional('SQUAD_API_BASE')?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  return 'https://api-d.squadco.com'
}

function paystackSecretKind(key: string): 'live' | 'test' | 'unknown' {
  if (key.startsWith('sk_live_')) return 'live'
  if (key.startsWith('sk_test_')) return 'test'
  return 'unknown'
}

export function getPaystackSecret(): string {
  const key = optional('PAYSTACK_SECRET_KEY')?.trim()
  if (!key) {
    throw new Error('Settlement is not configured')
  }
  if (process.env.VERCEL_ENV === 'production' && paystackSecretKind(key) === 'test') {
    throw new Error(
      'Test settlement keys cannot take live charges. Set PAYSTACK_SECRET_KEY on Vercel to the live secret (sk_live_).',
    )
  }
  return key
}

export function getPaystackPublicKey(): string | undefined {
  return optional('NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY')
}

export function getPaystackWebhookSecret(): string {
  return optional('PAYSTACK_WEBHOOK_SECRET') ?? getPaystackSecret()
}

/** Paystack Dedicated Virtual Account preferred bank slug (wema-bank, titan-paystack, test-bank). */
export function getPaystackDvaPreferredBank(): string {
  const explicit = optional('PAYSTACK_DVA_PREFERRED_BANK')?.trim()
  if (explicit) return explicit
  const key = optional('PAYSTACK_SECRET_KEY')?.trim() ?? ''
  if (key.startsWith('sk_test_')) return 'test-bank'
  return 'wema-bank'
}

export function isResendConfigured(): boolean {
  return Boolean(optional('RESEND_API_KEY'))
}

export function getResendConfig() {
  return {
    apiKey: optional('RESEND_API_KEY')?.trim(),
    from: optional('RESEND_FROM')?.trim() || 'Bucks <onboarding@resend.dev>',
  }
}

export function getBankEncryptionKey(): string {
  return optional('BANK_ENCRYPTION_KEY') ?? optional('JWT_SECRET') ?? 'dev-only-bank-key-change-me!!'
}

export function getCronSecret(): string | undefined {
  return optional('CRON_SECRET')
}

export const SERVICE_FEE_RATE = 0.05
