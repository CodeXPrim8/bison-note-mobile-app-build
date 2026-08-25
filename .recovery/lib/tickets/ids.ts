import { randomBytes } from 'crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateCheckinCode(length = 6): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return out
}

export function generateReference(prefix = 'BU'): string {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = randomBytes(4).toString('hex').toUpperCase()
  return `${prefix}_${stamp}${rand}`
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
  const suffix = randomBytes(3).toString('hex')
  return `${base || 'event'}-${suffix}`
}

export function uniquePublicKey(live = true): string {
  const env = live ? 'live' : 'test'
  return `pk_${env}_${randomBytes(18).toString('hex')}`
}

export function uniqueSecretKey(live = true): string {
  const env = live ? 'live' : 'test'
  return `sk_${env}_${randomBytes(24).toString('hex')}`
}
