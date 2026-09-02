const OWNER_KEY = 'bu_snapshot_owner'
const KEEP = new Set(['bu_public_events'])

function isPrivateAccountKey(key: string) {
  if (KEEP.has(key)) return false
  if (key.startsWith('bu_')) return true
  if (key.startsWith('bu-checkout-draft')) return true
  if (key === 'bu-login-draft' || key === 'bu-create-event-draft') return true
  return false
}

export function readSessionSnapshot<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeSessionSnapshot<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode can block sessionStorage.
  }
}

export function clearAccountSnapshots() {
  if (typeof window === 'undefined') return
  const remove: string[] = []
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i)
    if (!key) continue
    if (isPrivateAccountKey(key)) remove.push(key)
  }
  remove.forEach((key) => sessionStorage.removeItem(key))
}

/** Drop cached history/tickets/wallet when the signed-in ɃU ID changes. */
export function bindAccountSnapshots(userId: string | null | undefined) {
  if (typeof window === 'undefined') return
  const next = userId?.trim() || ''
  const prev = sessionStorage.getItem(OWNER_KEY) || ''
  if (!next) {
    clearAccountSnapshots()
    return
  }
  if (prev && prev !== next) clearAccountSnapshots()
  sessionStorage.setItem(OWNER_KEY, next)
}

