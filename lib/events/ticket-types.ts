import type { TicketTier } from '@/lib/types/database'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const LIVE_TIER_ID_RE = new RegExp(`^(${UUID}):([a-z0-9_-]{1,40})$`, 'i')
export const EVENT_FORM_SIDECAR_KEY = '_form'

export type StoredTicketType = {
  key: string
  name: string
  price: number
  quantity_total: number
  quantity_sold: number
}

export function liveTierId(eventId: string, key = 'general') {
  return `${eventId}:${key}`
}

export function parseLiveTierId(tierId: string): string | null {
  const match = LIVE_TIER_ID_RE.exec(tierId)
  return match?.[1] ?? null
}

export function parseLiveTierKey(tierId: string): string {
  const match = LIVE_TIER_ID_RE.exec(tierId)
  return match?.[2] ?? 'general'
}

export function ticketTypeKey(name: string, used: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 32) || 'ticket'
  let key = base
  let n = 2
  while (used.has(key)) {
    key = `${base}_${n}`
    n += 1
  }
  used.add(key)
  return key
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function parseStoredTicketTypes(raw: unknown): StoredTicketType[] {
  let value = raw
  if (typeof value === 'string' && value.trim()) {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const used = new Set<string>()
  return value
    .map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const name = String(row.name ?? '').trim()
      const rawKey = String(row.key ?? '')
        .trim()
        .toLowerCase()
      if (rawKey === EVENT_FORM_SIDECAR_KEY || !name) return null
      const key = /^[a-z0-9_-]{1,40}$/.test(rawKey) ? rawKey : ticketTypeKey(name, used)
      if (!used.has(key)) used.add(key)
      return {
        key,
        name: name.slice(0, 80),
        price: Math.max(0, asNumber(row.price)),
        quantity_total: Math.max(0, Math.floor(asNumber(row.quantity_total))),
        quantity_sold: Math.max(0, Math.floor(asNumber(row.quantity_sold))),
      }
    })
    .filter((row): row is StoredTicketType => Boolean(row))
}

export function storedTypesFromTiers(
  tiers: Array<{
    id?: string
    name: string
    price: number
    quantity_total: number
    quantity_sold?: number
    metadata?: Record<string, unknown> | null
  }>,
): StoredTicketType[] {
  const used = new Set<string>()
  return tiers
    .map((tier) => {
      const name = String(tier.name ?? '').trim()
      if (!name) return null
      const metaKey = String(tier.metadata?.key ?? '')
        .trim()
        .toLowerCase()
      const fromId = tier.id ? parseLiveTierKey(tier.id) : ''
      const rawKey = /^[a-z0-9_-]{1,40}$/.test(metaKey) ? metaKey : fromId
      const key = /^[a-z0-9_-]{1,40}$/.test(rawKey) && !used.has(rawKey) ? rawKey : ticketTypeKey(name, used)
      if (!used.has(key)) used.add(key)
      return {
        key,
        name: name.slice(0, 80),
        price: Math.max(0, Number(tier.price) || 0),
        quantity_total: Math.max(0, Math.floor(Number(tier.quantity_total) || 0)),
        quantity_sold: Math.max(0, Math.floor(Number(tier.quantity_sold) || 0)),
      }
    })
    .filter((row): row is StoredTicketType => Boolean(row))
}

export function mergeStoredTicketTypes(
  incoming: Array<{ name: string; price: number; quantity_total: number; key?: string }>,
  existing: StoredTicketType[],
): { types: StoredTicketType[] } | { error: string } {
  const existingByKey = new Map(existing.map((row) => [row.key, row]))
  const used = new Set<string>()
  const types: StoredTicketType[] = []
  for (const row of incoming) {
    const name = row.name.trim()
    if (!name) continue
    const rawKey = String(row.key ?? '')
      .trim()
      .toLowerCase()
    const key = /^[a-z0-9_-]{1,40}$/.test(rawKey) && !used.has(rawKey) ? rawKey : ticketTypeKey(name, used)
    if (!used.has(key)) used.add(key)
    const prev = existingByKey.get(key)
    const quantityTotal = Math.max(0, Math.floor(Number(row.quantity_total) || 0))
    const sold = prev?.quantity_sold ?? 0
    if (quantityTotal < sold) {
      return { error: `${name} already sold ${sold}. Quantity cannot be below ${sold}.` }
    }
    types.push({
      key,
      name: name.slice(0, 80),
      price: Math.max(0, Number(row.price) || 0),
      quantity_total: quantityTotal,
      quantity_sold: sold,
    })
  }
  if (!types.length) return { error: 'Name at least one ticket type and set its price.' }
  for (const prev of existing) {
    if (prev.quantity_sold > 0 && !types.some((row) => row.key === prev.key)) {
      return { error: `Cannot remove ${prev.name} because tickets have already been sold.` }
    }
  }
  return { types }
}

export function storedTypesFromInput(
  tiers: Array<{ name: string; price: number; quantity_total: number }>,
): StoredTicketType[] {
  const used = new Set<string>()
  return tiers
    .map((tier) => {
      const name = tier.name.trim()
      if (!name) return null
      return {
        key: ticketTypeKey(name, used),
        name: name.slice(0, 80),
        price: Math.max(0, Number(tier.price) || 0),
        quantity_total: Math.max(0, Math.floor(Number(tier.quantity_total) || 0)),
        quantity_sold: 0,
      }
    })
    .filter((row): row is StoredTicketType => Boolean(row))
}

export function needsNamedTicketTypesColumn(types: StoredTicketType[]) {
  if (types.length > 1) return true
  if (!types.length) return false
  return types[0].name.trim().toLowerCase() !== 'general'
}

export function ticketTiersFromStored(eventId: string, types: StoredTicketType[]): TicketTier[] {
  const now = new Date().toISOString()
  return types.map((type) => ({
    id: liveTierId(eventId, type.key),
    event_id: eventId,
    name: type.name,
    price: type.price,
    currency: 'NGN',
    quantity_total: type.quantity_total,
    quantity_sold: type.quantity_sold,
    sales_start: null,
    sales_end: null,
    is_active: true,
    description: null,
    benefits: null,
    max_per_buyer: 6,
    metadata: { key: type.key },
    created_at: now,
    updated_at: now,
  }))
}
