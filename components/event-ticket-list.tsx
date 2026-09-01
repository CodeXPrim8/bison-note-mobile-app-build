import { formatNaira } from '@/lib/money'

type TicketRow = {
  id?: string
  name: string
  price: number
  quantity_total?: number
  quantity_sold?: number
  is_active?: boolean
}

function remainingOf(tier: TicketRow) {
  return Math.max(0, Number(tier.quantity_total ?? 0) - Number(tier.quantity_sold ?? 0))
}

export function EventTicketList({
  tiers,
  ended = false,
  showRemaining = true,
}: {
  tiers?: TicketRow[] | null
  ended?: boolean
  showRemaining?: boolean
}) {
  const rows = (tiers ?? []).filter((tier) => tier.is_active !== false)
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">Tickets not on sale</p>
  }

  return (
    <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/80 bg-secondary/30">
      {rows.map((tier, index) => {
        const left = remainingOf(tier)
        const soldOut = !ended && left <= 0
        return (
          <li
            key={tier.id || `${tier.name}-${index}`}
            className="flex items-center justify-between gap-3 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className={`truncate text-sm font-medium ${soldOut ? 'text-muted-foreground' : ''}`}>{tier.name}</p>
              {showRemaining && (
                <p className="text-xs text-muted-foreground">
                  {ended ? 'Event ended' : soldOut ? 'Sold out' : `${left} left`}
                </p>
              )}
            </div>
            <p className={`shrink-0 text-sm font-semibold tabular-nums ${soldOut ? 'text-muted-foreground' : 'text-primary'}`}>
              {formatNaira(Number(tier.price) || 0)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
