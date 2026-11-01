import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { dateTime, money } from '../../lib/format'
import { RETURN_REASONS, statusLabel } from '../../lib/bd'
import type { Order, OrderItem } from '../../lib/types'
import { Badge, Button, ErrorState, Field, Loading, Modal, Stars, Textarea, useToast } from '../../components/ui'
import { PaymentPanel } from '../../components/PaymentPanel'

export default function OrderDetailPage() {
  const { orderNumber = '' } = useParams()
  const [params] = useSearchParams()
  const placed = params.get('placed') === '1'
  const queryClient = useQueryClient()
  const { push } = useToast()

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [returnItem, setReturnItem] = useState<OrderItem | null>(null)
  const [returnForm, setReturnForm] = useState({ quantity: 1, reason: RETURN_REASONS[0], description: '' })
  const [reviewItem, setReviewItem] = useState<OrderItem | null>(null)
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', comment: '' })

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ['order', orderNumber],
    queryFn: async () => (await api.get(`/orders/${orderNumber}`)).data.order as Order,
    enabled: !!orderNumber,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['order', orderNumber] })
    queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  const cancel = useMutation({
    mutationFn: async () => (await api.post(`/orders/${orderNumber}/cancel`, { reason: cancelReason })).data,
    onSuccess: () => {
      refresh()
      setCancelOpen(false)
      setCancelReason('')
      push('Order cancelled. Reserved stock has been released.')
    },
    onError: (err) => push(apiError(err, 'This order could not be cancelled.'), 'error'),
  })

  const confirmReceipt = useMutation({
    mutationFn: async () => (await api.post(`/orders/${orderNumber}/confirm-receipt`)).data,
    onSuccess: () => {
      refresh()
      push('Receipt confirmed. Thank you!')
    },
    onError: (err) => push(apiError(err, 'Receipt could not be confirmed.'), 'error'),
  })

  const requestReturn = useMutation({
    mutationFn: async () => (await api.post(`/orders/${orderNumber}/returns`, {
      order_item_id: returnItem?.id,
      quantity: returnForm.quantity,
      reason: returnForm.reason,
      description: returnForm.description || undefined,
    })).data,
    onSuccess: (data) => {
      refresh()
      setReturnItem(null)
      push(`Return ${data.return.return_number} submitted for review.`)
    },
    onError: (err) => push(apiError(err, 'The return request could not be submitted.'), 'error'),
  })

  const createReview = useMutation({
    mutationFn: async () => (await api.post(`/products/${reviewItem?.product_id}/reviews`, {
      order_item_id: reviewItem?.id,
      rating: reviewForm.rating,
      title: reviewForm.title || undefined,
      comment: reviewForm.comment,
    })).data,
    onSuccess: () => {
      refresh()
      setReviewItem(null)
      setReviewForm({ rating: 5, title: '', comment: '' })
      push('Review submitted. It will appear after moderation.')
    },
    onError: (err) => push(apiError(err, 'Your review could not be submitted.'), 'error'),
  })

  if (isLoading) return <Loading label="Loading order…" />
  if (error || !order) return <ErrorState message="This order could not be loaded or does not belong to your account." onRetry={() => refetch()} />

  const cancellable = ['pending_confirmation', 'confirmed', 'processing', 'ready_to_ship'].includes(order.status)
  const returnable = ['delivered', 'completed'].includes(order.status)
  const sellerOrders = order.seller_orders || []
  const address = order.shipping_address || {}
  const placedAt = dateTime(order.placed_at)

  return (
    <div className="space-y-4">
      {placed && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-bold">Order placed successfully 🎉</p>
          <p className="mt-0.5 text-xs">
            We reserved your stock and notified the sellers. {order.payment_status === 'paid'
              ? 'Your payment is confirmed.'
              : order.payment?.type === 'cod'
                ? 'Pay in cash when your parcel arrives.'
                : 'Complete the payment using the instructions below.'}{' '}
            Keep your order number handy: <span className="font-mono font-semibold">{order.order_number}</span>.
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-sm font-bold text-slate-900">{order.order_number}</h2>
              <Badge tone={order.status_tone}>{order.status_label || statusLabel(order.status)}</Badge>
              <Badge tone={order.payment_status_tone}>{order.payment_status_label}</Badge>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Placed {placedAt} · {order.items?.length || 0} item(s) · {order.payment_method_name || order.payment_method}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {order.receipt?.url && (
              <a href={order.receipt.url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                Receipt
              </a>
            )}
            {cancellable && <Button size="sm" variant="secondary" className="!text-rose-600" onClick={() => setCancelOpen(true)}>Cancel order</Button>}
            {order.status === 'delivered' && <Button size="sm" onClick={() => confirmReceipt.mutate()} loading={confirmReceipt.isPending}>Confirm receipt</Button>}
            <Link to="/account/orders" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">All orders</Link>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Items</h3>
              <div className="mt-2 space-y-3">
                {sellerOrders.length ? sellerOrders.map((so) => (
                  <div key={so.id} className="rounded-xl border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 px-3 py-2">
                      <p className="text-[11px] text-slate-600">Seller <span className="font-semibold text-slate-800">{so.store?.name}</span></p>
                      <Badge tone={so.status_tone}>{so.status_label}</Badge>
                    </div>
                    <div className="divide-y divide-slate-50 px-3">
                      {(so.items || []).map((item) => (
                        <div key={item.id} className="flex gap-3 py-3">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                            {item.image_url ? <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" /> : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-800">{item.product_name}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">{item.variant_name} · Qty {item.quantity}</p>
                            <p className="text-[10px] text-slate-400">{item.sku}</p>
                          </div>
                          <p className="text-xs font-semibold text-slate-700">{money(item.line_total)}</p>
                        </div>
                      ))}
                    </div>
                    {!!so.shipments?.length && (
                      <div className="border-t border-slate-100 px-3 py-2.5">
                        {so.shipments.map((shipment) => (
                          <div key={shipment.id} className="text-[11px]">
                            <p className="font-semibold text-slate-700">{shipment.courier_name} {shipment.tracking_number ? <span className="font-mono text-slate-500">· {shipment.tracking_number}</span> : null}</p>
                            {!!shipment.events?.length && (
                              <ol className="mt-1.5 space-y-1 border-l border-slate-200 pl-3">
                                {shipment.events.map((event, index) => (
                                  <li key={index} className="relative text-slate-500">
                                    <span className="absolute -left-[17px] top-1 h-1.5 w-1.5 rounded-full bg-brand-500" />
                                    <span className="font-semibold capitalize text-slate-700">{event.status.replace(/_/g, ' ')}</span>
                                    {event.location ? ` · ${event.location}` : ''}
                                    <span className="block text-[10px] text-slate-400">{dateTime(event.happened_at)}</span>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="rounded-xl border border-slate-200 px-3">
                    {(order.items || []).map((item) => (
                      <div key={item.id} className="flex gap-3 py-3">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                          {item.image_url ? <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800">{item.product_name}</p>
                          <p className="text-[11px] text-slate-500">{item.variant_name} · Qty {item.quantity}</p>
                        </div>
                        <p className="text-xs font-semibold text-slate-700">{money(item.line_total)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {returnable && !!order.items?.length && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Returns & reviews</h3>
                <div className="mt-2 space-y-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-700">{item.product_name}</p>
                        <p className="text-[10px] text-slate-500">{item.variant_name} · Qty {item.quantity}</p>
                      </div>
                      <div className="flex gap-1.5">
                        {item.can_review && (
                          <Button size="xs" variant="secondary" onClick={() => { setReviewItem(item); setReviewForm({ rating: 5, title: '', comment: '' }) }}>Write review</Button>
                        )}
                        {item.return_requested ? (
                          <Badge tone="amber">Return requested</Badge>
                        ) : (
                          <Button size="xs" variant="ghost" onClick={() => { setReturnItem(item); setReturnForm({ quantity: 1, reason: RETURN_REASONS[0], description: '' }) }}>Request return</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!!order.returns?.length && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Return requests</h3>
                <div className="mt-2 space-y-2">
                  {order.returns.map((ret) => (
                    <div key={ret.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <div>
                        <p className="font-mono font-semibold text-slate-700">{ret.return_number}</p>
                        <p className="text-[10px] text-slate-500">{ret.reason} · Qty {ret.quantity} · Refund {money(ret.refund_amount)}</p>
                      </div>
                      <Badge tone={statusLabel(ret.status) === 'Refunded' ? 'green' : 'amber'}>{ret.status_label}</Badge>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {order.customer_note && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Your delivery note</h3>
                <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{order.customer_note}</p>
              </section>
            )}
          </div>

          <aside className="space-y-3">
            <PaymentPanel order={order} onUpdated={refresh} />

            <div className="rounded-xl border border-slate-200 p-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment summary</h3>
              <dl className="mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
                <div className="flex justify-between text-slate-600"><dt>Discount</dt><dd className="text-emerald-700">−{money(order.discount_total)}</dd></div>
                <div className="flex justify-between text-slate-600"><dt>Delivery</dt><dd>{money(order.shipping_total)}</dd></div>
                {Number(order.tax_total) > 0 && <div className="flex justify-between text-slate-600"><dt>Tax</dt><dd>{money(order.tax_total)}</dd></div>}
                {Number(order.payment_fee || 0) > 0 && <div className="flex justify-between text-slate-600"><dt>Payment fee</dt><dd>{money(order.payment_fee)}</dd></div>}
                <div className="flex justify-between border-t border-slate-100 pt-1.5 text-sm font-bold text-slate-900"><dt>Total</dt><dd className="text-brand-600">{money(order.grand_total)}</dd></div>
              </dl>
              <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
                {order.payment_status === 'paid'
                  ? 'Payment collected. Thank you.'
                  : order.payment_status === 'awaiting_verification'
                    ? 'Payment reference received — our team is verifying it.'
                    : order.payment?.type === 'cod'
                      ? 'Cash on Delivery — pay the courier on arrival.'
                      : 'Payment is pending. Use the payment panel above to complete it.'}
                {order.coupon_code ? ` Coupon: ${order.coupon_code}.` : ''}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Delivery address</h3>
              <div className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                <p className="font-semibold text-slate-800">{address.recipient_name || address.name}</p>
                <p>{address.phone}</p>
                <p className="mt-1">{address.street_address}{address.area ? `, ${address.area}` : ''}{address.upazila ? `, ${address.upazila}` : ''}</p>
                <p>{address.district}, {address.division}{address.postal_code ? ` ${address.postal_code}` : ''}</p>
              </div>
            </div>

            {!!order.status_history?.length && (
              <div className="rounded-xl border border-slate-200 p-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Status history</h3>
                <ol className="mt-2 space-y-2 border-l border-slate-200 pl-3">
                  {order.status_history.map((entry, index) => (
                    <li key={index} className="relative text-[11px]">
                      <span className={`absolute -left-[17px] top-1 h-1.5 w-1.5 rounded-full ${index === 0 ? 'bg-brand-500' : 'bg-slate-300'}`} />
                      <p className="font-semibold capitalize text-slate-700">{String(entry.to_status).replace(/_/g, ' ')}</p>
                      <p className="text-[10px] text-slate-400">{dateTime(entry.created_at)} · {entry.actor_type}{entry.actor ? ` (${entry.actor})` : ''}</p>
                      {entry.note && <p className="mt-0.5 text-slate-500">{entry.note}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {!!order.payment_transactions?.length && (
              <div className="rounded-xl border border-slate-200 p-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment records</h3>
                <div className="mt-2 space-y-1.5 text-[11px]">
                  {order.payment_transactions.map((payment) => (
                    <div key={payment.id} className="flex justify-between gap-2 text-slate-600">
                      <span>{payment.method_name || order.payment_method_name || payment.provider || payment.method_code} · <span className="capitalize">{payment.type}</span></span>
                      <span className="font-semibold">{money(payment.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3.5 text-[11px] text-slate-600">
              <p className="font-bold text-slate-800">Need help with this order?</p>
              <p className="mt-0.5">Open a support ticket and include the order number.</p>
              <Link to="/account/support" className="mt-1.5 inline-block font-semibold text-brand-600 hover:underline">Contact support →</Link>
            </div>
          </aside>
        </div>
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this order" footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => setCancelOpen(false)}>Keep order</Button>
          <Button variant="danger" size="sm" loading={cancel.isPending} disabled={cancelReason.trim().length < 5} onClick={() => cancel.mutate()}>Cancel order</Button>
        </>
      }>
        <p className="text-xs text-slate-600">Cancelling releases reserved stock. This cannot be undone. If a parcel has already shipped, cancellation will be refused.</p>
        <Field label="Reason for cancellation" required hint="At least 5 characters." className="mt-3">
          <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} placeholder="Tell us why you need to cancel." />
        </Field>
      </Modal>

      <Modal open={!!returnItem} onClose={() => setReturnItem(null)} title="Request a return" footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => setReturnItem(null)}>Close</Button>
          <Button size="sm" loading={requestReturn.isPending} disabled={returnForm.description.length < 0} onClick={() => requestReturn.mutate()}>Submit return</Button>
        </>
      }>
        {returnItem && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <p className="font-semibold text-slate-800">{returnItem.product_name}</p>
              <p className="text-slate-500">{returnItem.variant_name} · purchased {returnItem.quantity}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Quantity to return" required>
                <input type="number" min={1} max={returnItem.quantity} className="input" value={returnForm.quantity} onChange={(e) => setReturnForm((prev) => ({ ...prev, quantity: Math.max(1, Math.min(returnItem.quantity, Number(e.target.value) || 1)) }))} />
              </Field>
              <Field label="Reason" required>
                <select className="input" value={returnForm.reason} onChange={(e) => setReturnForm((prev) => ({ ...prev, reason: e.target.value }))}>
                  {RETURN_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Description" hint="Condition, missing parts, and any other detail that helps the seller review the request.">
              <Textarea value={returnForm.description} onChange={(e) => setReturnForm((prev) => ({ ...prev, description: e.target.value }))} maxLength={2000} />
            </Field>
            <p className="rounded bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800">Returned items must be unused and complete. Refund amounts are calculated from the item's paid value. The seller reviews your request first.</p>
          </div>
        )}
      </Modal>

      <Modal open={!!reviewItem} onClose={() => setReviewItem(null)} title="Write a review" footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => setReviewItem(null)}>Close</Button>
          <Button size="sm" loading={createReview.isPending} disabled={reviewForm.comment.trim().length < 5} onClick={() => createReview.mutate()}>Submit review</Button>
        </>
      }>
        {reviewItem && (
          <div className="space-y-3">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800">{reviewItem.product_name}</p>
            <div>
              <p className="label">Rating</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} type="button" onClick={() => setReviewForm((prev) => ({ ...prev, rating: star }))} className={`text-2xl ${star <= reviewForm.rating ? 'text-amber-400' : 'text-slate-300'}`} aria-label={`${star} star`}>★</button>
                ))}
              </div>
            </div>
            <Field label="Title" hint="Optional">
              <input className="input" value={reviewForm.title} onChange={(e) => setReviewForm((prev) => ({ ...prev, title: e.target.value }))} maxLength={120} />
            </Field>
            <Field label="Your review" required hint="At least 5 characters. Reviews are moderated before publishing.">
              <Textarea value={reviewForm.comment} onChange={(e) => setReviewForm((prev) => ({ ...prev, comment: e.target.value }))} maxLength={2000} />
            </Field>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">Preview: <Stars rating={reviewForm.rating} /></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
