import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { date, money } from '../../lib/format'
import { Badge, EmptyState, ErrorState, Input, Loading, PageHeader, Pagination } from '../../components/ui'

export default function AdminOrdersPage() {
  const [filters, setFilters] = useState({ status: '', payment_status: '', search: '', from: '', to: '' })
  const [draft, setDraft] = useState(filters)
  const [page, setPage] = useState(1)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-orders', filters, page],
    queryFn: async () => (await api.get('/admin/orders', { params: { ...filters, page } })).data.orders,
    placeholderData: keepPreviousData,
  })

  const orders = data?.data || []
  const meta = data?.meta || {}

  return (
    <div>
      <PageHeader eyebrow="Administration" title="Orders" subtitle="Every marketplace order across all sellers. Use the detail page to manage status, COD collection, notes, and cancellations." />

      <form onSubmit={(e) => { e.preventDefault(); setFilters(draft); setPage(1) }} className="card mb-3 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <Input placeholder="Order number or customer email" value={draft.search} onChange={(e) => setDraft((prev) => ({ ...prev, search: e.target.value }))} />
        <select className="input" value={draft.status} onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}>
          <option value="">Any order status</option>
          {['pending_confirmation', 'confirmed', 'processing', 'ready_to_ship', 'shipped', 'delivered', 'completed', 'cancelled'].map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="input" value={draft.payment_status} onChange={(e) => setDraft((prev) => ({ ...prev, payment_status: e.target.value }))}>
          <option value="">Any payment status</option>
          {['cod_pending', 'paid', 'failed', 'refunded', 'partially_refunded'].map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
        </select>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">From<input type="date" className="input mt-1" value={draft.from} onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))} /></label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">To<input type="date" className="input mt-1" value={draft.to} onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))} /></label>
        <div className="flex items-end gap-1.5">
          <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">Filter</button>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => { const empty = { status: '', payment_status: '', search: '', from: '', to: '' }; setDraft(empty); setFilters(empty); setPage(1) }}>Reset</button>
        </div>
      </form>

      {isLoading ? <Loading label="Loading orders…" /> : error ? (
        <ErrorState message="Orders could not be loaded." onRetry={() => refetch()} />
      ) : !orders.length ? (
        <EmptyState title="No orders matched" description="Adjust the filters or date range." />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Order</th><th>Customer</th><th>Sellers</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Placed</th><th></th></tr></thead>
              <tbody>
                {orders.map((order: any) => (
                  <tr key={order.id}>
                    <td><Link to={`/admin/orders/${order.id}`} className="font-mono text-xs font-semibold text-brand-600 hover:underline">{order.order_number}</Link></td>
                    <td><p className="text-xs font-medium text-slate-700">{order.customer}</p><p className="text-[10px] text-slate-400">{order.email}</p></td>
                    <td className="max-w-[160px] text-[11px] text-slate-500">{(order.sellers || []).join(', ')}</td>
                    <td className="text-xs">{order.items_count}</td>
                    <td className="text-xs font-semibold">{money(order.grand_total)}</td>
                    <td><Badge tone={order.payment_status === 'paid' ? 'green' : order.payment_status === 'failed' ? 'red' : 'amber'}>{order.payment_status.replace(/_/g, ' ')}</Badge></td>
                    <td><Badge tone={order.status_tone}>{order.status_label}</Badge></td>
                    <td className="text-[11px] text-slate-500">{date(order.placed_at)}</td>
                    <td><Link to={`/admin/orders/${order.id}`} className="text-[11px] font-semibold text-brand-600 hover:underline">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 pb-3"><Pagination page={meta.current_page || 1} lastPage={meta.last_page || 1} total={meta.total} onChange={setPage} /></div>
        </div>
      )}
    </div>
  )
}
