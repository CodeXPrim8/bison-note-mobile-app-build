/** Accept raw UUID, slug, organiser/public event URL, or vendor-join JSON. */
export function normalizeEventRef(raw: string): string {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  const uuidInPath =
    text.match(/\/(?:organizer\/)?events\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i) ||
    text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)
  if (uuidInPath?.[1]) return uuidInPath[1]
  const slugInPath = text.match(/\/events\/([^/?#]+)/i)
  if (slugInPath?.[1] && slugInPath[1] !== 'create') return decodeURIComponent(slugInPath[1])
  try {
    const parsed = JSON.parse(text) as { event_id?: string; eventId?: string; type?: string }
    if (parsed?.event_id || parsed?.eventId) return String(parsed.event_id || parsed.eventId)
  } catch {
    // plain text
  }
  return text.replace(/^["']|["']$/g, '')
}
