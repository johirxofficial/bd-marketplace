import type { ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { dateTime, money } from '../lib/format'

type ReceiptPayload = {
  receipt: {
    number: string
    type: string
    type_label: string
    status: string
    amount: string
    currency: string
    issued_at?: string | null
    url?: string
  }
  store: {
    name?: string
    tagline?: string
    support_email?: string
    support_phone?: string
    support_address?: string
    website?: string
    logo_url?: string | null
  }
  order: {
    number?: string
    status_label?: string
    payment_status_label?: string
    payment_method?: string
    placed_at?: string | null
    paid_at?: string | null
    customer_note?: string | null
  }
  customer: { name?: string; email?: string; phone?: string }
  shipping: { name?: string; phone?: string; address?: string; area?: string; district?: string; division?: string; postcode?: string }
  items: { name?: string; variant?: string; sku?: string; store_name?: string; quantity?: number; unit_price?: string; line_total?: string }[]
  totals: {
    subtotal?: string
    discount?: string
    shipping?: string
    tax?: string
    payment_fee?: string
    grand_total?: string
    coupon_code?: string | null
    formatted_grand_total?: string
  }
  payment: { method?: string; reference?: string | null; transaction_status?: string | null; paid_at?: string | null }
  notes: { footer?: string; return_policy?: string }
  meta: { return_number?: string | null; refund_id?: number | null }
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-800">{value}</dd>
    </div>
  )
}

export default function ReceiptPage() {
  const { receiptNumber = '' } = useParams()
  const [params] = useSearchParams()
  const token = params.get('token') || undefined

  const { data, isLoading, error } = useQuery({
    queryKey: ['receipt', receiptNumber, token],
    queryFn: async () => (await api.get(`/receipts/${receiptNumber}`, { params: { token } })).data.receipt as ReceiptPayload,
    enabled: !!receiptNumber,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <p className="text-sm text-slate-500">Loading receipt…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Receipt not available</h1>
          <p className="mt-2 text-sm text-slate-500">{apiError(error, 'This receipt link is invalid or has expired. Sign in to your account to open your receipts.')}</p>
          <Link to="/account/orders" className="mt-4 inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            Go to my orders
          </Link>
        </div>
      </div>
    )
  }

  const { receipt, store, order, customer, shipping, items, totals, payment, notes, meta } = data
  const issued = dateTime(receipt.issued_at)
  const shipTo = [shipping.name, shipping.address, shipping.area, shipping.district, shipping.division, shipping.postcode]
    .filter(Boolean)
    .reduce<string>((line, part) => {
      const value = String(part).trim()
      if (!value) return line
      return line.toLowerCase().includes(value.toLowerCase()) ? line : (line ? `${line}, ${value}` : value)
    }, '') || '—'

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-6 print:bg-white print:p-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="mx-auto mb-3 flex max-w-3xl flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to={order.number ? `/account/orders/${order.number}` : '/account/orders'} className="text-xs font-semibold text-slate-600 hover:text-slate-900">
          ← Back to order
        </Link>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
            Print / Save as PDF
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5 print:bg-white">
          <div className="flex items-center gap-3">
            {store.logo_url ? (
              <img src={store.logo_url} alt={store.name || 'Store'} className="h-12 w-12 rounded-lg border border-slate-200 bg-white object-contain p-1" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900 text-lg font-bold text-white">{(store.name || 'M')[0]}</div>
            )}
            <div>
              <h1 className="text-base font-bold text-slate-900">{store.name || 'Marketplace'}</h1>
              {store.tagline ? <p className="text-[11px] text-slate-500">{store.tagline}</p> : null}
              <p className="text-[10px] text-slate-400">{store.website}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Receipt</p>
            <p className="font-mono text-sm font-bold text-slate-900">{receipt.number}</p>
            <p className="mt-1 text-[11px] text-slate-500">{receipt.type_label}</p>
            <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
              {receipt.status}
            </span>
          </div>
        </header>

        <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Billed to</h2>
            <p className="mt-1.5 text-sm font-semibold text-slate-900">{customer.name || 'Customer'}</p>
            {customer.email ? <p className="text-xs text-slate-500">{customer.email}</p> : null}
            {customer.phone ? <p className="text-xs text-slate-500">{customer.phone}</p> : null}
            <h3 className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Ship to</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{shipTo}</p>
            {shipping.phone ? <p className="text-xs text-slate-500">{shipping.phone}</p> : null}
          </section>
          <section className="sm:text-right">
            <dl className="space-y-1 text-xs">
              <Line label="Order" value={<span className="font-mono">{order.number || '—'}</span>} />
              <Line label="Issued" value={issued} />
              <Line label="Order status" value={order.status_label || '—'} />
              <Line label="Payment" value={order.payment_method || payment.method || '—'} />
              {payment.reference ? <Line label="Reference" value={<span className="font-mono">{payment.reference}</span>} /> : null}
              {meta.return_number ? <Line label="Return" value={<span className="font-mono">{meta.return_number}</span>} /> : null}
            </dl>
          </section>
        </div>

        <div className="border-t border-slate-200 px-6 py-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-bold">Item</th>
                <th className="pb-2 text-center font-bold">Qty</th>
                <th className="pb-2 text-right font-bold">Unit</th>
                <th className="pb-2 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, index) => (
                <tr key={index}>
                  <td className="py-2.5">
                    <p className="font-semibold text-slate-800">{item.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {[item.variant, item.sku, item.store_name].filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className="py-2.5 text-center text-slate-600">{item.quantity}</td>
                  <td className="py-2.5 text-right text-slate-600">{money(item.unit_price)}</td>
                  <td className="py-2.5 text-right font-semibold text-slate-800">{money(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-5 border-t border-slate-200 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm text-[10px] leading-relaxed text-slate-400">
            {notes.footer ? <p>{notes.footer}</p> : null}
            {notes.return_policy ? <p className="mt-1.5">{notes.return_policy}</p> : null}
            <p className="mt-2">This is a computer-generated receipt for {money(receipt.amount)} {receipt.currency}.</p>
            {(store.support_email || store.support_phone) ? (
              <p className="mt-1">Questions? {[store.support_email, store.support_phone].filter(Boolean).join(' · ')}</p>
            ) : null}
          </div>
          <dl className="w-full space-y-1 text-xs sm:w-64">
            <Line label="Subtotal" value={money(totals.subtotal)} />
            <Line label="Discount" value={<span className="text-emerald-700">−{money(totals.discount)}</span>} />
            <Line label="Delivery" value={money(totals.shipping)} />
            {Number(totals.tax || 0) > 0 ? <Line label="Tax" value={money(totals.tax)} /> : null}
            {Number(totals.payment_fee || 0) > 0 ? <Line label="Payment fee" value={money(totals.payment_fee)} /> : null}
            <div className="mt-2 flex items-center justify-between border-t border-slate-300 pt-2 text-sm font-bold text-slate-900">
              <dt>Total</dt>
              <dd>{money(totals.grand_total)}</dd>
            </div>
            <p className="pt-1 text-right text-[10px] uppercase tracking-wide text-slate-400">{order.payment_status_label}</p>
          </dl>
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-center text-[10px] text-slate-400 print:bg-white">
          Thank you for shopping with {store.name || 'us'}. Keep this receipt for your records.
        </footer>
      </main>
    </div>
  )
}
