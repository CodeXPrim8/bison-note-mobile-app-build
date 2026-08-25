'use client';

interface NavigationProps {
  currentPage: string
  onNavigate: (page: string) => void
  mode?: 'user' | 'celebrant' | 'vendor'
}

export default function Navigation({ currentPage, onNavigate, mode = 'user' }: NavigationProps) {
  const userTabs = [
    { id: 'dashboard', icon: '🏠', label: 'Home' },
    { id: 'tickets', icon: '🎫', label: 'Tickets' },
    { id: 'spraying', icon: '✨', label: 'Spray' },
    { id: 'wallet', icon: '💳', label: 'Wallet' },
    { id: 'profile', icon: '👤', label: 'Menu' },
  ]

  const celebrantTabs = [
    { id: 'dashboard', icon: '🏠', label: 'Home' },
    { id: 'tickets', icon: '🎫', label: 'Tickets' },
    { id: 'wallet', icon: '💳', label: 'Wallet' },
    { id: 'profile', icon: '👤', label: 'Menu' },
  ]

  const vendorTabs = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'wallet', icon: '🛒', label: 'POS' },
    { id: 'spraying', icon: '📱', label: 'QR Check' },
    { id: 'profile', icon: '👤', label: 'Menu' },
  ]

  const tabs = mode === 'user' ? userTabs : mode === 'celebrant' ? celebrantTabs : vendorTabs

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-md justify-around">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition ${
              currentPage === tab.id
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
