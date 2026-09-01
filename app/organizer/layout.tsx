import { OrganizerNav } from '@/components/web/organizer-nav'

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen flex-col md:flex-row">
        <OrganizerNav />
        <div className="min-w-0 flex-1">
          <main className="p-4 md:p-8">{children}</main>
        </div>
      </div>
    </div>
  )
}
