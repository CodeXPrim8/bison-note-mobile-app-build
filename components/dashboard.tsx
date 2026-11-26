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
  QrCode,
  Smartphone,
  Ticket,
  Wifi,
} from 'lucide-react'
import { SprayCash } from '@/components/icons/spray-cash'
import { useAccount, useWalletPulse } from '@/components/account-store'
import { buFromNaira, formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { displayBuId } from '@/lib/phone'
import { historyLabel, walletDirection } from '@/lib/wallet/direction'
import { cacheAlertsFromWallet, countUnseenAlerts } from '@/components/notifications'
import { AdSlot } from '@/components/web/ad-slot'
import { RollingBalance } from '@/components/rolling-balance'
import { GiftPopup } from '@/components/gift-popup'
import { PurposeIcon } from '@/components/icons/purpose-icons'
import { purposeLabel, type PurposeGift } from '@/lib/purpose'
import { SignedBu } from '@/components/signed-bu'
import { SmartCampaign } from '@/components/smart-campaign'

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

/** Static local ɃU ID for display — always keep the leading 0. */
function formatStaticBuId(phone: string) {
  const digits = phone.replace(/\D/g, '')
  const local = displayBuId(digits)
  if (/^0\d{10}$/.test(local)) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  }
  if (/^\d{10}$/.test(local)) {
    return `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
  }
  return local || 'Your number'
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
  const { greetingName, buBalance, nairaBalance, userId, balanceMotion } = useAccount()
  const [movements, setMovements] = useState<HomeMovement[]>([])
  const [buId, setBuId] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [alertNeon, setAlertNeon] = useState(false)
  const [neonKey, setNeonKey] = useState(0)
  const [gifts, setGifts] = useState<PurposeGift[]>([])
  function applyWalletPayload(transactions: Array<Record<string, unknown>>) {
    cacheAlertsFromWallet(transactions)
    const nextUnread = countUnseenAlerts(transactions)
    setUnreadAlerts((prev) => {
      if (nextUnread > prev) {
        setAlertNeon(true)
        setNeonKey((key) => key + 1)
      }
      return nextUnread
    })
    setMovements(transactions.slice(0, 1).map(movementFromWallet))
  }

  useEffect(() => {
    if (!userId) return
    void fetch('/api/purpose-gifts', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json.status) setGifts((json.data?.gifts ?? []) as PurposeGift[])
      })
      .catch(() => undefined)
  }, [userId, balanceMotion])

  function spendGift(gift: PurposeGift) {
    window.sessionStorage.setItem('bu_spend_gift', JSON.stringify(gift))
    onNavigate('send-bu')
  }

  useEffect(() => {
    if (!alertNeon) return
    const timer = window.setTimeout(() => setAlertNeon(false), 5000)
    return () => window.clearTimeout(timer)
  }, [alertNeon, neonKey])


  useWalletPulse(() => {
    if (!userId) return
    fetch('/api/wallet?history=1&limit=12&lite=1', { credentials: 'include', cache: 'no-store' })
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
    // Warm the notifications chunk so opening the bell feels instant.
    void import('@/components/notifications')
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        const profile = json.data?.profile as { phone_e164?: string; phone?: string; avatar_url?: string } | null
        setBuId(String(profile?.phone_e164 || profile?.phone || ''))
        setAvatarUrl(String(profile?.avatar_url || ''))
      })
      .catch(() => undefined)
    fetch('/api/wallet?history=1&limit=12&lite=1', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setUnreadAlerts(0)
          return
        }
        applyWalletPayload((json.data?.transactions ?? []) as Array<Record<string, unknown>>)
      })
      .catch(() => setUnreadAlerts(0))
  }, [userId])

  const initial = (greetingName || 'B').slice(0, 1).toUpperCase()
  const latest = movements[0] ?? null

  return (
    <div className="space-y-6 bg-transparent pb-4 text-neutral-950">
      <div className="sticky top-0 z-30 bg-transparent px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="relative">
        {alertNeon ? (
          <div key={neonKey} className="bu-wallet-neon-ring" aria-hidden>
            <div className="bu-wallet-neon-spin" />
          </div>
        ) : null}
        <div className="bu-wallet-hero relative z-[1] text-white">
          <div className="px-5 pb-5 pt-5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="bu-press bu-glass-dark flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
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
                className="bu-press bu-glass-dark relative flex h-10 w-10 items-center justify-center rounded-full"
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadAlerts > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px] text-white"
                    style={{ background: 'var(--bu-magenta)' }}
                  >
                    {unreadAlerts > 9 ? '9+' : unreadAlerts}
                  </span>
                ) : null}
              </button>
            </div>

            <div className="mt-6 flex flex-col items-center">
              <span className="bu-glass-dark rounded-full px-3 py-1 text-xs font-medium">ɃU</span>
              <div className="mt-3 flex items-center gap-2">
                <RollingBalance
                  value={buBalance}
                  motionKey={balanceMotion}
                  visible={balanceVisible}
                  className="bu-balance text-4xl font-semibold tracking-tight text-white"
                />
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
              <button
                type="button"
                onClick={() => onNavigate('pos-pay')}
                className="bu-press bu-glass-dark flex h-12 w-12 items-center justify-center rounded-full"
                aria-label="Scan QR to pay"
              >
                <QrCode className="h-5 w-5" />
              </button>
              <div className="bu-glass-dark flex items-center rounded-full">
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
                className="bu-press flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'linear-gradient(160deg, #4d8fff, var(--bu-cyber))' }}
                aria-label="Fund wallet"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6">
              <p className="font-mono text-sm tracking-wide text-white/90">{formatStaticBuId(buId)}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="bu-press flex w-full items-center gap-3 border-t border-white/10 px-5 py-3.5 text-left"
            style={{ background: 'rgba(7, 16, 31, 0.72)' }}
            aria-label="Open transactions history"
          >
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <p className="truncate text-sm font-medium text-white/90">
                {latest ? latest.label : 'No transfers yet'}
              </p>
              {latest ? (
                <SignedBu
                  amountBu={buFromNaira(latest.amount)}
                  direction={latest.credit ? 'credit' : 'debit'}
                  className={`shrink-0 text-sm font-semibold ${latest.credit ? 'bu-credit' : 'bu-debit'}`}
                />
              ) : null}
            </div>
            <span className="shrink-0 text-xs font-medium text-white/55">Transactions ›</span>
          </button>
        </div>
        </div>
      </div>

      {gifts.length ? (
        <div className="space-y-2 px-4">
          {gifts.map((gift) => (
            <button
              key={gift.id}
              type="button"
              onClick={() => spendGift(gift)}
              className="bu-press bu-glass flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                <PurposeIcon purpose={gift.purpose} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  ₦{Math.round(gift.remaining_bu).toLocaleString('en-NG')} for {purposeLabel(gift.purpose).toLowerCase()}
                </span>
                <span className="block truncate text-xs text-neutral-500">From {gift.from_name || 'a friend'}</span>
              </span>
              <span className="rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white">Spend</span>
            </button>
          ))}
        </div>
      ) : null}

      <GiftPopup onSpend={spendGift} />

      <div className="bu-rise px-4" style={{ animationDelay: '80ms' }}>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: 'To Ƀucks', action: 'send-bu', Icon: ArrowUp, well: 'bu-well-cyber' },
            { label: 'Spray', action: 'spraying', Icon: SprayCash, well: 'bu-well-magenta' },
            { label: 'To Bank', action: 'redemption', Icon: Banknote, well: 'bu-well-navy' },
          ].map(({ label, action, Icon, well }) => (
            <button
              key={action}
              type="button"
              onClick={() => onNavigate(action)}
              className="bu-press bu-glass-soft flex flex-col items-center gap-1 rounded-xl px-1.5 py-2.5 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-4"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl ${well}`}
              >
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <span className="text-center text-[10px] font-semibold leading-tight sm:text-xs">{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:gap-3">
          {[
            { label: 'Airtime', page: 'airtime', Icon: Smartphone },
            { label: 'Data', page: 'data', Icon: Wifi },
          ].map(({ label, page, Icon }) => {
            const vtuOpen = process.env.NEXT_PUBLIC_VTU_ENABLED === 'true' || process.env.NEXT_PUBLIC_VTU_ENABLED === '1'
            return (
            <button
              key={label}
              type="button"
              disabled={!vtuOpen}
              onClick={() => {
                if (!vtuOpen) return
                onNavigate(page)
              }}
              className={`bu-glass-soft flex items-center gap-2 rounded-xl px-2.5 py-2 text-left sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3 ${
                vtuOpen ? 'bu-press' : 'cursor-default opacity-80'
              }`}
            >
              <span className="bu-well-navy flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl">
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold sm:text-sm">{label}</span>
                <span className="text-[10px] text-neutral-500 sm:text-[11px]">
                  {vtuOpen ? 'Buy with ɃU' : 'Coming soon'}
                </span>
              </span>
            </button>
            )
          })}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:mt-3 sm:gap-3">
          {[
            { label: 'My tickets', action: 'tickets', Icon: Ticket, well: 'bu-well-purple' },
            { label: 'Invites', action: 'invites', Icon: Mail, well: 'bu-well-cyber' },
            { label: 'Events', action: 'events', Icon: CalendarDays, well: 'bu-well-purple' },
          ].map(({ label, action, Icon, well }) => (
            <button
              key={`${action}-${label}`}
              type="button"
              onClick={() => onNavigate(action)}
              className="bu-press bu-glass-soft flex flex-col items-center gap-1 rounded-xl px-1.5 py-2.5 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-4"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl ${well}`}
              >
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <span className="text-center text-[10px] font-semibold leading-tight sm:text-[11px]">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4">
        <AdSlot slot="app_home" />
      </div>

      <SmartCampaign />
    </div>
  )
}
