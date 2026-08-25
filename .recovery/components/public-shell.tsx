import Link from 'next/link'

export function PublicShell({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <Link href="/" className="text-sm font-semibold text-primary">
            ɃU
          </Link>
          <h1 className="text-sm font-bold text-primary">{title ?? 'Bison Note'}</h1>
          <Link href="/tickets" className="text-xs text-muted-foreground">
            My tickets
          </Link>
        </header>
        {children}
      </div>
    </div>
  )
}
