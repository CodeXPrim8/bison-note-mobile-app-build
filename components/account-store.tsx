'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { buFromNaira, nairaFromBu, roundMoney } from '@/lib/bu-rate'
import { bindAccountSnapshots, clearAccountSnapshots } from '@/lib/session-snapshot'

const CACHE_KEY = 'bu_account_snapshot_v2'
export const WALLET_PULSE_EVENT = 'bu-wallet-changed'
const PULSE_MS = 3500

type AccountSnapshot = {
  userId: string
  greetingName: string
  displayName: string
  buBalance: number | null
  nairaBalance: number | null
}

type AccountContextValue = AccountSnapshot & {
  /** Bumps only on spend/credit so RollingBalance animates once, not on remount/refresh. */
  balanceMotion: number
  applySpendBu: (bu: number, options?: { refresh?: boolean }) => void
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
  const [snapshot, setSnapshot] = useState<AccountSnapshot>(() => readCache() ?? emptySnapshot)
  const [balanceMotion, setBalanceMotion] = useState(0)

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

  const spendHoldUntil = useRef(0)

  const refreshWallet = useCallback(async () => {
    spendHoldUntil.current = 0
    try {
      // Balance only — skip history so refreshes stay fast.
      const res = await fetch('/api/wallet?history=0', { credentials: 'include', cache: 'no-store' })
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

  const applySpendBu = useCallback((bu: number, options?: { refresh?: boolean }) => {
    if (!Number.isFinite(bu) || bu <= 0) return
    const debit = nairaFromBu(bu)
    setBalanceMotion((n) => n + 1)
    setSnapshot((prev) => {
      if (prev.nairaBalance == null) return prev
      const naira = roundMoney(Math.max(0, prev.nairaBalance - debit))
      const next = { ...prev, nairaBalance: naira, buBalance: buFromNaira(naira) }
      writeCache(next)
      return next
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(WALLET_PULSE_EVENT))
    }
    if (options?.refresh === false) {
      spendHoldUntil.current = Date.now() + 8000
      return
    }
    void refreshWallet()
  }, [refreshWallet])

  const applyCreditNaira = useCallback((nairaDelta: number) => {
    if (!Number.isFinite(nairaDelta) || nairaDelta === 0) return
    setBalanceMotion((n) => n + 1)
    setSnapshot((prev) => {
      if (prev.nairaBalance == null) return prev
      const naira = roundMoney(Math.max(0, prev.nairaBalance + nairaDelta))
      const next = { ...prev, nairaBalance: naira, buBalance: buFromNaira(naira) }
      writeCache(next)
      return next
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(WALLET_PULSE_EVENT))
    }
    void refreshWallet()
  }, [refreshWallet])

  const nairaRef = useRef<number | null>(null)
  useEffect(() => {
    nairaRef.current = snapshot.nairaBalance
  }, [snapshot.nairaBalance])

  useEffect(() => {
    void refreshAccount()
    void refreshWallet()

    function onVisible() {
      if (document.visibilityState === 'visible') void refreshWallet()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshAccount, refreshWallet])

  useEffect(() => {
    if (!snapshot.userId) return
    let stopped = false
    let busy = false

    async function tick() {
      if (stopped || busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        const res = await fetch('/api/wallet/pulse', { credentials: 'include', cache: 'no-store' })
        const json = await res.json()
        const wallet = json.status ? json.data?.wallet : null
        if (!wallet) return
        const nextNaira = Number(wallet.naira_available)
        const prevNaira = nairaRef.current
        if (
          Date.now() < spendHoldUntil.current &&
          prevNaira != null &&
          Number.isFinite(nextNaira) &&
          nextNaira > prevNaira + 0.01
        ) {
          return
        }
        if (Date.now() < spendHoldUntil.current && prevNaira != null && Number.isFinite(nextNaira) && nextNaira <= prevNaira + 0.01) {
          spendHoldUntil.current = 0
        }
        ingestWallet(wallet)
        if (
          prevNaira != null &&
          Number.isFinite(nextNaira) &&
          Math.abs(nextNaira - prevNaira) >= 0.01
        ) {
          // One pulse only — a second event remounted the balance UI and looked like a double credit.
          window.dispatchEvent(
            new CustomEvent(WALLET_PULSE_EVENT, {
              detail: { prevNaira, nextNaira, delta: nextNaira - prevNaira },
            }),
          )
        }
      } catch {
        // The next tick retries.
      } finally {
        busy = false
      }
    }

    const timer = window.setInterval(() => void tick(), PULSE_MS)

    let syncBusy = false
    let syncTicks = 0
    async function syncBankTopUps() {
      if (stopped || syncBusy || document.visibilityState !== 'visible') return
      syncBusy = true
      syncTicks += 1
      try {
        await fetch('/api/wallet/virtual-account/sync', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requery: syncTicks === 1 }),
          cache: 'no-store',
        })
        await tick()
      } catch {
        // Next interval retries.
      } finally {
        syncBusy = false
      }
    }
    void syncBankTopUps()
    const syncTimer = window.setInterval(() => void syncBankTopUps(), 12000)

    return () => {
      stopped = true
      window.clearInterval(timer)
      window.clearInterval(syncTimer)
    }
  }, [snapshot.userId, ingestWallet])

  const value = useMemo<AccountContextValue>(
    () => ({
      ...snapshot,
      balanceMotion,
      applySpendBu,
      applyCreditNaira,
      applyWallet: ingestWallet,
      refreshWallet,
      refreshAccount,
    }),
    [snapshot, balanceMotion, applySpendBu, applyCreditNaira, ingestWallet, refreshWallet, refreshAccount],
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

/** Run when the signed-in balance changes without a manual refresh. */
export function useWalletPulse(onChange: () => void) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    function run() {
      onChangeRef.current()
    }
    window.addEventListener(WALLET_PULSE_EVENT, run)
    return () => window.removeEventListener(WALLET_PULSE_EVENT, run)
  }, [])
}
