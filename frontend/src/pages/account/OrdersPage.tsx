import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { date, money } from '../../lib/format'
import type { Order } from '../../lib/types'
import { Badge, Button, EmptyState, ErrorState, Loading, Pagination, cn } from '../../components/ui'

const tabs = [
  ['', 'All orders'],
  ['pending_confirmation', 'Pending'],
  ['confirmed', 'Confirmed'],
  ['processing', 'Processing'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
]

export default function OrdersPage() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['orders', status, page],
    queryFn: async () => (await api.get('/orders', { params: { status: status || undefined, page, per_page: 10 } })).data,
    placeholderData: keepPreviousData,
  })

  const orders: Order[] = data?.data || []
  const meta = data?.meta || {}

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">My orders</h2>
          <p className="mt-0.5 text-xs text-slate-500">Track delivery, request returns, and review delivered items.</p>
        </div>
        <Link to="/products" className="text-xs font-semibold text-brand-600 hover:underline">Continue shopping →</Link>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            onClick={() => { setStatus(value); setPage(1) }}
            className={cn(
              'whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
              status === value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
            )}
          >{label}</button>
        ))}
      </div>

      {isLoading ? <Loading label="Loading orders…" /> : error ? (
        <ErrorState message="Your orders could not be loaded." onRetry={() => refetch()} />
      ) : !orders.length ? (
        <EmptyState
          title={status ? 'No orders with this status' : 'No orders yet'}
          description="When you place an order it will appear here with live status and tracking."
          action={<Link to="/products" className="inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">Browse products</Link>}
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-mono font-bold text-slate-800">{order.order_number}</span>
                  <span className="text-slate-500">Placed {date(order.placed_at)}</span>
                  <span className="text-slate-500">{order.items?.length || 0} item(s)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={order.payment_status_tone}>{order.payment_status_label}</Badge>
                  <Badge tone={order.status_tone}>{order.status_label}</Badge>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {(order.items || []).slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                      {item.image_url ? <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-xs font-semibold text-slate-700">{item.product_name}</p>
                      <p className="text-[10px] text-slate-500">{item.variant_name} · Qty {item.quantity}</p>
                    </div>
                    <p className="text-xs font-semibold text-slate-700">{money(item.line_total)}</p>
                  </div>
                ))}
                {(order.items?.length || 0) > 3 && <p className="px-4 py-1.5 text-[11px] text-slate-400">+ {(order.items?.length || 0) - 3} more item(s)</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
                <p className="text-xs text-slate-500">Total <span className="ml-1 text-sm font-bold text-slate-900">{money(order.grand_total)}</span> · <span className="text-amber-700">{order.payment_method_name || order.payment_method?.toUpperCase() || 'COD'}</span></p>
                <div className="flex gap-2">
                  <Link to={`/account/orders/${order.order_number}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">View details</Link>
                  {['shipped'].includes(order.status) && <Link to={`/account/orders/${order.order_number}`} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800">Track order</Link>}
                </div>
              </div>
            </div>
          ))}
          <Pagination page={meta.current_page || 1} lastPage={meta.last_page || 1} total={meta.total} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
