function secret() {
  return process.env.BANK_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-only-bank-key-change-me!!'
}

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return bytesToBase64Url(mac)
}

async function signaturesMatch(payload: string, signature: string): Promise<boolean> {
  const expected = await sign(payload)
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

export const BU_SESSION_COOKIE = 'bu_session'

export const BU_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
}

export interface BuSession {
  id: string
  email: string | null
  display_name: string
  phone: string | null
  phone_e164: string | null
  role: string
  exp: number
}

export async function encodeBuSession(session: Omit<BuSession, 'exp'>, maxAgeSec = 60 * 60 * 24 * 30): Promise<string> {
  const body: BuSession = { ...session, exp: Date.now() + maxAgeSec * 1000 }
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(body)))
  return `${payload}.${await sign(payload)}`
}

export async function decodeBuSession(token: string | undefined | null): Promise<BuSession | null> {
  if (!token || !token.includes('.')) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature || !(await signaturesMatch(payload, signature))) return null
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(payload))
    const body = JSON.parse(json) as BuSession
    if (!body?.id || typeof body.exp !== 'number' || body.exp < Date.now()) return null
    return body
  } catch {
    return null
  }
}
