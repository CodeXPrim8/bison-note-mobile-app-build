'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { buFromNaira, nairaFromBu, roundMoney } from '@/lib/bu-rate'
import { bindAccountSnapshots, clearAccountSnapshots } from '@/lib/session-snapshot'

const CACHE_KEY = 'bu_account_snapshot_v2'

type AccountSnapshot = {
  userId: string
  greetingName: string
  displayName: string
  buBalance: number | null
  nairaBalance: number | null
}

type AccountContextValue = AccountSnapshot & {
  applySpendBu: (bu: number) => void
  applyCreditNaira: (naira: number) => void
  applyWallet: (wallet: { bu_balance?: unknown; naira_available?: unknown }) => void
  refreshWallet: () => Promise<void>
  refreshAccount: () => Promise<void>
}

const emptySnapshot: AccountSnapshot = {
  userId: '',
  greetingName: '',
  displayName: '',
  buBalance: null,
  nairaBalance: null,
}

const AccountContext = createContext<AccountContextValue | null>(null)

function firstName(display: string | null | undefined): string {
  const value = display?.trim()
  if (!value) return ''
  return value.split(/\s+/)[0] ?? value
}

function readCache(): AccountSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AccountSnapshot>
    const greetingName = typeof parsed.greetingName === 'string' ? parsed.greetingName : ''
    const displayName = typeof parsed.displayName === 'string' ? parsed.displayName : greetingName
    const userId = typeof parsed.userId === 'string' ? parsed.userId : ''
    const buBalance = typeof parsed.buBalance === 'number' && Number.isFinite(parsed.buBalance) ? parsed.buBalance : null
    const nairaBalance =
      typeof parsed.nairaBalance === 'number' && Number.isFinite(parsed.nairaBalance) ? parsed.nairaBalance : null
    if (!userId) return null
    return { userId, greetingName, displayName, buBalance, nairaBalance }
  } catch {
    return null
  }
}

function writeCache(snapshot: AccountSnapshot) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    // Private mode can block sessionStorage.
  }
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<AccountSnapshot>(emptySnapshot)

  const ingestWallet = useCallback((wallet: { bu_balance?: unknown; naira_available?: unknown }) => {
    const naira = Number(wallet.naira_available)
    const bu = Number(wallet.bu_balance)
    if (!Number.isFinite(naira) || !Number.isFinite(bu)) return
    setSnapshot((prev) => {
      const next = { ...prev, nairaBalance: naira, buBalance: bu }
      writeCache(next)
      return next
    })
  }, [])

  const refreshWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet', { credentials: 'include' })
      const json = await res.json()
      if (!json.status || !json.data?.wallet) return
      ingestWallet(json.data.wallet)
    } catch {
      // Keep the last known balance on screen.
    }
  }, [ingestWallet])

  const refreshAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' })
      const json = await res.json()
      const userId = json.status ? String(json.data?.user?.id || '') : ''
      bindAccountSnapshots(userId || null)
      const display = (json.data?.profile?.display_name as string | undefined)?.trim()
      if (!userId) {
        clearAccountSnapshots()
        setSnapshot(emptySnapshot)
        return
      }
      const cached = readCache()
      setSnapshot((prev) => {
        const sameUser = prev.userId === userId
        const keepWallet = sameUser || !prev.userId
        const next = {
          userId,
          displayName: display || (sameUser ? prev.displayName : cached?.displayName) || '',
          greetingName: firstName(display || (sameUser ? prev.displayName : cached?.displayName) || ''),
          buBalance: keepWallet ? prev.buBalance : (cached?.userId === userId ? cached.buBalance : null),
          nairaBalance: keepWallet ? prev.nairaBalance : (cached?.userId === userId ? cached.nairaBalance : null),
        }
        writeCache(next)
        return next
      })
    } catch {
      // Wait for the next /api/me instead of showing another account.
    }
  }, [])

  const applySpendBu = useCallback((bu: number) => {
    if (!Number.isFinite(bu) || bu <= 0) return
    const debit = nairaFromBu(bu)
    setSnapshot((prev) => {
      if (prev.nairaBalance == null) return prev
      const naira = roundMoney(Math.max(0, prev.nairaBalance - debit))
      const next = { ...prev, nairaBalance: naira, buBalance: buFromNaira(naira) }
      writeCache(next)
      return next
    })
    void refreshWallet()
  }, [refreshWallet])

  const applyCreditNaira = useCallback((nairaDelta: number) => {
    if (!Number.isFinite(nairaDelta) || nairaDelta === 0) return
    setSnapshot((prev) => {
      if (prev.nairaBalance == null) return prev
      const naira = roundMoney(Math.max(0, prev.nairaBalance + nairaDelta))
      const next = { ...prev, nairaBalance: naira, buBalance: buFromNaira(naira) }
      writeCache(next)
      return next
    })
    void refreshWallet()
  }, [refreshWallet])

  useEffect(() => {
    void refreshAccount()
    void refreshWallet()

    function onVisible() {
      if (document.visibilityState === 'visible') void refreshWallet()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshAccount, refreshWallet])

  const value = useMemo<AccountContextValue>(
    () => ({
      ...snapshot,
      applySpendBu,
      applyCreditNaira,
      applyWallet: ingestWallet,
      refreshWallet,
      refreshAccount,
    }),
    [snapshot, applySpendBu, applyCreditNaira, ingestWallet, refreshWallet, refreshAccount],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount() {
  const value = useContext(AccountContext)
  if (!value) {
    throw new Error('useAccount must be used inside AccountProvider')
  }
  return value
}
