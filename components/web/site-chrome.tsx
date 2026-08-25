'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface MeResponse {
  status: boolean
  data?: { user: { id: string; email?: string | null } | null; profile: { display_name?: string | null } | null }
}

export function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false)
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = (await res.json()) as MeResponse
        if (json.status && json.data?.user) {
          setSignedIn(true)
          setName(json.data.profile?.display_name ?? json.data.user.email ?? 'Account')
        }
      })
      .catch(() => undefined)
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/'
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            Ƀ
          </span>
          <span className="text-lg font-bold tracking-tight">ɃU</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link href="/events" className="hover:text-foreground">
            Events
          </Link>
          <Link href="/organizer" className="hover:text-foreground">
            Organisers
          </Link>
          <Link href="/gateway" className="hover:text-foreground">
            Gateway
          </Link>
          <Link href="/gateway/docs" className="hover:text-foreground">
            Docs
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <>
              <span className="hidden max-w-[10rem] truncate text-sm text-muted-foreground sm:inline">{name}</span>
              <Button asChild variant="ghost" size="sm">
                <Link href="/app">Open ɃU</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={logout}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login?next=/app">Open ɃU</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/80 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-bold">ɃU</p>
          <p className="text-sm text-muted-foreground">Create events. Sell tickets. Celebrate with ɃU.</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/events">Discover events</Link>
          <Link href="/organizer/events/create">Create event</Link>
          <Link href="/gateway">Gateway</Link>
          <Link href="/app">Mobile app</Link>
        </div>
      </div>
    </footer>
  )
}
