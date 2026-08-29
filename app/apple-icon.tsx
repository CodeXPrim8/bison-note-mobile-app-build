import { ImageResponse } from 'next/og'
import { BU_BRAND_RED } from '@/lib/brand'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BU_BRAND_RED,
          color: '#ffffff',
          fontSize: 108,
          fontWeight: 800,
          letterSpacing: -4,
        }}
      >
        Ƀ
      </div>
    ),
    { ...size },
  )
}
