'use client'

import type { LucideIcon } from 'lucide-react'
import { Home, Ticket, Sparkles, UserRound, LayoutDashboard, ShoppingBag, QrCode } from 'lucide-react'

interface NavigationProps {
  currentPage: string
  onNavigate: (page: string, data?: unknown) => void
  mode?: 'user' | 'celebrant' | 'vendor'
}

type NavTab = {
  id: string
  label: string
  Icon: LucideIcon
  matches?: string[]
}

const userTabs: NavTab[] = [
  {
    id: 'dashboard',
    label: 'Home',
    Icon: Home,
    matches: ['buy-bu', 'send-bu', 'receive-bu', 'history', 'redemption', 'notifications'],
  },
  {
    id: 'tickets',
    label: 'Tickets',
    Icon: Ticket,
    matches: ['events', 'event-info', 'invites'],
  },
  {
    id: 'spraying',
    label: 'Spray',
    Icon: Sparkles,
  },
  {
    id: 'profile',
    label: 'Menu',
    Icon: UserRound,
  },
]

const celebrantTabs: NavTab[] = [
  {
    id: 'dashboard',
    label: 'Home',
    Icon: Home,
    matches: ['history', 'redemption', 'receive-bu', 'notifications', 'wallet'],
  },
  { id: 'tickets', label: 'Tickets', Icon: Ticket, matches: ['events', 'event-info', 'invites'] },
  { id: 'profile', label: 'Menu', Icon: UserRound },
]

const vendorTabs: NavTab[] = [
  { id: 'dashboard', label: 'Home', Icon: LayoutDashboard, matches: ['history', 'notifications'] },
  { id: 'wallet', label: 'POS', Icon: ShoppingBag },
  { id: 'spraying', label: 'Scan', Icon: QrCode },
  { id: 'profile', label: 'Menu', Icon: UserRound },
]

function isActiveTab(tab: NavTab, currentPage: string) {
  if (currentPage === tab.id) return true
  return Boolean(tab.matches?.includes(currentPage))
}

export default function Navigation({ currentPage, onNavigate, mode = 'user' }: NavigationProps) {
  const tabs = mode === 'user' ? userTabs : mode === 'celebrant' ? celebrantTabs : vendorTabs

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <nav
        aria-label="Main"
        className="bu-glass pointer-events-auto mx-auto flex max-w-md items-center gap-1 rounded-[28px] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_18px_50px_rgba(11,23,51,0.14)]"
      >
        {tabs.map((tab) => {
          const active = isActiveTab(tab, currentPage)
          const Icon = tab.Icon
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className={`bu-nav-btn group relative flex h-12 items-center justify-center overflow-hidden rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                active
                  ? 'bu-nav-active flex-[1.35]'
                  : 'flex-1 text-neutral-500 hover:bg-white/50 hover:text-[color:var(--bu-navy)]'
              }`}
            >
              <span
                className={`flex items-center gap-2 transition-transform duration-300 ${
                  active ? 'scale-100' : 'scale-100 group-active:scale-95'
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 transition-transform duration-300 ${
                    active ? 'scale-110' : ''
                  }`}
                  strokeWidth={active ? 2.4 : 2}
                />
                <span
                  className={`overflow-hidden whitespace-nowrap text-[11px] font-semibold tracking-wide transition-all duration-300 ${
                    active ? 'max-w-[4.5rem] opacity-100' : 'max-w-0 opacity-0'
                  }`}
                >
                  {tab.label}
                </span>
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
