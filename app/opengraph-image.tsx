import { ImageResponse } from 'next/og'
import { BU_BRAND_DARK, BU_BRAND_RED } from '@/lib/brand'

export const alt = 'ɃU'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: BU_BRAND_DARK,
          gap: 28,
        }}
      >
        <div
          style={{
            width: 220,
            height: 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: BU_BRAND_RED,
            borderRadius: 48,
            color: '#ffffff',
            fontSize: 140,
            fontWeight: 800,
            letterSpacing: -6,
          }}
        >
          Ƀ
        </div>
        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: 2,
          }}
        >
          ɃU
        </div>
        <div
          style={{
            display: 'flex',
            color: '#f4a5b0',
            fontSize: 28,
            fontWeight: 600,
          }}
        >
          Create Events. Sell Tickets. Celebrate.
        </div>
      </div>
    ),
    { ...size },
  )
}
