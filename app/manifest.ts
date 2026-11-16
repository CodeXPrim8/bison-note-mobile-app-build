import type { MetadataRoute } from 'next'
import { BU_BRAND_NAVY_DEEP, BU_SITE_DESCRIPTION, BU_SITE_NAME } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: BU_SITE_NAME,
    short_name: 'Ƀucks',
    description: BU_SITE_DESCRIPTION,
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait-primary',
    background_color: BU_BRAND_NAVY_DEEP,
    theme_color: BU_BRAND_NAVY_DEEP,
    lang: 'en-NG',
    dir: 'ltr',
    categories: ['finance', 'lifestyle', 'utilities'],
    prefer_related_applications: false,
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
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Open wallet',
        short_name: 'Wallet',
        description: 'Open your Ƀucks wallet',
        url: '/app',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Events',
        short_name: 'Events',
        description: 'Browse events and tickets',
        url: '/events',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  }
}
