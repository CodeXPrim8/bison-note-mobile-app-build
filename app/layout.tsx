import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { BU_SITE_DESCRIPTION, BU_SITE_NAME, BU_SITE_TITLE } from '@/lib/brand'
import { getAppUrl } from '@/lib/env'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

function siteUrl() {
  return getAppUrl()
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: BU_SITE_TITLE,
  description: BU_SITE_DESCRIPTION,
  applicationName: BU_SITE_NAME,
  appleWebApp: {
    capable: true,
    title: BU_SITE_NAME,
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/apple-icon.png', type: 'image/png', sizes: '180x180' },
      { url: '/icon', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    siteName: BU_SITE_NAME,
    title: BU_SITE_TITLE,
    description: BU_SITE_DESCRIPTION,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: BU_SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: BU_SITE_TITLE,
    description: BU_SITE_DESCRIPTION,
    images: ['/og.png'],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#ffffff' },
  ],
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="theme-pink" style={{ backgroundColor: '#ffffff' }}>
      <body
        className={`${geist.className} ${geistMono.variable} font-sans antialiased`}
        style={{ backgroundColor: '#ffffff' }}
      >
        {children}
        <Analytics />
      </body>
    </html>
  )
}
