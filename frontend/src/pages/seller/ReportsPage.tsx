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

export default function SellerReportsPage() {
  const [from, setFrom] = useState(isoDaysAgo(29))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [range, setRange] = useState({ from, to })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['seller-report', range],
    queryFn: async () => (await api.get('/seller/reports/sales', { params: range })).data,
  })

  const maxSales = Math.max(1, ...(data?.daily || []).map((d: any) => Number(d.sales)))

  return (
    <div>
      <PageHeader eyebrow="Seller center" title="Sales reports" subtitle="Daily sales, commission, and top products for a date range." />

      <form onSubmit={(e) => { e.preventDefault(); setRange({ from, to }) }} className="card mb-4 flex flex-wrap items-end gap-2 p-3">
        <label className="text-[11px] font-semibold text-slate-500">From<input type="date" className="input mt-1" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-[11px] font-semibold text-slate-500">To<input type="date" className="input mt-1" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <Button type="submit" size="sm">Run report</Button>
        <span className="ml-auto text-[11px] text-slate-400">Excludes cancelled orders</span>
      </form>

      {isLoading ? <Loading label="Building report…" /> : error ? (
        <ErrorState message="The report could not be loaded. Check the date range." onRetry={() => refetch()} />
      ) : !data ? null : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Orders" value={data.totals.orders} icon="📦" />
            <StatCard label="Gross sales" value={money(data.totals.gross)} tone="brand" icon="৳" />
            <StatCard label="Commission" value={money(data.totals.commission)} tone="red" icon="%" />
            <StatCard label="Net payable" value={money(data.totals.payable)} tone="green" icon="✓" />
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Daily sales</h2>
            {!data.daily?.length ? (
              <p className="mt-3 text-xs text-slate-500">No sales in this period.</p>
            ) : (
              <>
                <div className="mt-4 flex h-40 items-end gap-1.5 overflow-x-auto">
                  {data.daily.map((day: any) => (
                    <div key={day.day} className="flex min-w-[14px] flex-1 flex-col items-center gap-1" title={`${day.day}: ${money(day.sales)}`}>
                      <div className="w-full rounded-t bg-brand-400 hover:bg-brand-500" style={{ height: `${Math.max(3, (Number(day.sales) / maxSales) * 130)}px` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Date</th><th>Orders</th><th>Sales</th><th>Commission</th><th>Payable</th></tr></thead>
                      <tbody>
                        {data.daily.slice(-14).reverse().map((day: any) => (
                          <tr key={day.day}>
                            <td className="text-xs">{date(day.day)}</td>
                            <td className="text-xs">{day.orders}</td>
                            <td className="text-xs">{money(day.sales)}</td>
                            <td className="text-xs text-rose-600">−{money(day.commission)}</td>
                            <td className="text-xs font-semibold">{money(day.payable)}</td>
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
              <div className="border-b border-slate-100 px-4 py-2.5"><h2 className="text-sm font-bold text-slate-900">Top products</h2></div>
              {!data.top_products?.length ? <p className="px-4 py-6 text-xs text-slate-500">No product sales in this period.</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
                    <tbody>
                      {data.top_products.map((product: any, index: number) => (
                        <tr key={`${product.sku}-${index}`}>
                          <td><p className="max-w-[240px] truncate text-xs font-semibold text-slate-700">{product.product_name}</p><p className="font-mono text-[10px] text-slate-400">{product.sku}</p></td>
                          <td className="text-xs">{product.units}</td>
                          <td className="text-xs font-semibold">{money(product.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-900">Orders by status</h2>
              <div className="mt-2 space-y-1.5">
                {Object.entries(data.status_counts || {}).length === 0 ? <p className="text-xs text-slate-500">No orders.</p> : Object.entries(data.status_counts || {}).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <span className="capitalize text-slate-600">{status.replace(/_/g, ' ')}</span>
                    <Badge tone={status === 'delivered' ? 'green' : status === 'cancelled' ? 'red' : 'amber'}>{String(count)}</Badge>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-slate-400">Report period: {date(data.period.from)} – {date(data.period.to)}. Values are computed from seller orders and order items.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
