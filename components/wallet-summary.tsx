export function WalletPageSummary({
  kicker,
  title,
  detail,
}: {
  kicker: string
  title: string
  detail?: string
}) {
  return (
    <div className="rounded-[28px] bg-neutral-950 px-5 py-6 text-white">
      {kicker ? <p className="text-xs font-medium tracking-wide text-white/60">{kicker}</p> : null}
      <p className={`text-2xl font-semibold tracking-tight ${kicker ? 'mt-2' : ''}`}>{title}</p>
      {detail ? <p className="mt-2 text-sm text-white/70">{detail}</p> : null}
    </div>
  )
}
