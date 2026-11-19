'use client'

import type { LucideIcon } from 'lucide-react'
import { Eye, EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { RollingBalance } from '@/components/rolling-balance'

export function ModeIconTile({
  label,
  Icon,
  onClick,
  tone = 'dark',
}: {
  label: string
  Icon: LucideIcon
  onClick: () => void
  tone?: 'dark' | 'light' | 'cyber' | 'purple' | 'magenta'
}) {
  const well =
    tone === 'cyber'
      ? 'bu-well-cyber'
      : tone === 'purple'
        ? 'bu-well-purple'
        : tone === 'magenta'
          ? 'bu-well-magenta'
          : tone === 'light'
            ? 'bg-white/70 text-[color:var(--bu-navy)]'
            : 'bu-well-navy'

  return (
    <button
      type="button"
      onClick={onClick}
      className="bu-press bu-glass-soft flex flex-col items-center gap-1 rounded-xl px-1.5 py-2.5 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-4"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl ${well}`}>
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
      <span className="text-center text-[10px] font-semibold leading-tight text-neutral-950 sm:text-xs">
        {label}
      </span>
    </button>
  )
}

export function ModeIconRow({
  columns = 3,
  children,
}: {
  columns?: 2 | 3
  children: ReactNode
}) {
  return (
    <div className={`grid gap-2 sm:gap-3 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {children}
    </div>
  )
}

export function ModeWalletHero({
  title,
  balanceLabel,
  balanceValue,
  balanceMotion = 0,
  balanceVisible,
  onToggleBalance,
  subtitle,
  actions,
  footer,
  children,
}: {
  title: string
  balanceLabel?: string
  balanceValue?: number | null
  balanceMotion?: number
  balanceVisible: boolean
  onToggleBalance: () => void
  subtitle?: string
  actions?: ReactNode
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="sticky top-0 z-30 bg-transparent px-4 pb-3 pt-3 backdrop-blur-xl">
      <div className="bu-rise bu-wallet-hero text-white">
        <div className="px-5 pb-5 pt-5">
          <p className="text-center text-sm font-medium text-white/80">{title}</p>
          <div className="mt-6 flex flex-col items-center">
            <span className="bu-glass-dark rounded-full px-3 py-1 text-xs font-medium">ɃU</span>
            <div className="mt-3 flex items-center gap-2">
              {balanceValue !== undefined ? (
                <RollingBalance
                  value={balanceValue}
                  motionKey={balanceMotion}
                  visible={balanceVisible}
                  className="bu-balance text-4xl font-semibold tracking-tight text-white"
                />
              ) : (
                <p className="bu-balance text-4xl font-semibold tracking-tight">
                  {balanceVisible ? balanceLabel : 'Ƀ ••••••'}
                </p>
              )}
              <button
                type="button"
                onClick={onToggleBalance}
                className="rounded-full p-1 text-white/70"
                aria-label={balanceVisible ? 'Hide balance' : 'Show balance'}
              >
                {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            {subtitle ? (
              <p className="mt-1 text-sm text-white/60">{balanceVisible ? subtitle : '≈ ₦••••••'}</p>
            ) : null}
          </div>
          {actions ? <div className="mt-6 flex items-center justify-center gap-3">{actions}</div> : null}
          {children}
        </div>
        {footer}
      </div>
    </div>
  )
}

export function ModeHeroAction({
  label,
  Icon,
  onClick,
}: {
  label: string
  Icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bu-press bu-glass-dark flex h-12 w-12 items-center justify-center rounded-full"
      aria-label={label}
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}

export function ModeListRow({
  title,
  detail,
  amount,
  amountTone,
  badgeCount,
  onClick,
}: {
  title: string
  detail?: string
  amount?: string
  amountTone?: 'credit' | 'debit' | 'neutral'
  /** Pending notification count shown as +N on the row */
  badgeCount?: number
  onClick?: () => void
}) {
  const tone =
    amountTone === 'credit' ? 'bu-credit' : amountTone === 'debit' ? 'bu-debit' : 'text-neutral-950'
  const Comp = onClick ? 'button' : 'div'
  const badge = Number(badgeCount) > 0 ? Math.min(99, Math.floor(Number(badgeCount))) : 0
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full items-start justify-between gap-3 rounded-2xl px-4 py-3 text-left bu-glass-soft ${
        onClick ? 'bu-press' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-neutral-950">{title}</p>
          {badge > 0 ? (
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
              +{badge}
            </span>
          ) : null}
        </div>
        {detail ? <p className="mt-0.5 truncate text-xs text-neutral-500">{detail}</p> : null}
      </div>
      {amount ? <p className={`shrink-0 text-sm font-semibold tabular-nums ${tone}`}>{amount}</p> : null}
    </Comp>
  )
}

export function ModeSegmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="bu-glass flex gap-1 rounded-[20px] p-1">
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`bu-press flex-1 rounded-[16px] px-3 py-2.5 text-xs font-semibold transition ${
              active ? 'bu-nav-active' : 'text-neutral-600 hover:bg-white/40'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
