'use client';

import { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Banknote,
  Bell,
  CalendarDays,
  Eye,
  EyeOff,
  Mail,
  Plus,
  Smartphone,
  Sparkles,
  Ticket,
  Wifi,
} from 'lucide-react'
import { useAccount, useWalletPulse } from '@/components/account-store'
import { buFromNaira, formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { displayBuId } from '@/lib/phone'
import { historyLabel, walletDirection } from '@/lib/wallet/direction'
import { countUnseenAlerts } from '@/components/notifications'
import { AdSlot } from '@/components/web/ad-slot'

interface HomeMovement {
  id: string
  label: string
  amount: number
  credit: boolean
  counterparty?: string | null
}

interface DashboardProps {
  onNavigate: (page: string, data?: any) => void
}

function showBuId(phone: string) {
  const local = displayBuId(phone.replace(/\D/g, ''))
  const shown = local.startsWith('0') ? local.slice(1) : local
  if (shown.length === 10) return `${shown.slice(0, 3)} ${shown.slice(3, 6)} ${shown.slice(6)}`
  if (shown.length === 11) return `${shown.slice(0, 4)} ${shown.slice(4, 7)} ${shown.slice(7)}`
  return shown || 'Your number'
}

function movementFromWallet(tx: Record<string, unknown>, index: number): HomeMovement {
  const type = String(tx.type ?? tx.kind ?? '')
  const description = String(tx.description ?? tx.type ?? 'ɃU movement')
  const direction =
    tx.direction === 'credit' || tx.direction === 'debit'
      ? tx.direction
      : walletDirection({
          type,
          description,
          metadata: tx.metadata,
          amount: Number(tx.amount ?? 0),
        })
  const counterparty = typeof tx.counterparty === 'string' && tx.counterparty.trim() ? tx.counterparty.trim() : null
  const baseLabel = historyLabel({ type, description, direction })
  const label = counterparty
    ? direction === 'credit'
      ? `Received from ${counterparty}`
      : `Sent to ${counterparty}`
    : baseLabel
  return {
    id: String(tx.id ?? index),
    label,
    amount: Math.abs(Number(tx.amount ?? 0)),
    credit: direction === 'credit',
    counterparty,
  }
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const { greetingName, buBalance, nairaBalance, userId, refreshWallet } = useAccount()
  const [movements, setMovements] = useState<HomeMovement[]>([])
  const [buId, setBuId] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [soonNotice, setSoonNotice] = useState<string | null>(null)

  function applyWalletPayload(transactions: Array<Record<string, unknown>>) {
    setUnreadAlerts(countUnseenAlerts(transactions))
    setMovements(transactions.slice(0, 1).map(movementFromWallet))
  }

  function showComingSoon(label: string) {
    setSoonNotice(`${label} is coming soon`)
    window.setTimeout(() => setSoonNotice(null), 2200)
  }

  useWalletPulse(() => {
    if (!userId) return
    fetch('/api/wallet', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) return
        applyWalletPayload((json.data?.transactions ?? []) as Array<Record<string, unknown>>)
      })
      .catch(() => undefined)
  })

  useEffect(() => {
    if (!userId) {
      setUnreadAlerts(0)
      setMovements([])
      setBuId('')
      setAvatarUrl('')
      return
    }
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        const profile = json.data?.profile as { phone_e164?: string; phone?: string; avatar_url?: string } | null
        setBuId(String(profile?.phone_e164 || profile?.phone || ''))
        setAvatarUrl(String(profile?.avatar_url || ''))
      })
      .catch(() => undefined)
    fetch('/api/wallet', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setUnreadAlerts(0)
          return
        }
        applyWalletPayload((json.data?.transactions ?? []) as Array<Record<string, unknown>>)
      })
      .catch(() => setUnreadAlerts(0))
  }, [userId, refreshWallet])

  const initial = (greetingName || 'B').slice(0, 1).toUpperCase()
  const latest = movements[0] ?? null

  return (
    <div className="space-y-6 bg-white pb-4 text-neutral-950">
      <div className="sticky top-0 z-30 bg-white px-4 pb-3 pt-4">
        <div className="bu-rise overflow-hidden rounded-[32px] bg-neutral-950 text-white shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
          <div className="px-5 pb-5 pt-5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="bu-press flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/15 text-sm font-semibold"
                aria-label="Open profile"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </button>
              <p className="text-sm font-medium">Your Wallet</p>
              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="bu-press relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadAlerts > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-white px-1 text-center text-[10px] font-bold leading-[18px] text-neutral-950">
                    {unreadAlerts > 9 ? '9+' : unreadAlerts}
                  </span>
                ) : null}
              </button>
            </div>

            <div className="mt-6 flex flex-col items-center">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium">ɃU</span>
              <div className="mt-3 flex items-center gap-2">
                <p key={balanceVisible ? String(buBalance ?? '') : 'hidden'} className="bu-balance text-4xl font-semibold tracking-tight">
                  {balanceVisible ? (buBalance == null ? '\u00a0' : `Ƀ ${formatBu(buBalance)}`) : 'Ƀ ••••••'}
                </p>
                <button
                  type="button"
                  onClick={() => setBalanceVisible(!balanceVisible)}
                  className="rounded-full p-1 text-white/70"
                  aria-label={balanceVisible ? 'Hide balance' : 'Show balance'}
                >
                  {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-sm text-white/60">
                {balanceVisible
                  ? nairaBalance == null
                    ? '\u00a0'
                    : `≈ ₦${formatNairaPlain(nairaBalance)}`
                  : '≈ ₦••••••'}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              <div className="flex items-center rounded-full bg-white/10">
                <button
                  type="button"
                  onClick={() => onNavigate('send-bu')}
                  className="bu-press flex h-12 w-12 items-center justify-center"
                  aria-label="Send ɃU"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('receive-bu')}
                  className="bu-press flex h-12 w-12 items-center justify-center"
                  aria-label="Receive ɃU"
                >
                  <ArrowDown className="h-5 w-5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('buy-bu')}
                className="bu-press flex h-12 w-12 items-center justify-center rounded-full bg-white/10"
                aria-label="Fund wallet"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <p className="font-mono text-sm tracking-wide text-white/90">{showBuId(buId)}</p>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-neutral-950">
                  Ƀ
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('receive-bu')}
                  className="bu-press flex h-8 w-8 items-center justify-center rounded-full border border-white/20"
                  aria-label="Show receive QR"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="bu-press flex w-full items-center gap-3 border-t border-white/10 bg-black px-5 py-3.5 text-left"
            aria-label="Open transactions history"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white/90">
                {latest ? latest.label : 'No transfers yet'}
              </p>
              {latest ? (
                <p
                  className={`mt-0.5 text-sm font-semibold tabular-nums ${
                    latest.credit ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {latest.credit ? '+' : '−'}Ƀ {formatBu(buFromNaira(latest.amount))}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-xs font-medium text-white/55">Transactions ›</span>
          </button>
        </div>
      </div>

      <div className="bu-rise px-4" style={{ animationDelay: '80ms' }}>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'To Ƀucks', action: 'send-bu', Icon: ArrowUp },
            { label: 'Spray', action: 'spraying', Icon: Sparkles },
            { label: 'To Bank', action: 'redemption', Icon: Banknote },
          ].map(({ label, action, Icon }) => (
            <button
              key={action}
              type="button"
              onClick={() => onNavigate(action)}
              className="bu-press flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-4"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold">{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[
            { label: 'Airtime', Icon: Smartphone },
            { label: 'Data', Icon: Wifi },
          ].map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => showComingSoon(label)}
              className="bu-press flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="text-[11px] text-neutral-500">Coming soon</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[
            { label: 'My tickets', action: 'tickets', Icon: Ticket },
            { label: 'Invites', action: 'invites', Icon: Mail },
            { label: 'Events', action: 'events', Icon: CalendarDays },
          ].map(({ label, action, Icon }) => (
            <button
              key={`${action}-${label}`}
              type="button"
              onClick={() => onNavigate(action)}
              className="bu-press flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-4"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-800">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-center text-[11px] font-semibold leading-tight">{label}</span>
            </button>
          ))}
        </div>
        {soonNotice ? (
          <p className="mt-2 text-center text-xs font-medium text-neutral-500">{soonNotice}</p>
        ) : null}
      </div>

      <div className="px-4">
        <AdSlot slot="app_home" />
      </div>

      <div className="px-4">
        <h3 className="mb-4 text-lg font-bold">Campaign Updates</h3>
        <div className="relative h-48 overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary/60 p-4">
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <div className="text-6xl">🎉</div>
          </div>
          <div className="relative space-y-2">
            <h4 className="text-xl font-bold">Celebrate Better</h4>
            <p className="text-sm opacity-90">Send ɃU to events - Receive ceremonial notes for spraying</p>
            <div className="flex gap-2 pt-2">
              <span className="rounded-full bg-primary-foreground/30 px-3 py-1 text-xs">
                💚 Digital
              </span>
              <span className="rounded-full bg-primary-foreground/30 px-3 py-1 text-xs">
                📱 Mobile
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
