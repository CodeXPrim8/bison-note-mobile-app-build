'use client'

import { useEffect } from 'react'
import { persistAffiliateCode, readAffiliateCodeFromSearch } from '@/lib/affiliate/track'

export function AffiliateCapture() {
  useEffect(() => {
    persistAffiliateCode(readAffiliateCodeFromSearch(window.location.search))
  }, [])
  return null
}
