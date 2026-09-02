export const AFFILIATE_QUERY = 'a'
export const AFFILIATE_STORAGE_KEY = 'bu_affiliate_code'

export function readAffiliateCodeFromSearch(search?: string | null) {
  if (!search) return ''
  try {
    const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(AFFILIATE_QUERY)
    return value?.trim() || ''
  } catch {
    return ''
  }
}

export function persistAffiliateCode(code?: string | null) {
  if (typeof window === 'undefined') return
  const trimmed = code?.trim()
  if (!trimmed) return
  try {
    sessionStorage.setItem(AFFILIATE_STORAGE_KEY, trimmed)
  } catch {
    /* ignore */
  }
}

export function currentAffiliateCode() {
  if (typeof window === 'undefined') return ''
  const fromUrl = readAffiliateCodeFromSearch(window.location.search)
  if (fromUrl) {
    persistAffiliateCode(fromUrl)
    return fromUrl
  }
  try {
    return sessionStorage.getItem(AFFILIATE_STORAGE_KEY)?.trim() || ''
  } catch {
    return ''
  }
}

export function affiliateEventPath(slug: string, code: string) {
  const clean = slug.replace(/^\//, '')
  return `/events/${clean}?${AFFILIATE_QUERY}=${encodeURIComponent(code)}`
}

export function checkoutPath(slug: string, code?: string | null) {
  const aff = code?.trim()
  return aff ? `/checkout/${slug}?${AFFILIATE_QUERY}=${encodeURIComponent(aff)}` : `/checkout/${slug}`
}
