import { randomUUID } from 'crypto'
import { ApiError } from '@/lib/api/errors'
import { isPurposeId, type PurposeGift, type PurposeId } from '@/lib/purpose'
import { listScanValues, readScanValue, writeScanValue } from '@/lib/scan-store'
import { getVendorProfile } from '@/lib/vendor-profile'

function giftKey(id: string) {
  return `scan_gift:${id}`
}

function asGift(row: Record<string, unknown>): PurposeGift | null {
  if (!isPurposeId(row.purpose)) return null
  return {
    id: String(row.id),
    from_user_id: String(row.from_user_id),
    to_user_id: String(row.to_user_id),
    from_name: String(row.from_name ?? ''),
    purpose: row.purpose,
    locked: Boolean(row.locked),
    amount_bu: Number(row.amount_bu ?? 0),
    remaining_bu: Number(row.remaining_bu ?? 0),
    created_at: String(row.created_at ?? ''),
  }
}

export async function listOpenGifts(userId: string) {
  const rows = await listScanValues<Record<string, unknown>>('scan_gift:')
  return rows
    .map((row) => asGift(row.value))
    .filter((row): row is PurposeGift => Boolean(row && row.locked && row.to_user_id === userId && row.remaining_bu > 0))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

export async function lockedHoldBu(userId: string) {
  const gifts = await listOpenGifts(userId)
  return gifts.reduce((sum, gift) => sum + gift.remaining_bu, 0)
}

export async function createLockedGift(input: {
  fromUserId: string
  toUserId: string
  fromName: string
  purpose: PurposeId
  amountBu: number
}) {
  const gift: PurposeGift = {
    id: randomUUID(),
    from_user_id: input.fromUserId,
    to_user_id: input.toUserId,
    from_name: input.fromName,
    purpose: input.purpose,
    locked: true,
    amount_bu: input.amountBu,
    remaining_bu: input.amountBu,
    created_at: new Date().toISOString(),
  }
  await writeScanValue(giftKey(gift.id), gift)
  return gift
}

export async function assertLockedGift(input: { giftId: string; spenderId: string; vendorId: string; amountBu: number }) {
  const data = await readScanValue<Record<string, unknown>>(giftKey(input.giftId))
  const gift = asGift(data ?? {})
  if (!gift || gift.to_user_id !== input.spenderId) {
    throw new ApiError(404, 'GIFT_NOT_FOUND', 'That gift is not on this account.')
  }
  if (input.amountBu + 1e-9 > gift.remaining_bu) {
    throw new ApiError(400, 'GIFT_TOO_SMALL', `Only ₦${gift.remaining_bu.toLocaleString('en-NG')} is left for ${gift.purpose}.`)
  }
  const vendor = await getVendorProfile(input.vendorId)
  if (vendor.category && vendor.category !== gift.purpose) {
    throw new ApiError(
      400,
      'GIFT_PLACE',
      `This money is for ${gift.purpose}. This QR is a ${vendor.category} place.`,
    )
  }
  if (!vendor.category) {
    throw new ApiError(400, 'GIFT_PLACE', 'This business has not set what they sell, so locked money cannot be spent here yet.')
  }
  return gift
}

export async function commitLockedGift(giftId: string, amountBu: number) {
  const data = await readScanValue<Record<string, unknown>>(giftKey(giftId))
  const gift = asGift(data ?? {})
  if (!gift) throw new ApiError(404, 'GIFT_NOT_FOUND', 'That gift is not on this account.')
  const remaining = Math.max(0, gift.remaining_bu - amountBu)
  const updated = { ...gift, remaining_bu: remaining }
  await writeScanValue(giftKey(gift.id), updated)
  return updated
}
