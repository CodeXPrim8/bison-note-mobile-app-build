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

function isJwtSecret(value: string | undefined): boolean {
  return Boolean(value && value.startsWith('eyJ') && value.split('.').length >= 3 && value.length > 80)
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
  return isJwtSecret(optional('SUPABASE_SERVICE_ROLE_KEY'))
}

export function getServiceRoleKey(): string {
  const key = optional('SUPABASE_SERVICE_ROLE_KEY')
  if (!key || !isJwtSecret(key)) {
    throw new MissingEnvError('SUPABASE_SERVICE_ROLE_KEY is missing or not a service_role JWT')
  }
  return key
}

export function isPaystackConfigured(): boolean {
  return Boolean(optional('PAYSTACK_SECRET_KEY'))
}

function paystackSecretKind(key: string): 'live' | 'test' | 'unknown' {
  if (key.startsWith('sk_live_')) return 'live'
  if (key.startsWith('sk_test_')) return 'test'
  return 'unknown'
}

export function getPaystackSecret(): string {
  const key = optional('PAYSTACK_SECRET_KEY')?.trim()
  if (!key) {
    throw new Error('Paystack is not configured')
  }
  if (process.env.VERCEL_ENV === 'production' && paystackSecretKind(key) === 'test') {
    throw new Error(
      'Paystack test keys cannot take live charges. Set PAYSTACK_SECRET_KEY on Vercel to the live secret (sk_live_).',
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

export function getResendConfig() {
  return {
    apiKey: optional('RESEND_API_KEY'),
    from: optional('RESEND_FROM') ?? 'Bison Note <tickets@bu.app>',
  }
}

export function getBankEncryptionKey(): string {
  return optional('BANK_ENCRYPTION_KEY') ?? optional('JWT_SECRET') ?? 'dev-only-bank-key-change-me!!'
}

export function getCronSecret(): string | undefined {
  return optional('CRON_SECRET')
}

export const SERVICE_FEE_RATE = 0.05
