import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { money } from '../lib/format'
import type { Address, PaymentMethod } from '../lib/types'
import { AddressForm, type AddressPayload } from '../components/AddressForm'
import { Button, EmptyState, Field, Loading, Modal, useToast } from '../components/ui'

type QuoteLine = {
  cart_item_id: number
  product_name: string
  variant_name: string
  sku: string
  image_url: string | null
  quantity: number
  unit_price: string
  line_total: string
}

type Quote = {
  items: QuoteLine[]
  stores: {
    store_id: number
    store_name: string
    shipping_total: string
    estimated_days_min: number
    estimated_days_max: number
    free_shipping_threshold: string | null
    items: QuoteLine[]
  }[]
  subtotal: string
  promotion_discount: string
  coupon_discount: string
  discount_total: string
  shipping_total: string
  tax_total: string
  payment_fee?: string
  grand_total: string
  coupon: { code: string; discount: string } | null
  coupon_error: string | null
  shipping_zone: { name: string; division: string; district: string; estimated_days_min: number; estimated_days_max: number } | null
}

function makeKey() {
  const base = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `checkout-${base}`
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [idempotencyKey] = useState(makeKey)
  const [addressId, setAddressId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [senderNumber, setSenderNumber] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [showAddressForm, setShowAddressForm] = useState(false)

  const { data: addresses, isLoading: loadingAddresses } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => (await api.get('/addresses')).data.addresses as Address[],
  })

  const { data: cart } = useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.get('/cart')).data.cart,
  })

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => (await api.get('/payment-methods')).data.payment_methods as PaymentMethod[],
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (paymentMethods.length && !paymentMethods.some((method) => method.code === paymentMethod)) {
      setPaymentMethod(paymentMethods[0].code)
    }
  }, [paymentMethods, paymentMethod])

  const selectedMethod = paymentMethods.find((method) => method.code === paymentMethod)

  useEffect(() => {
    if (addresses?.length && addressId === null) {
      setAddressId((addresses.find((a) => a.is_default) || addresses[0]).id)
    }
  }, [addresses, addressId])

  const { data: quoteData, isFetching: quoting, error: quoteError } = useQuery({
    queryKey: ['checkout-quote', addressId, couponCode, paymentMethod],
    queryFn: async () => (await api.post('/checkout/quote', { address_id: addressId, coupon_code: couponCode || undefined, payment_method: paymentMethod })).data,
    enabled: !!addressId && !!paymentMethod,
    retry: false,
  })

  const quote: Quote | null = quoteData?.quote || null

  const placeOrder = useMutation({
    mutationFn: async () => (await api.post('/checkout', {
      address_id: addressId,
      coupon_code: couponCode || undefined,
      payment_method: paymentMethod,
      sender_number: senderNumber || undefined,
      transaction_id: transactionId || undefined,
      customer_note: note || undefined,
      idempotency_key: idempotencyKey,
    })).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] })

      if (data?.payment?.redirect_url) {
        window.location.assign(data.payment.redirect_url)
        return
      }

      push(data.message || 'Order placed successfully.', 'success')
      navigate(`/account/orders/${data.order.order_number}?placed=1`)
    },
    onError: (err) => push(apiError(err, 'The order could not be placed. Please review your details and try again.'), 'error'),
  })

  const addAddress = useMutation({
    mutationFn: async (payload: AddressPayload) => (await api.post('/addresses', payload)).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] })
      setAddressId(data.address.id)
      setShowAddressForm(false)
      push('Delivery address saved.')
    },
  })

  const lines = useMemo(() => quote?.items || [], [quote])

  if (loadingAddresses) return <Loading label="Preparing checkout…" />

  if (!cart?.items?.length) {
    return (
      <div className="container-page py-10">
        <EmptyState
          title="Your cart is empty"
          description="Add at least one item before checking out."
          action={<Link to="/products" className="inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">Browse products</Link>}
        />
      </div>
    )
  }

  return (
    <div className="container-page py-5">
      <div className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">Secure checkout</p>
        <h1 className="mt-0.5 text-xl font-bold text-slate-900 sm:text-2xl">Confirm your order</h1>
        <p className="mt-1 text-sm text-slate-500">Choose Cash on Delivery, a mobile wallet, Bangla QR, or an online gateway. Totals include any payment fee.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">1. Delivery address</h2>
              <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => setShowAddressForm(true)}>+ Add new</button>
            </div>
            {!addresses?.length ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-center">
                <p className="text-sm text-slate-600">You need a delivery address before placing an order.</p>
                <Button size="sm" className="mt-2" onClick={() => setShowAddressForm(true)}>Add delivery address</Button>
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {addresses.map((address) => (
                  <label key={address.id} className={`block cursor-pointer rounded-lg border p-3 text-xs transition ${addressId === address.id ? 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-200' : 'border-slate-200 hover:border-slate-300'}`}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <input type="radio" name="address" checked={addressId === address.id} onChange={() => setAddressId(address.id)} className="h-3.5 w-3.5 text-brand-500 focus:ring-brand-400" />
                        <span className="font-bold text-slate-800">{address.label}</span>
                        {address.is_default && <span className="rounded bg-slate-200 px-1 py-0.5 text-[9px] font-semibold uppercase text-slate-600">Default</span>}
                      </span>
                    </span>
                    <span className="mt-1.5 block font-semibold text-slate-700">{address.recipient_name} · {address.phone}</span>
                    <span className="mt-0.5 block leading-relaxed text-slate-500">
                      {address.street_address}, {address.area ? `${address.area}, ` : ''}{address.upazila ? `${address.upazila}, ` : ''}{address.district}, {address.division}{address.postal_code ? ` ${address.postal_code}` : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">2. Payment method</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Secure</span>
            </div>
            <div className="mt-2 space-y-2">
              {paymentMethods.map((method) => {
                const active = paymentMethod === method.code
                const fee = Number(method.fee_amount || 0) + Number(method.fee_percent || 0)
                const icon = method.type === 'cod' ? '💵' : method.type === 'qr' ? '📱' : method.type === 'hosted' ? '💳' : '📲'
                return (
                  <div key={method.code}>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${active ? 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-200' : 'border-slate-200 hover:border-slate-300'}`}>
                      <input
                        type="radio"
                        name="payment_method"
                        className="mt-0.5 h-4 w-4 text-brand-500 focus:ring-brand-400"
                        checked={active}
                        onChange={() => setPaymentMethod(method.code)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm" aria-hidden="true">{icon}</span>
                          <span className="text-xs font-bold text-slate-800">{method.name}</span>
                          {method.requires_verification && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800">Verify</span>}
                          {fee > 0 ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                              Fee {Number(method.fee_amount || 0) > 0 ? money(method.fee_amount) : ''}{Number(method.fee_amount || 0) > 0 && Number(method.fee_percent || 0) > 0 ? ' + ' : ''}{Number(method.fee_percent || 0) > 0 ? `${method.fee_percent}%` : ''}
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">No extra fee</span>
                          )}
                        </span>
                        {method.description && <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{method.description}</span>}
                      </span>
                    </label>

                    {active && method.requires_verification && (
                      <div className="ml-6 mt-2 space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3">
                        {method.code === 'bkash_paybill' ? (
                          <p className="text-[11px] text-slate-600">
                            Pay <span className="font-semibold text-slate-800">{quote ? money(quote.grand_total) : 'the order total'}</span> with bKash Pay Bill
                            {method.config.biller_name ? <> to biller <span className="font-semibold text-brand-700">{String(method.config.biller_name)}</span></> : null}
                            {method.config.biller_id ? <span className="font-mono text-slate-500"> ({String(method.config.biller_id)})</span> : null}. Use your order number as the reference.
                          </p>
                        ) : method.type === 'qr' ? (
                          <p className="text-[11px] text-slate-600">
                            After placing the order, scan the Bangla QR and pay <span className="font-semibold text-slate-800">{quote ? money(quote.grand_total) : 'the order total'}</span>
                            {method.config.merchant_name ? <> to <span className="font-semibold text-brand-700">{String(method.config.merchant_name)}</span></> : null}. Use your order number as the reference.
                          </p>
                        ) : method.config?.merchant_number ? (
                          <p className="text-[11px] text-slate-600">
                            Send <span className="font-semibold text-slate-800">{quote ? money(quote.grand_total) : 'the order total'}</span> to{' '}
                            <span className="font-mono font-bold text-brand-700">{String(method.config.merchant_number)}</span>
                            {method.config.merchant_name ? <span className="text-slate-500"> ({String(method.config.merchant_name)})</span> : null}. Use your order number as the reference.
                          </p>
                        ) : null}
                        {method.instructions && <p className="whitespace-pre-line text-[10px] leading-relaxed text-slate-500">{method.instructions}</p>}
                        {method.type === 'qr' ? (
                          <p className="rounded bg-white px-2 py-1.5 text-[10px] text-slate-500 ring-1 ring-slate-200">
                            A scannable Bangla QR will appear after you place the order. Keep this page open until the order is confirmed.
                          </p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Field label="Sender number" hint="Optional — the number you paid from.">
                              <input className="input text-xs" value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="01XXXXXXXXX" maxLength={20} />
                            </Field>
                            <Field label="Transaction ID" hint="Optional now — you can submit it from the order page.">
                              <input className="input text-xs" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="e.g. 9F2K1L0ABC" maxLength={100} />
                            </Field>
                          </div>
                        )}
                      </div>
                    )}

                    {active && method.type === 'hosted' && (
                      <p className="ml-6 mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-[10px] text-slate-500">
                        You will be redirected to the secure payment gateway after placing the order. If the gateway is unavailable, you can retry from your order page.
                      </p>
                    )}
                  </div>
                )
              })}
              {!paymentMethods.length && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">No payment methods are currently available. Please contact support.</p>
              )}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">3. Order review</h2>
            <div className="mt-3 space-y-3">
              {lines.map((line) => (
                <div key={line.cart_item_id} className="flex gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                    {line.image_url ? <img src={line.image_url} alt={line.product_name} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="line-clamp-1 font-semibold text-slate-800">{line.product_name}</p>
                    <p className="text-[11px] text-slate-500">{line.variant_name} · Qty {line.quantity}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{line.sku}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{money(line.line_total)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">4. Delivery note <span className="font-normal text-slate-400">(optional)</span></h2>
            <Field className="mt-2" hint="Up to 1,000 characters. Do not include sensitive information.">
              <textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Landmark, preferred delivery window, or instructions for the courier." />
            </Field>
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Payment summary</h2>
            {quoting && <p className="mt-1 text-[11px] text-slate-400">Recalculating totals…</p>}
            {quoteError && <p className="mt-1 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{apiError(quoteError, 'This payment method is not available for your order.')}</p>}
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd>{money(quote?.subtotal ?? cart.subtotal)}</dd></div>
              {Number(quote?.discount_total || 0) > 0 && (
                <div className="flex justify-between text-emerald-700"><dt>Discounts</dt><dd>−{money(quote?.discount_total)}</dd></div>
              )}
              <div className="flex justify-between text-slate-600"><dt>Delivery fee</dt><dd>{quote ? money(quote.shipping_total) : '—'}</dd></div>
              {Number(quote?.payment_fee || 0) > 0 && (
                <div className="flex justify-between text-slate-600"><dt>Payment fee</dt><dd>{money(quote?.payment_fee)}</dd></div>
              )}
              {quote?.coupon_error && <p className="rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{quote.coupon_error}</p>}
              <div className="border-t border-slate-100 pt-2 text-base font-bold text-slate-900"><span>Total payable</span><span className="float-right text-brand-600">{money(quote?.grand_total ?? cart.subtotal)}</span></div>
            </dl>

            <div className="mt-3">
              <p className="label">Coupon code</p>
              <div className="flex gap-1.5">
                <input className="input text-xs uppercase" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Optional" maxLength={40} />
                {couponCode && <Button size="sm" variant="secondary" onClick={() => setCouponCode('')}>Clear</Button>}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">The coupon is validated again when you place the order.</p>
            </div>

            <Button className="mt-3 w-full" size="lg" loading={placeOrder.isPending} disabled={!quote || !addressId || !selectedMethod || !!quoteError} onClick={() => placeOrder.mutate()}>
              Place order · {money(quote?.grand_total ?? cart.subtotal)}
            </Button>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-400">
              By placing this order you agree to the <Link to="/returns-policy" className="link">returns policy</Link>. Your stock is reserved immediately and released if the order is cancelled.
            </p>
          </div>

          {quote?.shipping_zone && (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
              Delivery to <span className="font-semibold text-slate-700">{quote.shipping_zone.district}, {quote.shipping_zone.division}</span> · {quote.shipping_zone.estimated_days_min}–{quote.shipping_zone.estimated_days_max} days. Multiple sellers may ship separately.
            </p>
          )}
        </aside>
      </div>

      <Modal open={showAddressForm} onClose={() => setShowAddressForm(false)} title="Add delivery address">
        <AddressForm
          onSubmit={async (payload) => { await addAddress.mutateAsync(payload) }}
          onCancel={() => setShowAddressForm(false)}
        />
      </Modal>
    </div>
  )
}
