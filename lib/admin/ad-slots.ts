export const AD_SLOTS = [
  {
    id: 'web_header',
    label: 'Website header',
    surface: 'Website',
    width: 1152,
    height: 90,
    maxSeconds: 8,
    fit: 'banner',
    hint: 'Thin leaderboard under the site nav. Stays 90px tall; phones crop the sides.',
  },
  {
    id: 'web_home',
    label: 'Website homepage',
    surface: 'Website',
    width: 1152,
    height: 320,
    maxSeconds: 20,
    fit: 'box',
    hint: 'Wide homepage billboard above upcoming events.',
  },
  {
    id: 'web_events',
    label: 'Events listing',
    surface: 'Website',
    width: 1152,
    height: 250,
    maxSeconds: 20,
    fit: 'box',
    hint: 'Banner at the top of the public events list.',
  },
  {
    id: 'app_home',
    label: 'ɃU app home',
    surface: 'App',
    width: 390,
    height: 220,
    maxSeconds: 15,
    fit: 'box',
    ratio: '16:9',
    hint: 'In-app card on ɃU home. Sized for a phone screen.',
  },
  {
    id: 'app_wallet',
    label: 'ɃU wallet',
    surface: 'App',
    width: 390,
    height: 140,
    maxSeconds: 12,
    fit: 'box',
    hint: 'Compact banner under the wallet balance.',
  },
  {
    id: 'organizer_home',
    label: 'Organiser dashboard',
    surface: 'Website',
    width: 1152,
    height: 240,
    maxSeconds: 20,
    fit: 'box',
    hint: 'Banner at the top of the organiser dashboard.',
  },
] as const

export type AdSlotId = (typeof AD_SLOTS)[number]['id']
export type AdSlotSpec = (typeof AD_SLOTS)[number]

const SLOT_MAP = new Map<string, AdSlotSpec>(AD_SLOTS.map((slot) => [slot.id, slot]))

export function getAdSlot(id: string | null | undefined): AdSlotSpec | null {
  if (!id) return null
  return SLOT_MAP.get(id) ?? null
}

export function isAdSlotId(id: string): id is AdSlotId {
  return SLOT_MAP.has(id)
}

export function slotSizeLabel(slot: Pick<AdSlotSpec, 'width' | 'height'>) {
  return `${slot.width} \u00d7 ${slot.height} px`
}

export function slotRatioLabel(slot: Pick<AdSlotSpec, 'width' | 'height'> & { ratio?: string }) {
  if (slot.ratio) return slot.ratio
  const g = gcd(slot.width, slot.height)
  return `${slot.width / g}:${slot.height / g}`
}

export function retinaSize(slot: Pick<AdSlotSpec, 'width' | 'height'>) {
  return { width: slot.width * 2, height: slot.height * 2 }
}

export function adMediaKind(url: string | null | undefined): 'image' | 'video' | null {
  if (!url) return null
  const clean = url.split('?')[0]?.split('#')[0] ?? url
  if (/\.(mp4|webm|mov)$/i.test(clean)) return 'video'
  return 'image'
}

export function mediaFitsSlot(
  slot: Pick<AdSlotSpec, 'width' | 'height'>,
  width: number,
  height: number,
): { ok: true } | { ok: false; message: string } {
  if (!(width > 0) || !(height > 0)) {
    return { ok: false, message: 'Could not read the width and height of this file.' }
  }
  const need = slot.width / slot.height
  const got = width / height
  if (Math.abs(got - need) / need > 0.04) {
    return {
      ok: false,
      message: `Wrong shape. This slot is ${slotSizeLabel(slot)} (${slotRatioLabel(slot)}). Your file is ${width} \u00d7 ${height} px.`,
    }
  }
  if (width < slot.width * 0.98 || height < slot.height * 0.98) {
    return {
      ok: false,
      message: `Too small. Upload at least ${slotSizeLabel(slot)} (or ${slot.width * 2} \u00d7 ${slot.height * 2} for sharper screens). Your file is ${width} \u00d7 ${height} px.`,
    }
  }
  return { ok: true }
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(Math.round(b))
  while (y) {
    const next = x % y
    x = y
    y = next
  }
  return x || 1
}
