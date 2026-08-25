/**
 * ɃU ID is the phone number used at registration.
 * 08012345678, +2348012345678 and 2348012345678 all map to 2348012345678.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '')
  if (!digits) return null

  let e164 = digits
  if (digits.startsWith('00')) {
    e164 = digits.slice(2)
  }
  if (e164.startsWith('0') && e164.length === 11) {
    e164 = `234${e164.slice(1)}`
  }
  if (e164.length === 10 && /^[789]/.test(e164)) {
    e164 = `234${e164}`
  }
  if (!e164.startsWith('234') && e164.length >= 10 && e164.length <= 15) {
    return e164
  }
  if (e164.startsWith('234') && e164.length === 13) {
    return e164
  }
  if (e164.length >= 10 && e164.length <= 15) {
    return e164
  }
  return null
}

export function displayBuId(phoneE164: string): string {
  if (phoneE164.startsWith('234') && phoneE164.length === 13) {
    return `0${phoneE164.slice(3)}`
  }
  return phoneE164
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '')
  if (digits.length < 7) return '••••'
  return `${digits.slice(0, 3)}••••${digits.slice(-2)}`
}

/** Phone formats to try against the live `users.phone_number` column. */
export function phoneLookupVariants(input: string): string[] {
  const trimmed = input.trim()
  const digits = trimmed.replace(/[^\d]/g, '')
  const e164 = normalizePhone(trimmed)
  const variants = new Set<string>()
  if (trimmed) variants.add(trimmed)
  if (digits) variants.add(digits)
  if (e164) {
    variants.add(e164)
    variants.add(`+${e164}`)
    if (e164.startsWith('234') && e164.length === 13) {
      variants.add(`0${e164.slice(3)}`)
      variants.add(e164.slice(3))
      variants.add(`+234${e164.slice(3)}`)
    }
  }
  if (digits.startsWith('0') && digits.length === 11) {
    variants.add(`234${digits.slice(1)}`)
    variants.add(`+234${digits.slice(1)}`)
  }
  return [...variants]
}
