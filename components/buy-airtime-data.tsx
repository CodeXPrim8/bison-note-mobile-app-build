'use client'

import { useEffect, useMemo, useState } from 'react'
import { PinPadModal } from '@/components/pin-pad-modal'
import { useAccount } from '@/components/account-store'
import { formatBu } from '@/lib/bu-rate'
import type { VtuCatalogItem, VtuProductKind } from '@/lib/vtu/catalog'
import type { VtuNetwork } from '@/lib/vtu/networks'

type Step = 'phone' | 'products' | 'done'

export default function BuyAirtimeData({
  kind,
  onBack,
}: {
  kind: VtuProductKind
  onBack?: () => void
}) {
  const { buBalance, refreshWallet, applySpendBu } = useAccount()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [network, setNetwork] = useState<VtuNetwork | null>(null)
  const [products, setProducts] = useState<VtuCatalogItem[]>([])
  const [selected, setSelected] = useState<VtuCatalogItem | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinBusy, setPinBusy] = useState(false)
  const [receipt, setReceipt] = useState<{
    label: string
    phone: string
    network: string
    bu: number
    reference: string
  } | null>(null)

  const title = kind === 'airtime' ? 'Airtime' : 'Data'
  const vtuOpen =
    process.env.NEXT_PUBLIC_VTU_ENABLED === 'true' || process.env.NEXT_PUBLIC_VTU_ENABLED === '1'
  const customNaira = useMemo(() => {
    const n = Number(customAmount.replace(/[^\d]/g, ''))
    return Number.isFinite(n) ? n : 0
  }, [customAmount])

  useEffect(() => {
    setStep('phone')
    setPhone('')
    setNetwork(null)
    setProducts([])
    setSelected(null)
    setCustomAmount('')
    setMessage(null)
    setReceipt(null)
  }, [kind])

  async function detect() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/vtu/detect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, kind }),
      })
      const json = await res.json()
      if (!json.status) {
        setMessage(json.message ?? 'Could not detect network')
        return
      }
      setNetwork(json.data.network as VtuNetwork)
      setProducts((json.data.products ?? []) as VtuCatalogItem[])
      setPhone(String(json.data.phone ?? phone))
      setSelected(null)
      setStep('products')
    } catch {
      setMessage('Could not detect network. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function choosePay() {
    setMessage(null)
    if (kind === 'airtime' && !selected && customNaira >= 50) {
      setPinError(null)
      setPinOpen(true)
      return
    }
    if (!selected) {
      setMessage(kind === 'airtime' ? 'Choose an amount or enter a custom amount.' : 'Choose a data plan.')
      return
    }
    setPinError(null)
    setPinOpen(true)
  }

  async function pay(pin: string) {
    setPinBusy(true)
    setPinError(null)
    try {
      const body: Record<string, unknown> = {
        kind,
        phone,
        pin,
        network: network?.id,
        product_id: selected?.id ?? `airtime-${network?.id}-custom`,
      }
      if (!selected && kind === 'airtime') {
        body.custom_naira = customNaira
      }
      const res = await fetch('/api/vtu/purchase', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.status) {
        setPinError(json.message ?? 'Payment failed')
        return
      }
      setPinOpen(false)
      setReceipt({
        label: String(json.data.label),
        phone: String(json.data.phone),
        network: String(json.data.network).toUpperCase(),
        bu: Number(json.data.bu),
        reference: String(json.data.reference),
      })
      setStep('done')
      applySpendBu(Number(json.data.bu), { refresh: true })
      void refreshWallet()
    } catch {
      setPinError('Payment failed. Try again.')
    } finally {
      setPinBusy(false)
    }
  }

  if (!vtuOpen) {
    return (
      <div className="bu-user-shell mx-auto min-h-full max-w-lg px-4 pb-28 pt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1f5fd6]">{title}</p>
            <h1 className="text-2xl font-bold tracking-tight text-[#07101f]">Coming soon</h1>
          </div>
          {onBack ? (
            <button type="button" onClick={onBack} className="text-sm font-semibold text-[#0b1733]/70">
              Back
            </button>
          ) : null}
        </div>
        <div className="bu-glass-soft rounded-2xl p-5">
          <p className="text-sm leading-relaxed text-neutral-600">
            {title} top-ups with ɃU will open here once live network delivery is ready.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bu-user-shell mx-auto min-h-full max-w-lg px-4 pb-28 pt-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1f5fd6]">{title}</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#07101f]">Buy {title.toLowerCase()}</h1>
        </div>
        {onBack ? (
          <button type="button" onClick={onBack} className="text-sm font-semibold text-[#0b1733]/70">
            Back
          </button>
        ) : null}
      </div>

      <div className="bu-glass-soft mb-4 rounded-2xl px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Balance</p>
        <p className="mt-1 text-xl font-bold text-[#07101f]">{formatBu(buBalance)} ɃU</p>
      </div>

      {message ? <p className="mb-3 text-sm font-medium text-red-600">{message}</p> : null}

      {step === 'phone' ? (
        <div className="bu-glass-soft space-y-4 rounded-2xl p-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Phone number</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="0803 000 0000"
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-base font-semibold outline-none focus:border-[#2f7bff]"
            />
          </label>
          <p className="text-sm text-neutral-500">
            We detect MTN, Airtel, Glo, or 9mobile from the number. Live top-up needs a network provider connected.
          </p>
          <button
            type="button"
            disabled={busy || phone.trim().length < 10}
            onClick={() => void detect()}
            className="bu-press w-full rounded-full bg-[#0b1733] py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Detecting…' : 'Continue'}
          </button>
        </div>
      ) : null}

      {step === 'products' && network ? (
        <div className="space-y-4">
          <div className="bu-glass-soft flex items-center justify-between rounded-2xl px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Number</p>
              <p className="mt-0.5 font-bold text-[#07101f]">{phone}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Network</p>
              <p className="mt-0.5 font-bold" style={{ color: network.color }}>
                {network.name}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="text-sm font-semibold text-[#1f5fd6]"
            onClick={() => {
              setStep('phone')
              setSelected(null)
            }}
          >
            Change number
          </button>

          {kind === 'airtime' ? (
            <div className="bu-glass-soft rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Custom amount</p>
              <input
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value)
                  setSelected(null)
                }}
                inputMode="numeric"
                placeholder="e.g. 750"
                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-base font-semibold outline-none focus:border-[#2f7bff]"
              />
              <p className="mt-1 text-xs text-neutral-500">₦50 – ₦50,000 · 1 ɃU = ₦1</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            {products.map((item) => {
              const active = selected?.id === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelected(item)
                    setCustomAmount('')
                  }}
                  className={`bu-press rounded-2xl border px-3 py-3 text-left ${
                    active ? 'border-[#2f7bff] bg-[#2f7bff]/10' : 'border-black/10 bg-white/80'
                  }`}
                >
                  <p className="text-sm font-bold text-[#07101f]">
                    {item.kind === 'data' ? item.dataLabel : item.label}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {item.kind === 'data' ? `${item.validity} · ₦${item.naira.toLocaleString('en-NG')}` : `${item.naira} ɃU`}
                  </p>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={choosePay}
            className="bu-press w-full rounded-full bg-gradient-to-r from-[#2f7bff] to-[#8b5cf6] py-3.5 text-sm font-bold text-white"
          >
            Pay{' '}
            {selected
              ? `${selected.naira.toLocaleString('en-NG')} ɃU`
              : customNaira >= 50
                ? `${customNaira.toLocaleString('en-NG')} ɃU`
                : ''}
          </button>
        </div>
      ) : null}

      {step === 'done' && receipt ? (
        <div className="bu-glass-soft space-y-3 rounded-2xl p-5 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1f5fd6]">Paid</p>
          <h2 className="text-2xl font-bold text-[#07101f]">{receipt.label}</h2>
          <p className="text-sm text-neutral-600">
            {receipt.network} · {receipt.phone}
          </p>
          <p className="text-lg font-bold text-[#07101f]">{formatBu(receipt.bu)} ɃU</p>
          <p className="break-all text-[11px] text-neutral-400">{receipt.reference}</p>
          <button
            type="button"
            onClick={onBack}
            className="bu-press mt-2 w-full rounded-full bg-[#0b1733] py-3 text-sm font-bold text-white"
          >
            Done
          </button>
        </div>
      ) : null}

      <PinPadModal
        open={pinOpen}
        title="Confirm purchase"
        subtitle={
          selected
            ? `${selected.label} to ${phone}`
            : `₦${customNaira.toLocaleString('en-NG')} airtime to ${phone}`
        }
        busy={pinBusy}
        error={pinError}
        onClose={() => setPinOpen(false)}
        onSubmit={(pin) => void pay(pin)}
      />
    </div>
  )
}
