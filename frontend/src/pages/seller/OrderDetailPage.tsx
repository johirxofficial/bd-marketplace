import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { dateTime, money } from '../../lib/format'
import type { SellerOrder } from '../../lib/types'
import { Badge, Button, ErrorState, Field, Input, Loading, Modal, PageHeader, Textarea, useToast } from '../../components/ui'

const statusFlow: Record<string, { next: string; label: string } | null> = {
  pending_confirmation: { next: 'confirmed', label: 'Confirm order' },
  confirmed: { next: 'processing', label: 'Start processing' },
  processing: { next: 'ready_to_ship', label: 'Mark ready to ship' },
  ready_to_ship: null,
  shipped: null,
  delivered: null,
  completed: null,
  cancelled: null,
}

const trackingStatuses = ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned_to_origin']

export default function SellerOrderDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [shipOpen, setShipOpen] = useState(false)
  const [shipForm, setShipForm] = useState({ courier_name: '', tracking_number: '', location: '', note: '' })
  const [eventFor, setEventFor] = useState<number | null>(null)
  const [eventForm, setEventForm] = useState({ status: 'in_transit', location: '', note: '' })

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ['seller-order', id],
    queryFn: async () => (await api.get(`/seller/orders/${id}`)).data.order as SellerOrder,
    enabled: !!id,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['seller-order', id] })
    queryClient.invalidateQueries({ queryKey: ['seller-orders'] })
    queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] })
  }

  const transition = useMutation({
    mutationFn: async (status: string) => (await api.patch(`/seller/orders/${id}/status`, { status, note: `Seller moved order to ${status}` })).data,
    onSuccess: (data) => { refresh(); push(data.message || 'Order status updated.') },
    onError: (err) => push(apiError(err, 'The status could not be updated.'), 'error'),
  })

  const createShipment = useMutation({
    mutationFn: async () => (await api.post(`/seller/orders/${id}/shipments`, shipForm)).data,
    onSuccess: () => {
      refresh()
      setShipOpen(false)
      setShipForm({ courier_name: '', tracking_number: '', location: '', note: '' })
      push('Shipment created. The order is now marked shipped.')
    },
    onError: (err) => push(apiError(err, 'The shipment could not be created.'), 'error'),
  })

  const addEvent = useMutation({
    mutationFn: async () => (await api.post(`/seller/shipments/${eventFor}/tracking`, eventForm)).data,
    onSuccess: () => {
      refresh()
      setEventFor(null)
      setEventForm({ status: 'in_transit', location: '', note: '' })
      push('Tracking event recorded.')
    },
    onError: (err) => push(apiError(err, 'The tracking event could not be added.'), 'error'),
  })

  if (isLoading) return <Loading label="Loading order…" />
  if (error || !order) return <ErrorState message="This order could not be loaded or does not belong to your store." onRetry={() => refetch()} />

  const flow = statusFlow[order.status]
  const address = order.shipping_address || {}
  const commission = (order as any).commission

  return (
    <div>
      <PageHeader
        eyebrow="Seller center"
        title={`Order ${order.order_number}`}
        subtitle={`Placed ${dateTime(order.placed_at)} · ${order.items?.length || 0} item(s)`}
        actions={<><Link to="/seller/orders" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">← All orders</Link></>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={order.status_tone}>{order.status_label}</Badge>
        <Badge tone={order.payment_status === 'paid' ? 'green' : 'amber'}>{order.payment_status === 'paid' ? 'COD collected' : 'COD pending'}</Badge>
        {flow && <Button size="sm" loading={transition.isPending} onClick={() => transition.mutate(flow.next)}>{flow.label}</Button>}
        {order.status === 'ready_to_ship' && <Button size="sm" variant="dark" onClick={() => setShipOpen(true)}>Create shipment</Button>}
        {order.status === 'shipped' && <span className="text-[11px] text-slate-500">Add tracking events below to record delivery.</span>}
        {order.status === 'pending_confirmation' && <span className="text-[11px] text-amber-700">Confirm this order to begin fulfilment.</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-bold text-slate-900">Items</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {(order.items || []).map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                    {item.image_url ? <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800">{item.product_name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{item.variant_name} · Qty {item.quantity}</p>
                    <p className="font-mono text-[10px] text-slate-400">{item.sku}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-semibold text-slate-800">{money(item.line_total)}</p>
                    <p className="text-[10px] text-slate-400">{money(item.unit_price)} each</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 px-4 py-3">
              <dl className="ml-auto max-w-xs space-y-1 text-xs">
                <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
                <div className="flex justify-between text-slate-600"><dt>Discount</dt><dd>−{money(order.discount_total || 0)}</dd></div>
                <div className="flex justify-between text-slate-600"><dt>Commission</dt><dd>−{money(order.commission_amount || 0)}</dd></div>
                <div className="flex justify-between border-t border-slate-100 pt-1 font-bold text-slate-900"><dt>Your payable</dt><dd className="text-emerald-700">{money(order.seller_payable)}</dd></div>
              </dl>
            </div>
          </div>

          {!!order.shipments?.length && (
            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-900">Shipments & tracking</h2>
              <div className="mt-2 space-y-3">
                {order.shipments.map((shipment) => (
                  <div key={shipment.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{shipment.courier_name}</p>
                        <p className="font-mono text-[10px] text-slate-500">{shipment.tracking_number || 'No tracking number'} · <span className="capitalize">{shipment.status.replace(/_/g, ' ')}</span></p>
                      </div>
                      <Button size="xs" variant="secondary" onClick={() => setEventFor(shipment.id)}>+ Tracking event</Button>
                    </div>
                    {!!shipment.events?.length && (
                      <ol className="mt-2 space-y-1.5 border-l border-slate-200 pl-3">
                        {shipment.events.map((event, index) => (
                          <li key={index} className="relative text-[11px] text-slate-500">
                            <span className="absolute -left-[17px] top-1 h-1.5 w-1.5 rounded-full bg-brand-500" />
                            <span className="font-semibold capitalize text-slate-700">{event.status.replace(/_/g, ' ')}</span>
                            {event.location ? ` · ${event.location}` : ''}
                            <span className="block text-[10px] text-slate-400">{dateTime(event.happened_at)}{event.note ? ` · ${event.note}` : ''}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Customer & delivery</h2>
            <div className="mt-2 grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Customer</p>
                <p className="mt-0.5 font-semibold text-slate-700">{order.customer || 'Customer'}</p>
                <p className="text-slate-500">{order.customer_phone || address.phone || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Ship to</p>
                <p className="mt-0.5 font-semibold text-slate-700">{address.recipient_name || address.name}</p>
                <p className="leading-relaxed text-slate-500">{address.street_address}{address.area ? `, ${address.area}` : ''}{address.upazila ? `, ${address.upazila}` : ''}, {address.district}, {address.division}</p>
              </div>
            </div>
            {order.customer_note && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800"><span className="font-bold">Customer note: </span>{order.customer_note}</p>}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Fulfilment checklist</h2>
            <ol className="mt-2 space-y-1.5 text-[11px] text-slate-600">
              {[
                ['Confirm order', ['pending_confirmation']],
                ['Start processing', ['confirmed']],
                ['Pack and mark ready', ['processing']],
                ['Create shipment', ['ready_to_ship']],
                ['Add tracking events', ['shipped']],
                ['Delivery recorded', ['delivered', 'completed']],
              ].map(([label, states]) => {
                const done = !states.includes(order.status) && !['cancelled'].includes(order.status)
                const current = states.includes(order.status)
                return (
                  <li key={label as string} className="flex items-center gap-2">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${done ? 'bg-emerald-100 text-emerald-700' : current ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{done ? '✓' : current ? '•' : ''}</span>
                    <span className={current ? 'font-semibold text-slate-800' : ''}>{label as string}</span>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Commission</h2>
            <dl className="mt-2 space-y-1 text-xs text-slate-600">
              <div className="flex justify-between"><dt>Rate</dt><dd className="font-semibold">{commission?.rate ?? order.commission_rate ?? '—'}%</dd></div>
              <div className="flex justify-between"><dt>Amount</dt><dd>{money(order.commission_amount || 0)}</dd></div>
              <div className="flex justify-between"><dt>Status</dt><dd className="capitalize">{commission?.status || 'pending'}</dd></div>
            </dl>
            <p className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500">Commission is calculated on the discounted item subtotal. Settlement includes delivered orders only.</p>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Need to cancel?</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Sellers cannot cancel an order from this screen. Ask the marketplace administrator to cancel if the order cannot be fulfilled. Shipped orders cannot be cancelled.</p>
            <Link to="/account/support" className="mt-2 inline-block text-[11px] font-semibold text-brand-600 hover:underline">Contact support →</Link>
          </div>
        </aside>
      </div>

      <Modal open={shipOpen} onClose={() => setShipOpen(false)} title="Create shipment" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setShipOpen(false)}>Cancel</Button>
          <Button size="sm" loading={createShipment.isPending} disabled={!shipForm.courier_name} onClick={() => createShipment.mutate()}>Create shipment</Button>
        </>
      }>
        <div className="space-y-3">
          <p className="rounded bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Creating a shipment marks the order as shipped and reserves the tracking record. Record the delivery event once the parcel reaches the customer.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Courier name" required><Input value={shipForm.courier_name} onChange={(e) => setShipForm((prev) => ({ ...prev, courier_name: e.target.value }))} maxLength={100} placeholder="e.g. Pathao, Steadfast" /></Field>
            <Field label="Tracking number"><Input value={shipForm.tracking_number} onChange={(e) => setShipForm((prev) => ({ ...prev, tracking_number: e.target.value }))} maxLength={80} /></Field>
            <Field label="Origin location"><Input value={shipForm.location} onChange={(e) => setShipForm((prev) => ({ ...prev, location: e.target.value }))} maxLength={120} placeholder="e.g. Dhaka warehouse" /></Field>
            <Field label="Note"><Input value={shipForm.note} onChange={(e) => setShipForm((prev) => ({ ...prev, note: e.target.value }))} maxLength={255} /></Field>
          </div>
        </div>
      </Modal>

      <Modal open={!!eventFor} onClose={() => setEventFor(null)} title="Add tracking event" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setEventFor(null)}>Cancel</Button>
          <Button size="sm" loading={addEvent.isPending} onClick={() => addEvent.mutate()}>Record event</Button>
        </>
      }>
        <div className="space-y-3">
          <Field label="Status" required hint="Selecting “delivered” completes the shipment and marks the order delivered.">
            <select className="input" value={eventForm.status} onChange={(e) => setEventForm((prev) => ({ ...prev, status: e.target.value }))}>
              {trackingStatuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Location"><Input value={eventForm.location} onChange={(e) => setEventForm((prev) => ({ ...prev, location: e.target.value }))} maxLength={120} /></Field>
          <Field label="Note"><Textarea value={eventForm.note} onChange={(e) => setEventForm((prev) => ({ ...prev, note: e.target.value }))} maxLength={255} /></Field>
        </div>
      </Modal>
    </div>
  )
}
