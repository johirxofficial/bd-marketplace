import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { date, money } from '../../lib/format'
import { Badge, Button, ErrorState, Input, Loading, PageHeader, StatCard } from '../../components/ui'

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

type Report = {
  period: { from: string; to: string }
  totals: Record<string, string | number>
  daily: { day: string; orders: number; gmv: string; order_value: string }[]
  top_stores: { store_id: number; orders: number; gross: string; commission: string; store?: { id: number; name: string } }[]
  top_products: { product_name: string; sku: string; units: number; revenue: string }[]
  by_category: { category: string; revenue: string; units: number }[]
  payment_status_counts: Record<string, number>
}

export default function AdminReportsPage() {
  const [from, setFrom] = useState(isoDaysAgo(29))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [range, setRange] = useState({ from, to })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-report', range],
    queryFn: async () => (await api.get('/admin/reports', { params: range })).data as Report,
  })

  const maxGmv = Math.max(1, ...(data?.daily || []).map((day) => Number(day.gmv)))

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Reports"
        subtitle="Marketplace performance for a date range. Cancelled orders are excluded from sales totals."
      />

      <form onSubmit={(e) => { e.preventDefault(); setRange({ from, to }) }} className="card mb-4 flex flex-wrap items-end gap-2 p-3">
        <label className="text-[11px] font-semibold text-slate-500">From<input type="date" className="input mt-1" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-[11px] font-semibold text-slate-500">To<input type="date" className="input mt-1" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <Button type="submit" size="sm">Run report</Button>
        <span className="ml-auto text-[11px] text-slate-400">Period: {data?.period ? `${date(data.period.from)} – ${date(data.period.to)}` : '—'}</span>
      </form>

      {isLoading ? <Loading label="Building report…" /> : error ? (
        <ErrorState message="The report could not be loaded. Check the date range and try again." onRetry={() => refetch()} />
      ) : !data ? null : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Orders" value={Number(data.totals.orders)} hint={`${Number(data.totals.new_customers)} new customers`} icon="📦" />
            <StatCard label="GMV" value={money(data.totals.gmv)} hint={`AOV ${money(data.totals.average_order_value)}`} tone="brand" icon="৳" />
            <StatCard label="COD collected" value={money(data.totals.collected)} hint={`Refunds ${money(data.totals.refunds)}`} tone="green" icon="✓" />
            <StatCard label="Commission" value={money(data.totals.commission)} hint={`Seller payable ${money(data.totals.seller_payable)}`} tone="blue" icon="%" />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card p-3"><p className="text-[10px] uppercase tracking-wide text-slate-400">Gross order value</p><p className="mt-0.5 text-base font-bold text-slate-900">{money(data.totals.gross_order_value)}</p></div>
            <div className="card p-3"><p className="text-[10px] uppercase tracking-wide text-slate-400">Discounts</p><p className="mt-0.5 text-base font-bold text-rose-600">{money(data.totals.discounts)}</p></div>
            <div className="card p-3"><p className="text-[10px] uppercase tracking-wide text-slate-400">Shipping revenue</p><p className="mt-0.5 text-base font-bold text-slate-900">{money(data.totals.shipping_revenue)}</p></div>
            <div className="card p-3"><p className="text-[10px] uppercase tracking-wide text-slate-400">Refunds processed</p><p className="mt-0.5 text-base font-bold text-rose-600">{money(data.totals.refunds)}</p></div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Daily gross merchandise value</h2>
            {!data.daily.length ? (
              <p className="mt-3 text-xs text-slate-500">No orders in this period.</p>
            ) : (
              <>
                <div className="mt-4 flex h-44 items-end gap-1 overflow-x-auto">
                  {data.daily.map((day) => (
                    <div key={day.day} className="group relative flex min-w-[10px] flex-1 flex-col items-center justify-end" title={`${date(day.day)}: ${money(day.gmv)} · ${day.orders} orders`}>
                      <div className="w-full rounded-t bg-brand-400/80 group-hover:bg-brand-500" style={{ height: `${Math.max(2, (Number(day.gmv) / maxGmv) * 150)}px` }} />
                      <span className="mt-1 text-[8px] text-slate-400">{day.day.slice(5)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                  <div className="table-wrap max-h-64 overflow-y-auto">
                    <table className="table">
                      <thead><tr><th>Date</th><th>Orders</th><th>GMV</th><th>Order value</th></tr></thead>
                      <tbody>
                        {[...data.daily].reverse().map((day) => (
                          <tr key={day.day}>
                            <td className="text-xs">{date(day.day)}</td>
                            <td className="text-xs">{day.orders}</td>
                            <td className="text-xs font-semibold">{money(day.gmv)}</td>
                            <td className="text-xs">{money(day.order_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-2.5"><h2 className="text-sm font-bold text-slate-900">Top stores</h2></div>
              {!data.top_stores.length ? <p className="px-4 py-6 text-xs text-slate-500">No store sales in this period.</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Store</th><th>Orders</th><th>Gross</th><th>Commission</th></tr></thead>
                    <tbody>
                      {data.top_stores.map((store) => (
                        <tr key={store.store_id}>
                          <td className="text-xs font-semibold text-slate-700">{store.store?.name || `Store #${store.store_id}`}</td>
                          <td className="text-xs">{store.orders}</td>
                          <td className="text-xs font-semibold">{money(store.gross)}</td>
                          <td className="text-xs text-rose-600">−{money(store.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-2.5"><h2 className="text-sm font-bold text-slate-900">Top products</h2></div>
              {!data.top_products.length ? <p className="px-4 py-6 text-xs text-slate-500">No product sales in this period.</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
                    <tbody>
                      {data.top_products.map((product, index) => (
                        <tr key={`${product.sku}-${index}`}>
                          <td>
                            <p className="max-w-[240px] truncate text-xs font-semibold text-slate-700">{product.product_name}</p>
                            <p className="font-mono text-[10px] text-slate-400">{product.sku}</p>
                          </td>
                          <td className="text-xs">{product.units}</td>
                          <td className="text-xs font-semibold">{money(product.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-2.5"><h2 className="text-sm font-bold text-slate-900">Revenue by category</h2></div>
              {!data.by_category.length ? <p className="px-4 py-6 text-xs text-slate-500">No category sales in this period.</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Category</th><th>Units</th><th>Revenue</th></tr></thead>
                    <tbody>
                      {data.by_category.map((row) => (
                        <tr key={row.category}>
                          <td className="text-xs font-semibold text-slate-700">{row.category}</td>
                          <td className="text-xs">{row.units}</td>
                          <td className="text-xs font-semibold">{money(row.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-900">Orders by payment status</h2>
              <div className="mt-2 space-y-1.5">
                {Object.entries(data.payment_status_counts || {}).length === 0 ? <p className="text-xs text-slate-500">No orders in this period.</p> : Object.entries(data.payment_status_counts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <span className="capitalize text-slate-600">{status.replace(/_/g, ' ')}</span>
                    <Badge tone={status === 'paid' ? 'green' : status === 'cod_pending' ? 'amber' : 'slate'}>{count}</Badge>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
                Sales totals exclude cancelled orders. Commission and seller payable are aggregated from seller orders created in the period.
                COD collection figures come from recorded payment transactions, so they can lag shipments.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
