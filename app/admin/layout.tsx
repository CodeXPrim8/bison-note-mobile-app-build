import { redirect } from 'next/navigation'
import { AdminNav } from '@/components/web/account-shell-nav'
import { getSessionUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { getAccountRolesForViewer } from '@/lib/account/roles'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/admin')
  const session = await readBuSession()
  const liveId =
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id
  const roles = await getAccountRolesForViewer(liveId, session)
  if (!roles.is_super_admin) redirect('/')

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen flex-col md:flex-row">
        <AdminNav />
        <div className="min-w-0 flex-1">
          <main className="p-4 md:p-8">{children}</main>
        </div>
      </div>
    </div>
  )
}
