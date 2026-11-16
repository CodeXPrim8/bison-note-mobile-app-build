import type { Metadata, Viewport } from 'next'
import { DM_Sans, Geist_Mono, Syne } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import {
  BU_BRAND_NAVY_DEEP,
  BU_SITE_DESCRIPTION,
  BU_SITE_NAME,
  BU_SITE_TITLE,
} from '@/lib/brand'
import { getAppUrl } from '@/lib/env'
import { PwaRegister } from '@/components/pwa-register'
import './globals.css'

const syne = Syne({ subsets: ['latin'], variable: '--font-bu-display', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-bu-body', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

function siteUrl() {
  return getAppUrl()
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: BU_SITE_TITLE,
  description: BU_SITE_DESCRIPTION,
  applicationName: BU_SITE_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: BU_SITE_NAME,
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-48.png', type: 'image/png', sizes: '48x48' },
      { url: '/icon-light-32x32.png', type: 'image/png', sizes: '32x32', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', type: 'image/png', sizes: '32x32', media: '(prefers-color-scheme: dark)' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
    shortcut: [{ url: '/favicon.ico' }],
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
    { media: '(prefers-color-scheme: light)', color: BU_BRAND_NAVY_DEEP },
    { media: '(prefers-color-scheme: dark)', color: BU_BRAND_NAVY_DEEP },
  ],
  colorScheme: 'dark',
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
    <html
      lang="en"
      className={`${syne.variable} ${dmSans.variable}`}
      style={{ backgroundColor: BU_BRAND_NAVY_DEEP }}
    >
      <body
        className={`${dmSans.className} ${geistMono.variable} font-sans antialiased`}
        style={{ backgroundColor: BU_BRAND_NAVY_DEEP }}
      >
        {children}
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  )
}
