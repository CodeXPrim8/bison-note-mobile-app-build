import { AffiliateNav } from '@/components/web/account-shell-nav'

export default function AffiliateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen flex-col md:flex-row">
        <AffiliateNav />
        <div className="min-w-0 flex-1">
          <main className="p-4 md:p-8">{children}</main>
        </div>
      </div>
    </div>
  )
}
