import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Store shell for the live Ƀucks PWA.
 * Android → .aab  |  iOS → .ipa (needs Mac + Xcode or a cloud builder)
 *
 * ASCII "Bucks" on purpose — Play/App Store and native rails break Ƀ.
 */
const config: CapacitorConfig = {
  appId: 'app.buucks.mobile',
  appName: 'Bucks',
  webDir: 'capacitor-www',
  server: {
    // Live Next.js app. Change if you move off Vercel.
    url: 'https://buapp.vercel.app',
    cleartext: false,
    allowNavigation: [
      'buapp.vercel.app',
      'bu-app.vercel.app',
      '*.paystack.com',
      'checkout.paystack.com',
      'api.paystack.co',
      'standard.paystack.co',
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#07101f',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#07101f',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#07101f',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#07101f',
    },
  },
}

export default config
