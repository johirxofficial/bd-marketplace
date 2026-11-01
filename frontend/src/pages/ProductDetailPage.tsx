import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { date, price as formatPrice } from '../lib/format'
import type { Product } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { ProductCard } from '../components/ProductCard'
import { Badge, Button, ErrorState, Loading, Stars, useToast } from '../components/ui'

type ReviewList = {
  reviews: { data: { id: number; rating: number; title?: string; comment: string; reviewer: string; seller_reply?: string; created_at: string }[]; meta?: { last_page: number; current_page: number } }
  summary: { average: number; count: number }
}

export default function ProductDetailPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { push } = useToast()
  const queryClient = useQueryClient()
  const [variantId, setVariantId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [activeImage, setActiveImage] = useState(0)
  const [tab, setTab] = useState<'description' | 'specifications' | 'reviews'>('description')
  const [reviewPage, setReviewPage] = useState(1)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['product', slug],
    queryFn: async () => (await api.get(`/products/${slug}`)).data.product as Product,
    enabled: !!slug,
  })

  const { data: related } = useQuery({
    queryKey: ['product-related', slug],
    queryFn: async () => (await api.get(`/products/${slug}/related`)).data.products as Product[],
    enabled: !!slug,
    staleTime: 60_000,
  })

  const { data: reviewData } = useQuery({
    queryKey: ['product-reviews', slug, reviewPage],
    queryFn: async () => (await api.get(`/products/${slug}/reviews`, { params: { page: reviewPage } })).data as ReviewList,
    enabled: !!slug && tab === 'reviews',
  })

  const variants = useMemo(() => (data?.variants || []).filter((v) => v.is_active !== false), [data])
  const selected = variants.find((v) => v.id === variantId) || variants.find((v) => Number(v.stock) > 0) || variants[0]
  const price = selected?.effective_price || selected?.price || data?.effective_price || data?.price
  const compare = selected?.compare_at_price || data?.compare_at_price
  const stock = Number(selected?.stock ?? data?.stock ?? 0)
  const images = data?.images?.length ? data.images : data?.image_url ? [{ id: 0, path: '', url: data.image_url, alt_text: data.name, is_primary: true }] : []
  const discount = compare && Number(compare) > Number(price) ? Math.round((1 - Number(price) / Number(compare)) * 100) : Number(data?.discount_percent || 0)

  const addToCart = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select a variant first.')
      return (await api.post('/cart/items', { variant_id: selected.id, quantity })).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      push('Added to cart. Choose COD, bKash, Nagad, Rocket, or Bangla QR at checkout.', 'success')
    },
    onError: (err: unknown) => {
      if ((err as { response?: { status?: number } })?.response?.status === 401) {
        navigate(`/login?next=${encodeURIComponent(`/products/${slug}`)}`)
        return
      }
      push(apiError(err, 'Could not add this item to your cart.'), 'error')
    },
  })

  const addToWishlist = useMutation({
    mutationFn: async () => (await api.post(`/wishlist/${data!.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] })
      push('Saved to your wishlist.')
    },
    onError: (err: unknown) => {
      if ((err as { response?: { status?: number } })?.response?.status === 401) {
        navigate(`/login?next=${encodeURIComponent(`/products/${slug}`)}`)
        return
      }
      push(apiError(err, 'Could not save this product.'), 'error')
    },
  })

  async function buyNow() {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent('/checkout')}`)
      return
    }
    try {
      await addToCart.mutateAsync()
      navigate('/cart')
    } catch {
      /* handled by mutation */
    }
  }

  if (isLoading) return <Loading label="Loading product…" />
  if (error || !data) {
    return <div className="container-page py-10"><ErrorState message="This product is not available or could not be loaded." onRetry={() => refetch()} /></div>
  }

  const specifications = Array.isArray(data.specifications)
    ? data.specifications.map((row) => [row.name, row.value] as const)
    : Object.entries(data.specifications || {})
  const breakdown = data.review_summary?.breakdown || {}
  const totalReviews = data.review_summary?.count || 0

  return (
    <div className="container-page py-5">
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        <Link to="/" className="hover:text-brand-600">Home</Link><span>/</span>
        <Link to="/products" className="hover:text-brand-600">Products</Link>
        {data.category && (<><span>/</span><Link to={`/products?category=${data.category.slug}`} className="hover:text-brand-600">{data.category.name}</Link></>)}
        <span>/</span><span className="truncate text-slate-700">{data.name}</span>
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid gap-4 sm:grid-cols-[74px_1fr]">
          <div className="order-2 flex gap-2 overflow-x-auto sm:order-1 sm:flex-col sm:overflow-visible">
            {images.map((image, index) => (
              <button
                key={`${image.id}-${index}`}
                onClick={() => setActiveImage(index)}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white ${activeImage === index ? 'border-brand-500' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <img src={image.url} alt={image.alt_text || data.name} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          <div className="order-1 overflow-hidden rounded-xl border border-slate-200 bg-white sm:order-2">
            <div className="relative aspect-square">
              {images[activeImage] ? (
                <img src={images[activeImage].url} alt={data.name} className="h-full w-full object-contain p-2" />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-300">No image</div>
              )}
              {discount > 0 && <span className="absolute left-3 top-3 rounded-md bg-brand-500 px-2 py-1 text-xs font-bold text-white">-{discount}%</span>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold leading-snug text-slate-900 sm:text-2xl">{data.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Stars rating={data.rating_avg} /> {(Number(data.rating_avg) || 0).toFixed(1)} ({data.rating_count})</span>
              <span>{data.sold_count || 0} sold</span>
              <span className="font-mono text-[11px]">SKU {selected?.sku || data.sku}</span>
            </div>
          </div>

          <div className="rounded-lg border border-brand-100 bg-gradient-to-r from-brand-50 to-white p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-extrabold text-brand-600">{formatPrice(price)}</span>
              {compare && Number(compare) > Number(price) && (
                <>
                  <span className="text-sm text-slate-400 line-through">{formatPrice(compare)}</span>
                  <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">Save {formatPrice(Number(compare) - Number(price))}</span>
                </>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Price includes seller pricing. Delivery fee is calculated by your district at checkout.</p>
            <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-semibold text-slate-500">
              <span>✓ Cash on Delivery</span>
              <span>✓ bKash / Nagad / Rocket</span>
              <span>✓ 7-day returns*</span>
            </div>
          </div>

          {selected && (
            <div>
              <p className="label">Choose a variant</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => { setVariantId(variant.id); setQuantity(1) }}
                    disabled={Number(variant.stock) <= 0}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                      selected.id === variant.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <span className="block font-semibold">{variant.name}</span>
                    <span className="block text-[10px]">{formatPrice(variant.effective_price || variant.price)} · {variant.stock > 0 ? `${variant.stock} in stock` : 'Out of stock'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-300">
              <button className="px-3 py-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>−</button>
              <span className="min-w-9 px-2 text-center text-sm font-semibold tabular-nums">{quantity}</span>
              <button className="px-3 py-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40" onClick={() => setQuantity((q) => Math.min(stock || 1, q + 1))} disabled={quantity >= stock}>+</button>
            </div>
            <span className={`text-xs ${stock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stock > 0 ? `${stock} unit(s) available` : 'Currently out of stock'}</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="lg" loading={addToCart.isPending} disabled={stock <= 0} onClick={() => addToCart.mutate()}>Add to cart</Button>
            <Button size="lg" variant="dark" disabled={stock <= 0} onClick={buyNow}>Buy now</Button>
          </div>
          <Button variant="secondary" size="sm" className="w-full" loading={addToWishlist.isPending} onClick={() => addToWishlist.mutate()}>
            ♡ Save to wishlist
          </Button>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Sold by</p>
                <p className="truncate text-sm font-semibold text-slate-800">{data.store?.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                  <Stars rating={data.store?.rating_avg} /> {Number(data.store?.rating_avg || 0).toFixed(1)} · {data.store?.rating_count || 0} store reviews
                </p>
              </div>
              <Link to={`/products?store=${data.store?.slug || ''}`} className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-600">Visit store</Link>
            </div>
            <p className="mt-2 line-clamp-2 text-[11px] text-slate-500">{data.store?.description}</p>
          </div>

          <div className="grid gap-2 text-[11px] text-slate-600 sm:grid-cols-2">
            {[
              ['Flexible payments', 'COD, bKash, Nagad, Rocket & QR'],
              ['Verified seller', 'Approved and monitored store'],
              ['Return window', '7 days after delivery*'],
              ['Support', 'Ticket-based help center'],
            ].map(([title, sub]) => (
              <div key={title} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <span className="mt-0.5 text-emerald-500">✓</span>
                <span><span className="block font-semibold text-slate-700">{title}</span><span className="text-[10px] text-slate-500">{sub}</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white">
        <div className="flex overflow-x-auto border-b border-slate-200">
          {([['description', 'Description'], ['specifications', 'Specifications'], ['reviews', `Reviews (${totalReviews})`]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`whitespace-nowrap px-5 py-3 text-sm font-semibold ${tab === key ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'description' && (
            <div className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-slate-600">{data.description}</div>
          )}
          {tab === 'specifications' && (
            specifications.length ? (
              <div className="max-w-2xl overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <tbody>
                    {specifications.map(([name, value], index) => (
                      <tr key={`${name}-${index}`} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>
                        <th className="w-40 px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{name}</th>
                        <td className="px-4 py-2.5 text-slate-700">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500">The seller has not listed specifications for this product.</p>
          )}
          {tab === 'reviews' && (
            <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
              <div>
                <p className="text-4xl font-extrabold text-slate-900">{(reviewData?.summary.average || Number(data.rating_avg) || 0).toFixed(1)}<span className="text-base font-medium text-slate-400"> / 5</span></p>
                <Stars rating={reviewData?.summary.average || data.rating_avg} size="md" />
                <p className="mt-1 text-xs text-slate-500">{reviewData?.summary.count || totalReviews} approved reviews</p>
                <div className="mt-3 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = Number(breakdown[String(star)] || 0)
                    const pct = totalReviews ? Math.round((count / totalReviews) * 100) : 0
                    return (
                      <div key={star} className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="w-6">{star}★</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} /></div>
                        <span className="w-5 text-right">{count}</span>
                      </div>
                    )
                  })}
                </div>
                {user && <p className="mt-3 text-[11px] text-slate-400">Reviews can be submitted from your delivered order details.</p>}
              </div>
              <div>
                {!reviewData?.reviews?.data?.length ? (
                  <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">No approved reviews yet. Be the first to review after delivery.</p>
                ) : (
                  <div className="space-y-3">
                    {reviewData.reviews.data.map((review) => (
                      <div key={review.id} className="rounded-lg border border-slate-200 p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{review.reviewer.slice(0, 1)}</span>
                            <div>
                              <p className="text-xs font-semibold text-slate-700">{review.reviewer}</p>
                              <Stars rating={review.rating} />
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400">{date(review.created_at)}</span>
                        </div>
                        {review.title && <p className="mt-2 text-sm font-semibold text-slate-800">{review.title}</p>}
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{review.comment}</p>
                        {review.seller_reply && (
                          <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600"><span className="font-semibold text-slate-700">Seller response: </span>{review.seller_reply}</div>
                        )}
                      </div>
                    ))}
                    {(reviewData.reviews.meta?.last_page || 1) > 1 && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" disabled={reviewPage <= 1} onClick={() => setReviewPage((p) => p - 1)}>Previous</Button>
                        <Button size="sm" variant="secondary" disabled={reviewPage >= (reviewData.reviews.meta?.last_page || 1)} onClick={() => setReviewPage((p) => p + 1)}>Next</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {!!related?.length && (
        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg text-slate-900">You may also like</h2>
            <Link to={`/products?category=${data.category?.slug || ''}`} className="text-xs font-semibold text-brand-600 hover:underline">More in {data.category?.name} →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {related.slice(0, 5).map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        </section>
      )}

      <p className="mt-6 text-[11px] text-slate-400">*Returns are accepted within 7 days of delivery for eligible items. Perishable goods, innerwear, and used items are excluded. <Link to="/returns-policy" className="text-brand-600 hover:underline">Read the full policy</Link>.</p>
    </div>
  )
}
