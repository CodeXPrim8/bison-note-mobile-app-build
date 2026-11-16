import type { MetadataRoute } from 'next'
import { BU_BRAND_NAVY_DEEP, BU_SITE_DESCRIPTION, BU_SITE_NAME } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BU_SITE_NAME,
    short_name: 'Ƀucks',
    description: BU_SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: BU_BRAND_NAVY_DEEP,
    theme_color: BU_BRAND_NAVY_DEEP,
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
