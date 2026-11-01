import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { date, money } from '../../lib/format'
import type { Order } from '../../lib/types'
import { Badge, Button, Loading, StatCard } from '../../components/ui'
import { statusLabel } from '../../lib/bd'

export default function OverviewPage() {
  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', 'overview'],
    queryFn: async () => (await api.get('/orders', { params: { per_page: 5 } })).data,
  })

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'overview'],
    queryFn: async () => (await api.get('/notifications')).data,
  })

  const { data: addresses } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => (await api.get('/addresses')).data.addresses,
  })

  if (isLoading) return <Loading label="Loading your account…" />

  const list: Order[] = orders?.data || []
  const total = orders?.meta?.total || 0
  const active = list.filter((o) => !['delivered', 'completed', 'cancelled'].includes(o.status)).length
  const delivered = list.filter((o) => ['delivered', 'completed'].includes(o.status)).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total orders" value={total} icon="📦" />
        <StatCard label="Active orders" value={active} tone="amber" icon="🚚" />
        <StatCard label="Delivered" value={delivered} tone="green" icon="✓" />
        <StatCard label="Unread alerts" value={notifications?.unread_count || 0} tone="brand" icon="🔔" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Recent orders</h2>
            <Link to="/account/orders" className="text-xs font-semibold text-brand-600 hover:underline">View all →</Link>
          </div>
          {!list.length ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-slate-500">You have not placed an order yet.</p>
              <Link to="/products" className="mt-2 inline-flex rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">Start shopping</Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {list.map((order) => (
                <Link key={order.id} to={`/account/orders/${order.order_number}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-semibold text-slate-800">{order.order_number}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{date(order.placed_at)} · {order.items?.length || 0} item(s)</p>
                  </div>
                  <div className="text-right">
                    <Badge tone={order.status_tone}>{order.status_label || statusLabel(order.status)}</Badge>
                    <p className="mt-1 text-xs font-bold text-slate-800">{money(order.grand_total)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Delivery addresses</h2>
            {addresses?.length ? (
              <div className="mt-2 space-y-2">
                {addresses.slice(0, 2).map((address: any) => (
                  <div key={address.id} className="rounded-lg bg-slate-50 p-2.5 text-[11px]">
                    <p className="font-semibold text-slate-700">{address.label} {address.is_default && <span className="ml-1 rounded bg-slate-200 px-1 text-[9px] uppercase">Default</span>}</p>
                    <p className="mt-0.5 text-slate-500">{address.street_address}, {address.district}</p>
                  </div>
                ))}
                <Link to="/account/addresses" className="block text-xs font-semibold text-brand-600 hover:underline">Manage addresses →</Link>
              </div>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500">Add a delivery address before checkout.</p>
                <Link to="/account/addresses" className="mt-2 inline-flex rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">Add address</Link>
              </>
            )}
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Need help?</h2>
            <p className="mt-1 text-xs text-slate-500">Our support team can help with deliveries, returns, and account issues.</p>
            <div className="mt-2 space-y-1.5">
              <Button size="sm" variant="secondary" className="w-full" onClick={() => { window.location.href = '/account/support' }}>Open a support ticket</Button>
              <Link to="/support" className="block text-center text-xs font-semibold text-brand-600 hover:underline">Visit the help center</Link>
            </div>
          </div>

          <div className="card border-brand-100 bg-brand-50/40 p-4">
            <h2 className="text-sm font-bold text-slate-900">Want to sell?</h2>
            <p className="mt-1 text-xs text-slate-600">Apply for a seller account and manage your own store.</p>
            <Link to="/seller/apply" className="mt-2 inline-flex rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">Seller application</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
