'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { adminFetch } from '@/components/admin/api'
import {
  DEFAULT_SQUAD_FEE_RULES,
  previewPayInRow,
  previewPayOutRow,
  type SquadFeeRulesSettings,
} from '@/lib/bu-rate'

const PREVIEW_AMOUNTS = [1000, 5000, 9999, 10000, 20000, 50000, 100000, 1000000, 5000000]

function money(n: number) {
  return n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export default function AdminRatesPage() {
  const [rate, setRate] = useState('1')
  const [current, setCurrent] = useState(1)
  const [rules, setRules] = useState<SquadFeeRulesSettings>(DEFAULT_SQUAD_FEE_RULES)
  const [previewUsed, setPreviewUsed] = useState('0')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminFetch<{
      settings: { bu_naira_value: number; squad_fee_rules?: SquadFeeRulesSettings }
    }>('/api/admin/settings')
      .then((data) => {
        setCurrent(data.settings.bu_naira_value)
        setRate(String(data.settings.bu_naira_value))
        if (data.settings.squad_fee_rules) setRules(data.settings.squad_fee_rules)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  const used = Math.max(0, Math.floor(Number(previewUsed) || 0))

  const payInPaystack = useMemo(
    () => PREVIEW_AMOUNTS.map((amount) => previewPayInRow(amount, 'paystack', used, rules)),
    [used, rules],
  )
  const payInSquad = useMemo(
    () => PREVIEW_AMOUNTS.map((amount) => previewPayInRow(amount, 'squad', used, rules)),
    [used, rules],
  )
  const payOutPaystack = useMemo(
    () =>
      PREVIEW_AMOUNTS.map((amount) => previewPayOutRow(amount, 'paystack', used, rules)).filter(
        Boolean,
      ) as NonNullable<ReturnType<typeof previewPayOutRow>>[],
    [used, rules],
  )
  const payOutSquad = useMemo(
    () =>
      PREVIEW_AMOUNTS.map((amount) => previewPayOutRow(amount, 'squad', used, rules)).filter(
        Boolean,
      ) as NonNullable<ReturnType<typeof previewPayOutRow>>[],
    [used, rules],
  )

  async function saveRate() {
    setError(null)
    setSaving(true)
    try {
      const data = await adminFetch<{ settings: { bu_naira_value: number } }>('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ bu_naira_value: Number(rate) }),
      })
      setCurrent(data.settings.bu_naira_value)
      setMessage(`1 ɃU now equals ₦${data.settings.bu_naira_value}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function saveFees() {
    setError(null)
    setSaving(true)
    try {
      const payload: SquadFeeRulesSettings = {
        free_under_naira: Number(rules.free_under_naira),
        free_under_per_day: Math.floor(Number(rules.free_under_per_day)),
        pay_in: {
          partner_percent: Number(rules.pay_in.partner_percent),
          partner_cap_naira:
            rules.pay_in.partner_cap_naira === null || rules.pay_in.partner_cap_naira === undefined
              ? null
              : Number(rules.pay_in.partner_cap_naira),
          platform_percent: Number(rules.pay_in.platform_percent),
        },
        pay_out: {
          partner_percent: Number(rules.pay_out.partner_percent),
          partner_cap_naira:
            rules.pay_out.partner_cap_naira === null || rules.pay_out.partner_cap_naira === undefined
              ? null
              : Number(rules.pay_out.partner_cap_naira),
          platform_percent: Number(rules.pay_out.platform_percent),
          stamp_from_naira: Number(rules.pay_out.stamp_from_naira),
          stamp_naira: Number(rules.pay_out.stamp_naira),
        },
      }
      const data = await adminFetch<{ settings: { squad_fee_rules: SquadFeeRulesSettings } }>(
        '/api/admin/settings',
        {
          method: 'PATCH',
          body: JSON.stringify({ squad_fee_rules: payload }),
        },
      )
      setRules(data.settings.squad_fee_rules)
      setMessage('Squad fee rules saved — next Squad transfers use these numbers.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">FX + fees</p>
        <h1 className="mt-1 text-3xl font-bold">ɃU rate & Squad fees</h1>
        <p className="text-sm text-muted-foreground">
          Spray / send / withdraw use the ɃU rate. Squad pay-in and pay-out guest fees are editable below.
          Paystack stays on its published schedule (read-only tables).
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <p className="text-4xl font-bold">1 ɃU = ₦{current.toLocaleString('en-NG')}</p>
        <Input value={rate} onChange={(e) => setRate(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setRate(String(Math.max(0.01, Number(rate) - 0.1)))}>
            Reduce
          </Button>
          <Button variant="outline" onClick={() => setRate(String(Number(rate) + 0.1))}>
            Increase
          </Button>
          <Button disabled={saving} onClick={() => void saveRate()}>
            Save rate
          </Button>
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <div>
          <h2 className="text-xl font-semibold">Squad fee rules</h2>
          <p className="text-sm text-muted-foreground">
            First ₦{Number(rules.free_under_naira).toLocaleString('en-NG')} of under-threshold bank
            volume (pay-in + pay-out) per wallet per day (Lagos time) is free. Any single transfer of ₦
            {Number(rules.free_under_naira).toLocaleString('en-NG')}+ is always charged. After the free
            volume is used, guest pays partner pass-through + Bucks platform %.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Free volume / always-charge from (₦)"
            value={String(rules.free_under_naira)}
            onChange={(v) => setRules((r) => ({ ...r, free_under_naira: Number(v) || 0 }))}
            hint="Daily free under-threshold volume and the single-tx charge threshold"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-white/10 p-4">
            <h3 className="font-semibold">Squad pay in</h3>
            <Field
              label="Partner % (Squad VA)"
              value={String(rules.pay_in.partner_percent)}
              onChange={(v) =>
                setRules((r) => ({ ...r, pay_in: { ...r.pay_in, partner_percent: Number(v) || 0 } }))
              }
              hint="Published default 0.25"
            />
            <Field
              label="Partner cap (₦)"
              value={rules.pay_in.partner_cap_naira == null ? '' : String(rules.pay_in.partner_cap_naira)}
              onChange={(v) =>
                setRules((r) => ({
                  ...r,
                  pay_in: { ...r.pay_in, partner_cap_naira: v.trim() === '' ? null : Number(v) || 0 },
                }))
              }
              hint="Empty = no cap. Default 1000"
            />
            <Field
              label="Bucks platform % "
              value={String(rules.pay_in.platform_percent)}
              onChange={(v) =>
                setRules((r) => ({ ...r, pay_in: { ...r.pay_in, platform_percent: Number(v) || 0 } }))
              }
              hint="0.05 → ₦5 at ₦10,000"
            />
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 p-4">
            <h3 className="font-semibold">Squad pay out</h3>
            <Field
              label="Partner % (Squad transfer)"
              value={String(rules.pay_out.partner_percent)}
              onChange={(v) =>
                setRules((r) => ({ ...r, pay_out: { ...r.pay_out, partner_percent: Number(v) || 0 } }))
              }
              hint="Published default 0.1"
            />
            <Field
              label="Partner cap (₦)"
              value={rules.pay_out.partner_cap_naira == null ? '' : String(rules.pay_out.partner_cap_naira)}
              onChange={(v) =>
                setRules((r) => ({
                  ...r,
                  pay_out: { ...r.pay_out, partner_cap_naira: v.trim() === '' ? null : Number(v) || 0 },
                }))
              }
            />
            <Field
              label="Bucks platform %"
              value={String(rules.pay_out.platform_percent)}
              onChange={(v) =>
                setRules((r) => ({ ...r, pay_out: { ...r.pay_out, platform_percent: Number(v) || 0 } }))
              }
            />
            <Field
              label="Stamp from (₦)"
              value={String(rules.pay_out.stamp_from_naira)}
              onChange={(v) =>
                setRules((r) => ({ ...r, pay_out: { ...r.pay_out, stamp_from_naira: Number(v) || 0 } }))
              }
            />
            <Field
              label="Stamp amount (₦)"
              value={String(rules.pay_out.stamp_naira)}
              onChange={(v) =>
                setRules((r) => ({ ...r, pay_out: { ...r.pay_out, stamp_naira: Number(v) || 0 } }))
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="Preview free volume already used today (₦)"
            value={previewUsed}
            onChange={setPreviewUsed}
            hint={`0 = full ₦${Number(rules.free_under_naira).toLocaleString('en-NG')} free volume left`}
          />
          <Button disabled={saving} onClick={() => void saveFees()}>
            Save Squad fees
          </Button>
        </div>
      </Card>

      <FeeTable
        title="Pay in — Paystack (read-only)"
        columns={['Amount', 'Guest fee', 'Wallet gets', 'Paystack cost', 'Bucks keeps']}
        rows={payInPaystack.map((row) => [
          money(row.amount),
          money(row.guestFee),
          money(row.walletGets),
          money(row.partnerCost),
          money(row.bucksKeeps),
        ])}
      />
      <FeeTable
        title="Pay in — Squad (editable rules above)"
        columns={['Amount', 'Guest fee', 'Wallet gets', 'Squad cost', 'Bucks keeps']}
        rows={payInSquad.map((row) => [
          money(row.amount),
          money(row.guestFee),
          money(row.walletGets),
          money(row.partnerCost),
          money(row.bucksKeeps),
        ])}
      />
      <FeeTable
        title="Pay out — Paystack (read-only)"
        columns={['Bank receives', 'Guest pays on top', 'Paystack + stamp', 'Bucks keeps']}
        rows={payOutPaystack.map((row) => [
          money(row.amount),
          money(row.guestPaysOnTop),
          money(row.partnerPlusStamp),
          money(row.bucksKeeps),
        ])}
      />
      <FeeTable
        title="Pay out — Squad (editable rules above)"
        columns={['Bank receives', 'Guest pays on top', 'Squad + stamp', 'Bucks keeps']}
        rows={payOutSquad.map((row) => [
          money(row.amount),
          money(row.guestPaysOnTop),
          money(row.partnerPlusStamp),
          money(row.bucksKeeps),
        ])}
      />

      {message && <p className="text-sm text-emerald-300">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function FeeTable({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return (
    <Card className="overflow-x-auto p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-muted-foreground">
            {columns.map((col) => (
              <th key={col} className="px-2 py-2 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-2 tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
