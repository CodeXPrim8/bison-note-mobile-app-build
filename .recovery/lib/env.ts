function optional(name: string): string | undefined {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

function requiredPublic(name: string): string {
  const value = optional(name)
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getAppUrl(): string {
  return optional('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3001'
}

export function getSupabasePublicConfig() {
  return {
    url: requiredPublic('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requiredPublic('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

export function getServiceRoleKey(): string {
  const key = optional('SUPABASE_SERVICE_ROLE_KEY')
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  }
  return key
}

export function isPaystackConfigured(): boolean {
  return Boolean(optional('PAYSTACK_SECRET_KEY'))
}

export function getPaystackSecret(): string {
  const key = optional('PAYSTACK_SECRET_KEY')
  if (!key) {
    throw new Error('Paystack is not configured')
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
