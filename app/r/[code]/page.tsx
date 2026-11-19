'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { BuLoader } from '@/components/bu-loader'

/** Deep link: /r/CODE → login/signup with locked referral code, or refer page if signed in. */
export default function ReferralDeepLinkPage() {
  const params = useParams<{ code: string }>()

  useEffect(() => {
    const raw = String(params?.code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 12)
    if (!raw) {
      window.location.replace('/login')
      return
    }
    window.sessionStorage.setItem('bu_referral_code', raw)
    fetch('/api/me?boot=1', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status && json.data?.user) {
          window.location.replace(`/app?page=refer&ref=${encodeURIComponent(raw)}`)
          return
        }
        window.location.replace(`/login?mode=signup&ref=${encodeURIComponent(raw)}`)
      })
      .catch(() => {
        window.location.replace(`/login?mode=signup&ref=${encodeURIComponent(raw)}`)
      })
  }, [params])

  return <BuLoader label="Opening invite…" />
}
