import { handleRouteError, successResponse } from '@/lib/api/errors'
import { createDataClient } from '@/lib/supabase/data'
import { AD_SLOTS } from '@/lib/admin/ad-slots'

export async function GET(request: Request) {
  try {
    const slot = new URL(request.url).searchParams.get('slot')?.trim()
    const allowed = new Set(AD_SLOTS.map((item) => item.id))
    if (!slot || !allowed.has(slot as (typeof AD_SLOTS)[number]['id'])) {
      return successResponse({ ads: [] })
    }
    const db = createDataClient()
    const { data, error } = await db
      .from('bu_ads')
      .select('id, slot, title, body, image_url, href')
      .eq('slot', slot)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .limit(6)
    if (error) return successResponse({ ads: [] })
    return successResponse({ ads: data ?? [] })
  } catch (error) {
    return handleRouteError(error)
  }
}
