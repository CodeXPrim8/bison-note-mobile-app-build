import type { VtuNetworkId } from '@/lib/vtu/networks'
import type { VtuDataPlan, VtuProductKind } from '@/lib/vtu/catalog'

const AIRTIME_SERVICE: Record<VtuNetworkId, string> = {
  mtn: 'mtn',
  airtel: 'airtel',
  glo: 'glo',
  '9mobile': 'etisalat',
}

const DATA_SERVICE: Record<VtuNetworkId, string> = {
  mtn: 'mtn-data',
  airtel: 'airtel-data',
  glo: 'glo-data',
  '9mobile': 'etisalat-data',
}

export type VtpassPayResult = {
  ok: boolean
  pending: boolean
  code: string
  requestId: string
  transactionId: string | null
  status: string | null
  message: string
  raw: unknown
}

function baseUrl() {
  const raw = (process.env.VTU_API_URL || 'https://sandbox.vtpass.com/api').trim().replace(/\/+$/, '')
  return raw.endsWith('/api') ? raw : `${raw}/api`
}

function apiKey() {
  return process.env.VTU_API_KEY?.trim() || ''
}

function publicKey() {
  return process.env.VTU_PUBLIC_KEY?.trim() || ''
}

function secretKey() {
  return process.env.VTU_SECRET_KEY?.trim() || ''
}

export function isVtpassConfigured() {
  return Boolean(apiKey() && secretKey() && baseUrl())
}

/** VTpass request_id: YYYYMMDDHHmm… in Africa/Lagos. */
export function makeVtpassRequestId(suffix = '') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00'
  const prefix = `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}`
  const tail = (suffix || crypto.randomUUID().replace(/-/g, '')).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
  return `${prefix}${tail || Date.now().toString(36)}`
}

function postHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'api-key': apiKey(),
    'secret-key': secretKey(),
  }
}

function getHeaders(): HeadersInit {
  return {
    'api-key': apiKey(),
    'public-key': publicKey() || secretKey(),
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function parsePayResponse(raw: unknown, requestId: string): VtpassPayResult {
  const body = asRecord(raw) ?? {}
  const code = String(body.code ?? '')
  const content = asRecord(body.content)
  const tx = asRecord(content?.transactions) ?? asRecord(content)
  const status = tx ? String(tx.status ?? '') : null
  const transactionId = tx?.transactionId != null ? String(tx.transactionId) : null
  const message = String(body.response_description ?? body.message ?? status ?? 'VTpass response')
  const ok = code === '000'
  const pending = code === '099' || /pending/i.test(status || '') || /pending/i.test(message)
  return {
    ok,
    pending: !ok && pending,
    code,
    requestId: String(body.requestId ?? requestId),
    transactionId,
    status,
    message,
    raw,
  }
}

export async function vtpassPayAirtime(input: {
  network: VtuNetworkId
  phone: string
  amount: number
  requestId?: string
}): Promise<VtpassPayResult> {
  const requestId = input.requestId || makeVtpassRequestId('air')
  const res = await fetch(`${baseUrl()}/pay`, {
    method: 'POST',
    headers: postHeaders(),
    body: JSON.stringify({
      request_id: requestId,
      serviceID: AIRTIME_SERVICE[input.network],
      amount: input.amount,
      phone: input.phone,
    }),
  })
  const raw = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
  return parsePayResponse(raw, requestId)
}

export async function vtpassPayData(input: {
  network: VtuNetworkId
  phone: string
  variationCode: string
  amount?: number
  requestId?: string
}): Promise<VtpassPayResult> {
  const requestId = input.requestId || makeVtpassRequestId('data')
  const payload: Record<string, unknown> = {
    request_id: requestId,
    serviceID: DATA_SERVICE[input.network],
    billersCode: input.phone,
    variation_code: input.variationCode,
    phone: input.phone,
  }
  if (input.amount != null) payload.amount = input.amount
  const res = await fetch(`${baseUrl()}/pay`, {
    method: 'POST',
    headers: postHeaders(),
    body: JSON.stringify(payload),
  })
  const raw = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
  return parsePayResponse(raw, requestId)
}

type Variation = {
  variation_code: string
  name: string
  variation_amount: string
}

export async function vtpassDataPlans(network: VtuNetworkId): Promise<VtuDataPlan[]> {
  if (!isVtpassConfigured()) return []
  const serviceID = DATA_SERVICE[network]
  const res = await fetch(`${baseUrl()}/service-variations?serviceID=${encodeURIComponent(serviceID)}`, {
    method: 'GET',
    headers: getHeaders(),
    cache: 'no-store',
  })
  const raw = await res.json().catch(() => null)
  const body = asRecord(raw)
  const content = asRecord(body?.content)
  const variations = Array.isArray(content?.variations) ? (content!.variations as Variation[]) : []
  return variations
    .map((v) => {
      const naira = Math.round(Number(v.variation_amount) || 0)
      if (!v.variation_code || naira < 1) return null
      const name = String(v.name || v.variation_code)
      return {
        id: v.variation_code,
        kind: 'data' as const,
        network,
        naira,
        dataLabel: name,
        validity: '',
        label: name,
        variationCode: v.variation_code,
      } satisfies VtuDataPlan & { variationCode: string }
    })
    .filter((row): row is VtuDataPlan & { variationCode: string } => Boolean(row))
    .slice(0, 40)
}

export function vtpassServiceId(kind: VtuProductKind, network: VtuNetworkId) {
  return kind === 'airtime' ? AIRTIME_SERVICE[network] : DATA_SERVICE[network]
}
