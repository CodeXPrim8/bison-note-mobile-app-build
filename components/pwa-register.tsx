'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

export function PwaRegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    const onPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault()
      setDeferred(event)
      const dismissed = window.localStorage.getItem('bu-pwa-install-dismissed')
      if (!dismissed) setShowInstall(true)
    }

    const onInstalled = () => {
      setShowInstall(false)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setShowInstall(false)
    setDeferred(null)
  }

  function dismiss() {
    setShowInstall(false)
    try {
      window.localStorage.setItem('bu-pwa-install-dismissed', '1')
    } catch {
      /* ignore */
    }
  }

  if (!showInstall || !deferred) return null

  return (
    <div className="fixed inset-x-0 bottom-20 z-[80] px-4 md:bottom-6">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/15 bg-[#0b1733]/95 px-4 py-3 text-white shadow-[0_18px_40px_rgba(7,16,31,0.45)] backdrop-blur-xl">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold tracking-tight">Install Ƀucks</p>
          <p className="text-xs text-white/65">Add to your home screen for the full app feel.</p>
        </div>
        <button
          type="button"
          onClick={() => void install()}
          className="shrink-0 rounded-full bg-gradient-to-r from-[#2f7bff] to-[#8b5cf6] px-3.5 py-2 text-xs font-bold"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-full px-2 py-2 text-xs font-semibold text-white/55"
          aria-label="Dismiss install prompt"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
