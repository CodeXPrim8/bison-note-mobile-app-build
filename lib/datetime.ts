function asDate(value: string | Date | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

/** Short day line for tickets: Wed 30 Sep 2026 */
export function formatEventDay(value: string | Date | null | undefined) {
  const date = asDate(value)
  if (!date) return ''
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
/** Date as 26/08/2026 */
export function formatEventDate(value: string | Date | null | undefined) {
  const date = asDate(value)
  if (!date) return ''
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Time as 5:00 PM */
export function formatEventTime(value: string | Date | null | undefined) {
  const date = asDate(value)
  if (!date) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/** Value for `<input type="datetime-local">` in the browser’s local timezone. */
export function toDatetimeLocalValue(value: string | Date | null | undefined) {
  const date = asDate(value)
  if (!date) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Date and time as 26/08/2026, 5:00 PM */
export function formatEventDateTime(value: string | Date | null | undefined) {
  const date = asDate(value)
  if (!date) return ''
  return `${formatEventDate(date)}, ${formatEventTime(date)}`
}

export function formatEventSchedule(
  start: string | Date | null | undefined,
  end?: string | Date | null,
) {
  const startText = formatEventDateTime(start)
  if (!startText) return ''
  const endText = end ? formatEventTime(end) : ''
  return endText ? `${startText} – ${endText}` : startText
}
