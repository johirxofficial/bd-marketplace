import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { compactMoney, date, money } from '../../lib/format'
import { Badge, LinkButton, Loading, PageHeader, StatCard, Stars } from '../../components/ui'

export default function SellerDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['seller-dashboard'],
    queryFn: async () => (await api.get('/seller/dashboard')).data,
  })

  if (isLoading) return <Loading label="Loading seller dashboard…" />
  if (!data) return <p className="text-sm text-slate-500">The seller dashboard could not be loaded.</p>

  const stats = data.stats
  const maxSales = Math.max(1, ...(data.monthly_sales || []).map((m: any) => Number(m.sales)))

  return (
    <div>
      <PageHeader
        eyebrow="Seller center"
        title={`Welcome back, ${data.store?.name || 'seller'}`}
        subtitle="Monitor orders, stock, payouts, and store performance."
        actions={<><LinkButton to="/seller/products/new" size="sm">+ Add product</LinkButton><LinkButton to="/seller/reports" size="sm" variant="secondary">Sales report</LinkButton></>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gross sales" value={money(stats.gross_sales)} hint="Excluding cancelled orders" icon="৳" tone="brand" />
        <StatCard label="Net payable" value={money(stats.net_payable)} hint={`Commission ${money(stats.commission)}`} tone="green" icon="✓" />
        <StatCard label="Orders" value={stats.orders_total} hint={`${stats.pending_orders} need action`} tone="amber" icon="📦" />
        <StatCard label="Open returns" value={stats.returns_open} hint={`${stats.low_stock} low-stock variants`} tone="red" icon="↩" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Last 6 months</h2>
            <span className="text-[11px] text-slate-400">Sales in BDT</span>
          </div>
          <div className="mt-4 flex h-44 items-end gap-3">
            {(data.monthly_sales || []).map((month: any) => (
              <div key={month.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[9px] font-semibold text-slate-500">{compactMoney(month.sales)}</span>
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t-md bg-gradient-to-t from-brand-500 to-brand-300 transition-all" style={{ height: `${Math.max(3, (Number(month.sales) / maxSales) * 100)}%` }} title={`${month.month}: ${money(month.sales)}`} />
                </div>
                <span className="text-[9px] text-slate-400">{month.month.slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Low stock</h2>
            <Link to="/seller/products" className="text-[11px] font-semibold text-brand-600 hover:underline">Manage →</Link>
          </div>
          {!data.low_stock_items?.length ? (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">All approved variants are above their low-stock threshold.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {data.low_stock_items.map((item: any) => (
                <li key={item.variant_id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-700">{item.product_name}</p>
                    <p className="truncate text-[10px] text-slate-500">{item.variant_name} · threshold {item.threshold}</p>
                  </div>
                  <Badge tone={item.available <= 0 ? 'red' : 'amber'}>{item.available} left</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Recent orders</h2>
            <Link to="/seller/orders" className="text-[11px] font-semibold text-brand-600 hover:underline">All orders →</Link>
          </div>
          {!data.recent_orders?.length ? (
            <p className="px-4 py-8 text-center text-xs text-slate-500">No orders yet. Publish products to start selling.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Payable</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {data.recent_orders.map((order: any) => (
                    <tr key={order.id}>
                      <td><Link to={`/seller/orders/${order.id}`} className="font-mono text-xs font-semibold text-brand-600 hover:underline">{order.order_number}</Link><p className="text-[10px] text-slate-400">{date(order.placed_at)}</p></td>
                      <td className="text-xs">{order.customer || '—'}</td>
                      <td className="text-xs">{order.items_count}</td>
                      <td className="text-xs font-semibold">{money(order.seller_payable)}</td>
                      <td><Badge tone={order.status === 'delivered' ? 'green' : 'amber'}>{order.status_label}</Badge></td>
                      <td><Link to={`/seller/orders/${order.id}`} className="text-[11px] font-semibold text-brand-600 hover:underline">Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Quick actions</h2>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                ['/seller/products/new', 'Add product'],
                ['/seller/orders', 'Process orders'],
                ['/seller/returns', 'Handle returns'],
                ['/seller/settlements', 'Settlements'],
                ['/seller/reports', 'Sales report'],
                ['/seller/store', 'Store settings'],
              ].map(([to, label]) => (
                <Link key={to} to={to} className="rounded-lg border border-slate-200 px-2.5 py-2 text-center text-[11px] font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-600">{label}</Link>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Store status</h2>
            <div className="mt-2 space-y-1.5 text-xs text-slate-600">
              <p className="flex justify-between"><span>Store</span><span className="font-semibold text-slate-800">{data.store?.name}</span></p>
              <p className="flex justify-between"><span>Status</span><Badge tone="green">{data.store?.status}</Badge></p>
              <p className="flex justify-between"><span>Products</span><span className="font-semibold">{stats.products}</span></p>
              <p className="flex justify-between"><span>Pending review</span><span className="font-semibold">{stats.products_pending}</span></p>
              <p className="flex justify-between"><span>Delivered orders</span><span className="font-semibold">{stats.delivered_orders}</span></p>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Seller tips</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-500">
              <li>Ship quickly — pending orders affect your reliability.</li>
              <li>Keep stock counts accurate; overselling is blocked at checkout.</li>
              <li>Add tracking events so customers can follow delivery.</li>
              <li>Respond to return requests with a clear note.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
