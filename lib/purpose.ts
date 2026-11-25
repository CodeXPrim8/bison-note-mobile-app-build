export const PURPOSE_IDS = ['fuel', 'groceries', 'food', 'transport', 'pharmacy', 'hotel'] as const

export type PurposeId = (typeof PURPOSE_IDS)[number]

export type PurposeGift = {
  id: string
  from_user_id: string
  to_user_id: string
  from_name: string
  purpose: PurposeId
  locked: boolean
  amount_bu: number
  remaining_bu: number
  created_at: string
}

const LABELS: Record<PurposeId, string> = {
  fuel: 'Fuel',
  groceries: 'Groceries',
  food: 'Food',
  transport: 'Transport',
  pharmacy: 'Pharmacy',
  hotel: 'Hotel',
}

export function isPurposeId(value: unknown): value is PurposeId {
  return typeof value === 'string' && (PURPOSE_IDS as readonly string[]).includes(value)
}

export function purposeLabel(purpose: PurposeId) {
  return LABELS[purpose]
}

export function purposeSentence(purpose: PurposeId) {
  return LABELS[purpose].toLowerCase()
}

const OPENERS = ['Good news.', 'For you.', 'This is lovely.', 'A little something.', 'Look at this.']

export function giftOpener(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i) * (i + 1)) % OPENERS.length
  return OPENERS[hash] ?? OPENERS[0]
}

export function giftLine(gift: Pick<PurposeGift, 'id' | 'purpose' | 'remaining_bu' | 'from_name'>, varied = true) {
  const amount = `₦${Math.round(gift.remaining_bu).toLocaleString('en-NG')}`
  const reason = purposeSentence(gift.purpose)
  const who = gift.from_name?.trim() || 'someone'
  const body = `You have ${amount} for ${reason}, sent by ${who}.`
  if (!varied) return body
  return `${giftOpener(`${gift.id}:${Math.floor(Date.now() / 86400000)}`)} ${body}`
}
