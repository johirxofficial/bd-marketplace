import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { date, money } from '../../lib/format'
import { Badge, EmptyState, ErrorState, Input, Loading, PageHeader, Pagination, cn } from '../../components/ui'

const tabs = [
  ['', 'All'],
  ['pending_confirmation', 'Needs action'],
  ['confirmed', 'Confirmed'],
  ['processing', 'Processing'],
  ['ready_to_ship', 'Ready to ship'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
]

export default function SellerOrdersPage() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['seller-orders', status, term, page],
    queryFn: async () => (await api.get('/seller/orders', { params: { status: status || undefined, search: term || undefined, page } })).data.orders,
    placeholderData: keepPreviousData,
  })

  const orders = data?.data || []
  const meta = data?.meta || {}

  return (
    <div>
      <PageHeader eyebrow="Seller center" title="Orders" subtitle="Confirm, process, and ship orders. Delivery is recorded through tracking events." />

      <div className="card mb-3 space-y-2 p-3">
        <form onSubmit={(e) => { e.preventDefault(); setTerm(search); setPage(1) }} className="flex gap-1.5">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by marketplace order number" />
          <button type="submit" className="shrink-0 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800">Search</button>
        </form>
        <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setStatus(value); setPage(1) }}
              className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold', status === value ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
            >{label}</button>
          ))}
        </div>
      </div>

      {isLoading ? <Loading label="Loading orders…" /> : error ? (
        <ErrorState message="Orders could not be loaded." onRetry={() => refetch()} />
      ) : !orders.length ? (
        <EmptyState title="No orders in this view" description="When customers buy your products, their orders appear here." />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Subtotal</th><th>Net payable</th><th>Status</th><th>Shipment</th><th></th></tr></thead>
              <tbody>
                {orders.map((order: any) => (
                  <tr key={order.id}>
                    <td>
                      <Link to={`/seller/orders/${order.id}`} className="font-mono text-xs font-semibold text-brand-600 hover:underline">{order.order_number}</Link>
                      <p className="text-[10px] text-slate-400">{date(order.placed_at)}</p>
                    </td>
                    <td className="text-xs">
                      {order.customer || '—'}
                      {order.customer_phone && <p className="text-[10px] text-slate-400">{order.customer_phone}</p>}
                    </td>
                    <td className="text-xs">{order.items_count}</td>
                    <td className="text-xs">{money(order.subtotal)}</td>
                    <td className="text-xs font-semibold text-slate-800">{money(order.seller_payable)}</td>
                    <td><Badge tone={order.status_tone}>{order.status_label}</Badge></td>
                    <td className="text-[11px] text-slate-500">
                      {order.shipment ? (
                        <span>{order.shipment.courier_name}<span className="block font-mono text-[10px]">{order.shipment.tracking_number}</span></span>
                      ) : 'Not shipped'}
                    </td>
                    <td><Link to={`/seller/orders/${order.id}`} className="text-[11px] font-semibold text-brand-600 hover:underline">Manage →</Link></td>
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
