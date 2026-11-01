import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { dateTime, money } from '../../lib/format'
import { ORDER_STATUSES, statusLabel } from '../../lib/bd'
import type { Order } from '../../lib/types'
import { Badge, Button, ErrorState, Field, Input, Loading, Modal, PageHeader, Textarea, useToast } from '../../components/ui'

type AdminNote = { note: string; actor?: string | null; at?: string | null }

const statusTone = (status: string) =>
  status === 'delivered' || status === 'completed' ? 'green'
    : status === 'cancelled' ? 'red'
      : ['shipped', 'ready_to_ship'].includes(status) ? 'blue'
        : 'amber'

const transitionOptions = ['confirmed', 'processing', 'ready_to_ship', 'shipped', 'delivered', 'completed']

export default function AdminOrderDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const { push } = useToast()

  const [codOpen, setCodOpen] = useState(false)
  const [codReference, setCodReference] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: async () => (await api.get(`/admin/orders/${id}`)).data as { order: Order; admin_note?: string | null; notes: AdminNote[] },
    enabled: !!id,
  })

  const order = data?.order

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin-order', id] })
    queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
  }

  const updateStatus = useMutation({
    mutationFn: async ({ sellerOrderId, status }: { sellerOrderId: number; status: string }) =>
      (await api.patch(`/admin/seller-orders/${sellerOrderId}/status`, { status, note: 'Updated from administration' })).data,
    onSuccess: (result) => {
      refresh()
      push(result.message || 'Order status updated.')
    },
    onError: (err) => push(apiError(err, 'The status could not be updated.'), 'error'),
  })

  const collectCod = useMutation({
    mutationFn: async () => (await api.post(`/admin/orders/${id}/cod-collected`, { reference: codReference || undefined })).data,
    onSuccess: () => {
      refresh()
      setCodOpen(false)
      setCodReference('')
      push('COD collection recorded against this order.')
    },
    onError: (err) => push(apiError(err, 'COD collection could not be recorded.'), 'error'),
  })

  const cancelOrder = useMutation({
    mutationFn: async () => (await api.post(`/admin/orders/${id}/cancel`, { reason: cancelReason })).data,
    onSuccess: () => {
      refresh()
      setCancelOpen(false)
      setCancelReason('')
      push('Order cancelled and reserved stock released.')
    },
    onError: (err) => push(apiError(err, 'This order could not be cancelled.'), 'error'),
  })

  const saveNote = useMutation({
    mutationFn: async () => (await api.post(`/admin/orders/${id}/notes`, { note })).data,
    onSuccess: () => {
      refresh()
      setNoteOpen(false)
      setNote('')
      push('Internal note saved.')
    },
    onError: (err) => push(apiError(err, 'The note could not be saved.'), 'error'),
  })

  if (isLoading) return <Loading label="Loading order…" />
  if (error || !order) return <ErrorState message="This order could not be loaded." onRetry={() => refetch()} />

  const address = order.shipping_address || {}
  const sellerOrders = order.seller_orders || []
  const cancellable = !['cancelled', 'delivered', 'completed'].includes(order.status)
  const canCollect = order.payment_status !== 'paid' && order.payment_status !== 'refunded'

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title={`Order ${order.order_number}`}
        subtitle={`Placed ${dateTime(order.placed_at)} · ${order.items?.length || 0} item(s) · ${order.payment_method?.toUpperCase()}`}
        actions={
          <>
            <Link to="/admin/orders" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">← All orders</Link>
            <Button size="sm" variant="secondary" onClick={() => setNoteOpen(true)}>Add note</Button>
            {canCollect && <Button size="sm" onClick={() => setCodOpen(true)}>Record COD collection</Button>}
            {cancellable && <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>Cancel order</Button>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={order.status_tone}>{order.status_label || statusLabel(order.status)}</Badge>
        <Badge tone={order.payment_status_tone}>{order.payment_status_label}</Badge>
        <span className="text-[11px] text-slate-500">Total <span className="font-semibold text-slate-800">{money(order.grand_total)}</span></span>
        {order.coupon_code && <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Coupon {order.coupon_code}</span>}
      </div>

      {data?.admin_note && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="font-bold">Internal note</p>
          <p className="mt-0.5 whitespace-pre-line">{data.admin_note}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <div className="space-y-4">
          {sellerOrders.map((sellerOrder) => (
            <div key={sellerOrder.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                <div>
                  <p className="text-xs font-bold text-slate-800">{sellerOrder.store?.name}</p>
                  <p className="text-[10px] text-slate-400">Seller order #{sellerOrder.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(sellerOrder.status)}>{sellerOrder.status_label}</Badge>
                  {!['cancelled', 'completed'].includes(sellerOrder.status) && (
                    <select
                      className="input max-w-[170px] !py-1 text-[11px]"
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return
                        if (window.confirm(`Move this seller order to “${statusLabel(e.target.value)}”?`)) {
                          updateStatus.mutate({ sellerOrderId: sellerOrder.id, status: e.target.value })
                        }
                      }}
                    >
                      <option value="">Change status…</option>
                      {transitionOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                    </select>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {(sellerOrder.items || []).map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                      {item.image_url ? <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800">{item.product_name}</p>
                      <p className="text-[10px] text-slate-500">{item.variant_name} · {item.sku} · Qty {item.quantity}</p>
                    </div>
                    <p className="text-xs font-semibold text-slate-700">{money(item.line_total)}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 border-t border-slate-100 px-4 py-3 text-[11px] sm:grid-cols-4">
                <div><p className="text-slate-400">Subtotal</p><p className="font-semibold text-slate-700">{money(sellerOrder.subtotal)}</p></div>
                <div><p className="text-slate-400">Discount</p><p className="font-semibold text-slate-700">−{money(sellerOrder.discount_total || 0)}</p></div>
                <div><p className="text-slate-400">Commission</p><p className="font-semibold text-rose-600">−{money(sellerOrder.commission_amount || 0)}</p></div>
                <div><p className="text-slate-400">Seller payable</p><p className="font-semibold text-emerald-700">{money(sellerOrder.seller_payable || 0)}</p></div>
              </div>

              {!!sellerOrder.shipments?.length && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Shipments</p>
                  {sellerOrder.shipments.map((shipment) => (
                    <div key={shipment.id} className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[11px]">
                      <p className="font-semibold text-slate-700">{shipment.courier_name} {shipment.tracking_number ? <span className="font-mono text-slate-500">· {shipment.tracking_number}</span> : null}</p>
                      <p className="capitalize text-slate-500">{shipment.status.replace(/_/g, ' ')}</p>
                      {!!shipment.events?.length && (
                        <ol className="mt-1.5 space-y-1 border-l border-slate-200 pl-3">
                          {shipment.events.map((event, index) => (
                            <li key={index} className="text-[10px] text-slate-500">
                              <span className="font-semibold capitalize text-slate-700">{event.status.replace(/_/g, ' ')}</span>
                              {event.location ? ` · ${event.location}` : ''} · {dateTime(event.happened_at)}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-2.5"><h2 className="text-sm font-bold text-slate-900">Payment & totals</h2></div>
            <dl className="space-y-1.5 px-4 py-3 text-xs">
              <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>Discount</dt><dd className="text-emerald-700">−{money(order.discount_total)}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>Delivery</dt><dd>{money(order.shipping_total)}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>Tax</dt><dd>{money(order.tax_total)}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-1.5 text-sm font-bold text-slate-900"><dt>Grand total</dt><dd className="text-brand-600">{money(order.grand_total)}</dd></div>
            </dl>
            {!!order.payment_transactions?.length && (
              <div className="border-t border-slate-100 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Payment records</p>
                {order.payment_transactions.map((payment) => (
                  <div key={payment.id} className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-slate-600">
                    <span>{payment.method_name || order.payment_method_name || payment.provider || payment.method_code} · <span className="capitalize">{payment.type}</span> · {payment.status}</span>
                    <span className="font-semibold">{money(payment.amount)}{payment.reference ? <span className="ml-1 font-mono text-[10px] text-slate-400">{payment.reference}</span> : null}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!!data?.notes?.length && (
            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-900">Internal notes history</h2>
              <ul className="mt-2 space-y-1.5">
                {data.notes.map((entry, index) => (
                  <li key={index} className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                    <p className="whitespace-pre-line">{entry.note}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{entry.actor || 'System'} · {dateTime(entry.at)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Customer</h2>
            <div className="mt-1.5 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">{order.customer?.name || '—'}</p>
              <p>{order.customer?.email}</p>
              <p>{order.customer?.phone || 'No phone'}</p>
            </div>
            {order.customer_note && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800"><span className="font-bold">Note: </span>{order.customer_note}</p>
            )}
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Delivery address</h2>
            <div className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-800">{address.recipient_name || address.name}</p>
              <p>{address.phone}</p>
              <p className="mt-1">{address.street_address}{address.area ? `, ${address.area}` : ''}{address.upazila ? `, ${address.upazila}` : ''}</p>
              <p>{address.district}, {address.division}{address.postal_code ? ` ${address.postal_code}` : ''}</p>
            </div>
          </div>

          {!!order.status_history?.length && (
            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-900">Status history</h2>
              <ol className="mt-2 space-y-2 border-l border-slate-200 pl-3">
                {order.status_history.map((entry, index) => (
                  <li key={index} className="relative text-[11px]">
                    <span className={`absolute -left-[17px] top-1 h-1.5 w-1.5 rounded-full ${index === 0 ? 'bg-brand-500' : 'bg-slate-300'}`} />
                    <p className="font-semibold text-slate-700">{statusLabel(entry.to_status)}</p>
                    <p className="text-[10px] text-slate-400">{dateTime(entry.created_at)} · {entry.actor_type}{entry.actor ? ` (${entry.actor})` : ''}</p>
                    {entry.note && <p className="mt-0.5 text-slate-500">{entry.note}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {!!order.returns?.length && (
            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-900">Returns</h2>
              <div className="mt-2 space-y-1.5">
                {order.returns.map((ret) => (
                  <Link key={ret.id} to="/admin/returns" className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] hover:bg-slate-100">
                    <span className="font-mono font-semibold text-slate-700">{ret.return_number}</span>
                    <span className="text-slate-500">{money(ret.refund_amount)}</span>
                    <Badge tone={ret.status === 'refunded' ? 'green' : ret.status === 'rejected' ? 'red' : 'amber'}>{ret.status_label}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4 text-[11px] leading-relaxed text-slate-500">
            <h2 className="text-sm font-bold text-slate-900">Operational notes</h2>
            <p className="mt-1.5">Manual wallet and QR payments are verified from the Payment verification screen; only then does the order become paid. Recording a COD collection marks the order paid and creates a payment transaction — it does not move money outside the platform.</p>
            <p className="mt-1.5">Cancelling releases reserved inventory immediately. Shipped orders cannot be cancelled.</p>
          </div>
        </aside>
      </div>

      <Modal open={codOpen} onClose={() => setCodOpen(false)} title="Record COD collection" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setCodOpen(false)}>Cancel</Button>
          <Button size="sm" loading={collectCod.isPending} onClick={() => collectCod.mutate()}>Record collection</Button>
        </>
      }>
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p>Order <span className="font-mono font-semibold">{order.order_number}</span></p>
            <p>Amount due <span className="text-sm font-bold text-slate-900">{money(order.grand_total)}</span></p>
          </div>
          <Field label="Courier / cash reference" hint="Optional. Reference from the courier remittance sheet.">
            <Input value={codReference} onChange={(e) => setCodReference(e.target.value)} maxLength={100} placeholder="e.g. STF-2026-0042" />
          </Field>
          <p className="rounded bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800">Only record collection after the courier has remitted the cash. This action is audited.</p>
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this order" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setCancelOpen(false)}>Keep order</Button>
          <Button size="sm" variant="danger" loading={cancelOrder.isPending} disabled={cancelReason.trim().length < 5} onClick={() => cancelOrder.mutate()}>Cancel order</Button>
        </>
      }>
        <div className="space-y-3">
          <p className="text-xs text-slate-600">This releases all reserved stock across sellers. Delivered or completed orders cannot be cancelled.</p>
          <Field label="Cancellation reason" required hint="At least 5 characters. The customer sees the order as cancelled.">
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} />
          </Field>
        </div>
      </Modal>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Add an internal note" footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setNoteOpen(false)}>Cancel</Button>
          <Button size="sm" loading={saveNote.isPending} disabled={note.trim().length < 2} onClick={() => saveNote.mutate()}>Save note</Button>
        </>
      }>
        <div className="space-y-3">
          <p className="text-xs text-slate-600">Internal notes are visible to staff only and are recorded in the order history and audit log.</p>
          <Field label="Note" required>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Customer called to confirm the delivery address." />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
