'use client'

import { Button } from '@/components/ui/button'
import { canonicalAppOrigin } from '@/lib/brand'

export function EventShare({ title, slug }: { title: string; slug: string }) {
  async function share() {
    const origin = canonicalAppOrigin(window.location.origin) || window.location.origin
    const url = `${origin}/events/${slug}`
    if (navigator.share) {
      await navigator.share({ title, url, text: `Join me at ${title} on ɃU` })
      return
    }
    await navigator.clipboard.writeText(url)
    alert('Event link copied')
  }

  return (
    <Button type="button" variant="outline" onClick={share}>
      Share event
    </Button>
  )
}
