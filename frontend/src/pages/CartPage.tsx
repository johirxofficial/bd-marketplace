import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { money } from '../lib/format'
import type { Address } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { Button, EmptyState, ErrorState, Input, Loading, useToast } from '../components/ui'

type CartItem = {
  id: number
  product_name: string
  product_slug: string
  variant_name: string
  sku: string
  image_url: string | null
  store_name: string
  price: string
  original_price: string
  quantity: number
  line_total: string
  available_stock: number
  max_quantity: number
}

type Cart = {
  items: CartItem[]
  item_count: number
  subtotal: string
  coupon: { id: number; code: string; description?: string; type: string; value: string } | null
}

export default function CartPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [coupon, setCoupon] = useState('')

  const { data: cart, isLoading, error, refetch } = useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.get('/cart')).data.cart as Cart,
  })

  const { data: addresses } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => (await api.get('/addresses')).data.addresses as Address[],
    enabled: !!user,
  })

  const updateItem = useMutation({
    mutationFn: async ({ id, quantity }: { id: number; quantity: number }) =>
      (await api.patch(`/cart/items/${id}`, { quantity })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
    onError: (err) => push(apiError(err, 'Could not update the cart.'), 'error'),
  })

  const removeItem = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/cart/items/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      push('Item removed from cart.')
    },
    onError: (err) => push(apiError(err, 'Could not remove this item.'), 'error'),
  })

  const applyCoupon = useMutation({
    mutationFn: async () => (await api.post('/cart/coupon', { code: coupon })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      setCoupon('')
      push('Coupon applied. Final discount is calculated at checkout.', 'info')
    },
    onError: (err) => push(apiError(err, 'This coupon could not be applied.'), 'error'),
  })

  const removeCoupon = useMutation({
    mutationFn: async () => (await api.delete('/cart/coupon')).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      push('Coupon removed.')
    },
  })

  function goCheckout() {
    if (!user) {
      navigate('/login?next=%2Fcheckout')
      return
    }
    navigate('/checkout')
  }

  if (isLoading) return <Loading label="Loading your cart…" />
  if (error || !cart) return <div className="container-page py-8"><ErrorState message="Your cart could not be loaded." onRetry={() => refetch()} /></div>

  if (!cart.items.length) {
    return (
      <div className="container-page py-10">
        <EmptyState
          title="Your cart is empty"
          description="Browse the marketplace and add items. Every order is backed by our return policy and multiple payment options."
          action={<Link to="/products" className="inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">Start shopping</Link>}
        />
      </div>
    )
  }

  const groups = cart.items.reduce<Record<string, CartItem[]>>((acc, item) => {
    const key = item.store_name || 'Marketplace'
    acc[key] = acc[key] || []
    acc[key].push(item)
    return acc
  }, {})
  const defaultAddress = addresses?.find((a) => a.is_default) || addresses?.[0]
  const freeShippingThreshold = 2000

  return (
    <div className="container-page py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Your cart</h1>
          <p className="mt-1 text-sm text-slate-500">{cart.item_count} item{cart.item_count === 1 ? '' : 's'} from {Object.keys(groups).length} store{Object.keys(groups).length === 1 ? '' : 's'}</p>
        </div>
        <Link to="/products" className="text-xs font-semibold text-brand-600 hover:underline">← Continue shopping</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {Object.entries(groups).map(([store, items]) => (
            <div key={store} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                <p className="text-xs font-semibold text-slate-700">Sold by <span className="text-brand-700">{store}</span></p>
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Payment at checkout</span>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3 p-3 sm:p-4">
                    <Link to={`/products/${item.product_slug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                      {item.image_url ? <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[10px] text-slate-400">No image</span>}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/products/${item.product_slug}`} className="line-clamp-2 text-sm font-semibold text-slate-800 hover:text-brand-600">{item.product_name}</Link>
                      <p className="mt-0.5 text-[11px] text-slate-500">{item.variant_name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">{item.sku}</p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center overflow-hidden rounded-md border border-slate-300">
                          <button className="px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40" disabled={item.quantity <= 1} onClick={() => updateItem.mutate({ id: item.id, quantity: item.quantity - 1 })}>−</button>
                          <span className="min-w-7 text-center text-xs font-semibold tabular-nums">{item.quantity}</span>
                          <button className="px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40" disabled={item.quantity >= item.max_quantity} onClick={() => updateItem.mutate({ id: item.id, quantity: item.quantity + 1 })}>+</button>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-brand-600">{money(item.line_total)}</p>
                          {Number(item.original_price) > Number(item.price) && <p className="text-[10px] text-slate-400 line-through">{money(Number(item.original_price) * item.quantity)}</p>}
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <p className="text-[10px] text-slate-400">{item.available_stock} available</p>
                        <button className="text-[11px] font-semibold text-rose-600 hover:underline disabled:opacity-50" disabled={removeItem.isPending} onClick={() => removeItem.mutate(item.id)}>Remove</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Have a coupon?</p>
            {cart.coupon ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div>
                  <p className="text-xs font-bold text-emerald-800">{cart.coupon.code} applied</p>
                  <p className="text-[11px] text-emerald-700">{cart.coupon.type === 'percent' ? `${Number(cart.coupon.value)}% off eligible items` : `${money(cart.coupon.value)} off eligible items`} — exact discount is computed at checkout.</p>
                </div>
                <Button size="xs" variant="secondary" onClick={() => removeCoupon.mutate()} loading={removeCoupon.isPending}>Remove</Button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); if (coupon.trim()) applyCoupon.mutate() }} className="mt-2 flex gap-2">
                <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Enter coupon code" maxLength={40} />
                <Button type="submit" size="sm" disabled={!coupon.trim()} loading={applyCoupon.isPending}>Apply</Button>
              </form>
            )}
            <p className="mt-2 text-[10px] text-slate-400">Demo coupons: WELCOME10 (10% off) and FLAT100 (৳100 off). One coupon per order.</p>
          </div>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Order summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd className="font-semibold text-slate-800">{money(cart.subtotal)}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>Delivery</dt><dd className="text-xs text-slate-500">{defaultAddress ? 'Calculated at checkout' : 'Add an address'}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>Payment</dt><dd className="text-xs font-semibold text-amber-700">Chosen at checkout</dd></div>
              <div className="border-t border-slate-100 pt-2 text-base font-bold text-slate-900"><span>Estimated total</span><span className="float-right text-brand-600">{money(cart.subtotal)}</span></div>
            </dl>
            <Button className="mt-3 w-full" size="lg" onClick={goCheckout}>Proceed to checkout</Button>
            {!user && <p className="mt-2 text-center text-[11px] text-slate-500">You will be asked to sign in or create an account.</p>}
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
              Final shipping fee and discounts are calculated from your delivery district. Inventory is reserved only when you place the order.
            </p>
          </div>

          {Number(cart.subtotal) < freeShippingThreshold && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Add {money(freeShippingThreshold - Number(cart.subtotal))} more to qualify for free delivery in eligible zones (threshold varies by district).
            </p>
          )}

          {!defaultAddress && user && (
            <Link to="/account/addresses" className="block rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-center text-xs font-semibold text-brand-600 hover:border-brand-300">
              + Add a delivery address
            </Link>
          )}
        </aside>
      </div>
    </div>
  )
}
