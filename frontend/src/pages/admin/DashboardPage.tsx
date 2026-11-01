import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { compactMoney, date, money } from '../../lib/format'
import { Badge, Loading, PageHeader, StatCard } from '../../components/ui'

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => (await api.get('/admin/dashboard')).data,
  })

  if (isLoading) return <Loading label="Loading administration overview…" />
  if (!data) return <p className="text-sm text-slate-500">The dashboard could not be loaded.</p>

  const stats = data.stats
  const maxRevenue = Math.max(1, ...(data.sales_trend || []).map((d: any) => Number(d.revenue)))

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Marketplace overview"
        subtitle="Orders, cash collection, seller payouts, and moderation queues across the platform."
        actions={<Link to="/admin/reports" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">Open reports</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Orders" value={stats.orders_total} hint={`${stats.orders_today} today · ${stats.orders_pending} pending`} icon="📦" />
        <StatCard label="GMV" value={money(stats.gmv)} hint="Subtotal after discounts" tone="brand" icon="৳" />
        <StatCard label="COD collected" value={money(stats.collected)} hint={`${stats.cod_pending} delivered awaiting collection`} tone="green" icon="✓" />
        <StatCard label="Commission" value={money(stats.commission)} hint={`${money(stats.seller_payable)} seller payable`} tone="blue" icon="%" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Pending sellers', stats.seller_queue, '/admin/sellers', 'amber'],
          ['Products to review', stats.products_pending, '/admin/products', 'amber'],
          ['Returns open', stats.returns_pending, '/admin/returns', 'red'],
          ['Support tickets', stats.tickets_open, '/admin/support', 'blue'],
          ['Low stock', stats.low_stock, '/admin/products', 'amber'],
          ['Approved sellers', stats.sellers, '/admin/sellers', 'green'],
        ].map(([label, value, to, tone]) => (
          <Link key={label as string} to={to as string} className="card flex items-center justify-between gap-2 p-3 hover:border-brand-200">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label as string}</p>
              <p className="text-lg font-bold text-slate-900">{value as number}</p>
            </div>
            <Badge tone={tone as string}>Open</Badge>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Revenue · last 14 days</h2>
            <span className="text-[11px] text-slate-400">Order value in BDT</span>
          </div>
          <div className="mt-4 flex h-40 items-end gap-1">
            {(data.sales_trend || []).map((day: any) => (
              <div key={day.date} className="group relative flex flex-1 flex-col items-center justify-end">
                <div className="pointer-events-none absolute -top-6 hidden whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white group-hover:block">{money(day.revenue)}</div>
                <div className="w-full rounded-t bg-brand-400/80 hover:bg-brand-500" style={{ height: `${Math.max(2, (Number(day.revenue) / maxRevenue) * 130)}px` }} />
                <span className="mt-1 text-[8px] text-slate-400">{day.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-lg bg-slate-50 p-2"><p className="text-slate-400">Orders today</p><p className="font-bold text-slate-800">{stats.orders_today}</p></div>
            <div className="rounded-lg bg-slate-50 p-2"><p className="text-slate-400">Customers</p><p className="font-bold text-slate-800">{stats.customers}</p></div>
            <div className="rounded-lg bg-slate-50 p-2"><p className="text-slate-400">Refunded</p><p className="font-bold text-slate-800">{money(stats.refunds)}</p></div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Seller applications</h2>
            <Link to="/admin/sellers" className="text-[11px] font-semibold text-brand-600 hover:underline">Review all →</Link>
          </div>
          {!data.seller_queue?.length ? (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">No pending seller applications.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {data.seller_queue.map((seller: any) => (
                <li key={seller.id} className="py-2">
                  <p className="text-xs font-semibold text-slate-800">{seller.business_name}</p>
                  <p className="text-[10px] text-slate-500">{seller.user?.email} · {seller.store?.name || 'No store'}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 border-t border-slate-100 pt-3">
            <h3 className="text-xs font-bold text-slate-700">Recent orders</h3>
            <ul className="mt-1.5 divide-y divide-slate-50">
              {(data.recent_orders || []).slice(0, 4).map((order: any) => (
                <li key={order.id} className="flex items-center justify-between gap-2 py-1.5">
                  <Link to={`/admin/orders/${order.id}`} className="font-mono text-[11px] font-semibold text-brand-600 hover:underline">{order.order_number}</Link>
                  <span className="text-[10px] text-slate-500">{order.customer}</span>
                  <span className="text-[11px] font-semibold">{money(order.grand_total)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-bold text-slate-900">Low stock</h2>
            <Link to="/admin/products" className="text-[11px] font-semibold text-brand-600 hover:underline">Products →</Link>
          </div>
          {!data.low_stock_items?.length ? <p className="px-4 py-5 text-xs text-slate-500">No low stock alerts.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Product</th><th>Variant</th><th>Store</th><th>Available</th></tr></thead>
                <tbody>
                  {data.low_stock_items.map((item: any) => (
                    <tr key={item.variant_id}>
                      <td className="max-w-[200px] truncate text-xs">{item.product}</td>
                      <td className="text-xs">{item.variant}</td>
                      <td className="text-xs">{item.store}</td>
                      <td><Badge tone={item.available <= 0 ? 'red' : 'amber'}>{item.available}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-bold text-slate-900">Order pipeline</h2>
          <div className="mt-2 space-y-1.5">
            {Object.entries(data.order_status_counts || {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-[11px]">
                <span className="capitalize text-slate-600">{status.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.min(100, (Number(count) / Math.max(1, Number(stats.orders_total))) * 100)}%` }} /></div>
                  <span className="w-6 text-right font-bold text-slate-700">{String(count)}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-slate-400">Last refreshed {date(new Date().toISOString())}. Open a report for date-bounded figures.</p>
        </div>
      </div>
    </div>
  )
}
