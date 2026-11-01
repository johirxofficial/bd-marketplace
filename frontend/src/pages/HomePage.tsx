import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Category, Product } from '../lib/types'
import { price } from '../lib/format'
import { ProductCard } from '../components/ProductCard'
import { ErrorState, LinkButton, Loading } from '../components/ui'

type Banner = {
  id: number
  title: string
  subtitle?: string | null
  image_path?: string | null
  link_url?: string | null
  placement?: string
}

type FlashSale = {
  promotion: { id: number; name: string; value?: string; ends_at: string }
  product: Product
}

const categoryIcons: Record<string, string> = {
  electronics: '📱',
  fashion: '👗',
  'home-living': '🛋️',
  'beauty-health': '💄',
  groceries: '🛒',
  'sports-outdoor': '🏏',
  'baby-kids': '🧸',
  books: '📚',
  automotive: '🚗',
}

const categoryTints = [
  'bg-orange-50',
  'bg-pink-50',
  'bg-sky-50',
  'bg-emerald-50',
  'bg-amber-50',
  'bg-violet-50',
  'bg-rose-50',
  'bg-teal-50',
]

const heroGradients = [
  'from-[#5a1b00] via-[#c2410c] to-[#fb923c]',
  'from-[#3b0764] via-[#9d174d] to-[#fb7185]',
  'from-[#052e2b] via-[#0f766e] to-[#5eead4]',
]

const sideGradients = [
  'from-[#1e1b4b] via-[#4338ca] to-[#818cf8]',
  'from-[#422006] via-[#b45309] to-[#fbbf24]',
]

const fallbackSlides: Banner[] = [
  { id: 1, title: 'Mega Tech Week', subtitle: 'Save up to 25% on phones, laptops, audio, and everyday tech from verified sellers.', link_url: '/products?category=electronics&sort=popular' },
  { id: 2, title: 'Fashion Fest', subtitle: 'Fresh looks from Bangladeshi boutiques — panjabi, sarees, sneakers, and more.', link_url: '/products?category=fashion' },
  { id: 3, title: 'Everyday Essentials', subtitle: 'Groceries and personal care delivered to your door with cash on delivery.', link_url: '/products?category=groceries' },
]

function useCountdown(endsAt?: string) {
  const target = endsAt ? new Date(endsAt).getTime() : 0
  const [remaining, setRemaining] = useState(() => Math.max(0, target - Date.now()))
  useEffect(() => {
    if (!target) return undefined
    const tick = () => setRemaining(Math.max(0, target - Date.now()))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [target])
  const days = Math.floor(remaining / 86400000)
  const hours = Math.floor((remaining % 86400000) / 3600000)
  const minutes = Math.floor((remaining % 3600000) / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)
  return { remaining, days, hours, minutes, seconds }
}

function Countdown({ endsAt }: { endsAt?: string }) {
  const { remaining, days, hours, minutes, seconds } = useCountdown(endsAt)
  if (!endsAt || remaining <= 0) return null
  return (
    <div className="dz-countdown" aria-label="Offer ends in">
      {days > 0 && (
        <span className="flex items-center gap-1">
          {String(days).padStart(2, '0')}<small className="text-[9px] font-bold uppercase opacity-80">d</small>
        </span>
      )}
      <span>{String(hours).padStart(2, '0')}</span>
      <b className="text-xs">:</b>
      <span>{String(minutes).padStart(2, '0')}</span>
      <b className="text-xs">:</b>
      <span>{String(seconds).padStart(2, '0')}</span>
    </div>
  )
}

function HeroCarousel({ banners }: { banners: Banner[] }) {
  const slides = banners.length ? banners.slice(0, 3) : fallbackSlides
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (slides.length < 2 || paused) return undefined
    const timer = window.setInterval(() => setActive((index) => (index + 1) % slides.length), 5200)
    return () => window.clearInterval(timer)
  }, [slides.length, paused])

  useEffect(() => {
    if (active >= slides.length) setActive(0)
  }, [slides.length, active])

  const slide = slides[active] || slides[0]
  const gradient = heroGradients[active % heroGradients.length]

  return (
    <div
      className={`relative h-[300px] overflow-hidden rounded-lg bg-gradient-to-br ${gradient} text-white shadow-sm sm:h-[360px] lg:h-[400px]`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-28 right-24 h-72 w-72 rounded-full bg-black/10 blur-2xl" />
      <div className="pointer-events-none absolute left-1/2 top-6 hidden h-24 w-24 rotate-12 rounded-2xl border border-white/15 bg-white/5 lg:block" />

      <div key={slide.id} className="dz-fade-in relative flex h-full flex-col justify-center px-6 py-8 sm:px-10 lg:px-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/70">Featured on {`BD Marketplace`}</p>
        <h1 className="mt-2 max-w-xl text-[26px] font-extrabold leading-[1.12] drop-shadow-sm sm:text-4xl lg:text-[42px]">
          {slide.title}
        </h1>
        <p className="mt-3 max-w-lg text-xs leading-relaxed text-white/85 sm:text-sm">
          {slide.subtitle || 'Shop verified sellers across Bangladesh with cash on delivery and flexible wallet payments.'}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link to={slide.link_url || '/products'} className="rounded-md bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-100">
            Shop now
          </Link>
          <Link to="/products?sort=popular" className="rounded-md border border-white/50 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
            Best sellers
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-white/75">
          <span>✓ Cash on Delivery</span>
          <span>✓ bKash · Nagad · Rocket</span>
          <span>✓ Verified sellers</span>
        </div>
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setActive((index) => (index - 1 + slides.length) % slides.length)}
            className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur transition hover:bg-black/35 sm:flex"
            aria-label="Previous slide"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setActive((index) => (index + 1) % slides.length)}
            className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur transition hover:bg-black/35 sm:flex"
            aria-label="Next slide"
          >
            ›
          </button>
          <div className="absolute bottom-3 left-6 flex items-center gap-1.5 sm:left-10">
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(index)}
                className={`h-1.5 rounded-full transition-all ${index === active ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SidePromos({ banners }: { banners: Banner[] }) {
  const promos = banners.length ? banners.slice(0, 2) : fallbackSlides.slice(1, 3)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      {promos.map((promo, index) => (
        <Link
          key={promo.id}
          to={promo.link_url || '/products'}
          className={`group relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-lg bg-gradient-to-br ${sideGradients[index % sideGradients.length]} p-4 text-white shadow-sm transition hover:shadow-md`}
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Featured store</p>
            <h2 className="mt-1 text-lg font-bold leading-tight">{promo.title}</h2>
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/75">{promo.subtitle || 'Hand-picked deals from verified sellers.'}</p>
          </div>
          <span className="mt-3 inline-flex w-fit items-center gap-1 rounded bg-white/15 px-2.5 py-1 text-[11px] font-bold backdrop-blur transition group-hover:bg-white/25">
            Explore now →
          </span>
        </Link>
      ))}
    </div>
  )
}

function CategoryStrip({ categories }: { categories: Category[] }) {
  if (!categories.length) return null
  return (
    <section className="dz-section mt-3 px-3 py-4 sm:px-4">
      <div className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-8">
        {categories.slice(0, 8).map((category, index) => (
          <Link key={category.id} to={`/products?category=${category.slug}`} className="dz-cat-circle">
            <span className={categoryTints[index % categoryTints.length]}>{categoryIcons[category.slug] || '🏷️'}</span>
            <span className="line-clamp-2 text-[11px] font-medium leading-tight text-slate-600 hover:text-brand-600">{category.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function FlashSaleSection({ flashSales }: { flashSales: FlashSale[] }) {
  if (!flashSales.length) return null
  const endsAt = flashSales.reduce((earliest, item) => {
    const time = new Date(item.promotion.ends_at).getTime()
    return !earliest || time < earliest ? time : earliest
  }, 0)
  return (
    <section className="dz-section mt-3 overflow-hidden">
      <div className="dz-flash-head flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="flex items-center gap-1 text-base font-extrabold uppercase tracking-wide">
            <span className="text-lg">⚡</span> Flash Sale
          </h2>
          <Countdown endsAt={new Date(endsAt).toISOString()} />
        </div>
        <Link to="/products?sort=popular" className="rounded border border-white/50 px-2.5 py-1 text-[11px] font-bold transition hover:bg-white/15">
          See all deals →
        </Link>
      </div>
      <div className="dz-scroll-x">
        {flashSales.slice(0, 10).map(({ promotion, product }) => {
          const discount = Number(product.discount_percent || 0)
          const sold = Number(product.sold_count || 0)
          const stock = Number(product.stock || 0)
          const total = sold + stock
          const percent = total > 0 ? Math.min(100, Math.max(8, Math.round((sold / total) * 100))) : 20
          return (
            <Link key={`${promotion.id}-${product.id}`} to={`/products/${product.slug}`} className="group w-[150px] shrink-0 sm:w-[170px]">
              <div className="relative aspect-square overflow-hidden rounded-md bg-slate-100">
                <img src={product.image_url} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                {discount > 0 && <span className="absolute left-0 top-0 rounded-br-md bg-brand-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white">-{discount}%</span>}
              </div>
              <p className="mt-1.5 line-clamp-2 min-h-[2.4em] text-[11px] leading-snug text-slate-600 group-hover:text-brand-600">{product.name}</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-sm font-extrabold text-brand-600">{price(product.effective_price || product.price)}</span>
                {product.compare_at_price && Number(product.compare_at_price) > Number(product.effective_price) && (
                  <span className="text-[10px] text-slate-400 line-through">{price(product.compare_at_price)}</span>
                )}
              </div>
              <div className="mt-1.5 dz-progress"><span style={{ width: `${percent}%` }} /></div>
              <p className="mt-1 text-[10px] font-semibold text-brand-600">{sold > 0 ? `${sold} sold` : 'Selling fast'}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function TrustStrip() {
  const items = [
    { icon: '🚚', title: 'Nationwide delivery', text: 'All 8 divisions covered' },
    { icon: '🛡️', title: 'Verified sellers', text: 'Approved and monitored' },
    { icon: '🔄', title: '7-day returns*', text: 'Eligible items only' },
    { icon: '🎧', title: 'Support tickets', text: 'Tracked help center' },
  ]
  return (
    <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.title} className="flex items-center gap-2.5 rounded-lg bg-white px-3 py-3 shadow-[0_0_0_1px_rgba(15,23,42,0.04)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-base">{item.icon}</span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-bold text-slate-800">{item.title}</p>
            <p className="truncate text-[10px] text-slate-500">{item.text}</p>
          </div>
        </div>
      ))}
    </section>
  )
}

const tabs = [
  { key: 'all', label: 'Just For You' },
  { key: 'featured', label: 'Featured' },
  { key: 'new', label: 'New arrivals' },
  { key: 'best', label: 'Best sellers' },
] as const

type TabKey = (typeof tabs)[number]['key']

function ProductFeed({ featured, arrivals, best }: { featured: Product[]; arrivals: Product[]; best: Product[] }) {
  const [tab, setTab] = useState<TabKey>('all')
  const [visible, setVisible] = useState(10)

  const products = useMemo(() => {
    const source = tab === 'featured' ? featured : tab === 'new' ? arrivals : tab === 'best' ? best : [...featured, ...arrivals, ...best]
    const seen = new Set<number>()
    return source.filter((product) => {
      if (seen.has(product.id)) return false
      seen.add(product.id)
      return true
    })
  }, [tab, featured, arrivals, best])

  useEffect(() => { setVisible(10) }, [tab])

  return (
    <section className="mt-3">
      <div className="dz-section">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {tabs.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`dz-chip ${tab === item.key ? 'dz-chip-active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Link to="/products" className="text-[11px] font-semibold text-brand-600 hover:underline">View all →</Link>
        </div>
        <div className="p-3 sm:p-4">
          <div className="product-grid">
            {products.slice(0, visible).map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
          {products.length > visible && (
            <div className="mt-5 flex justify-center">
              <button
                onClick={() => setVisible((count) => count + 10)}
                className="rounded-md border border-brand-200 bg-white px-8 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
              >
                Load more products
              </button>
            </div>
          )}
          {!products.length && <p className="py-10 text-center text-sm text-slate-500">No products in this collection yet.</p>}
        </div>
      </div>
    </section>
  )
}

function BrandStrip({ brands }: { brands: { id: number; name: string; slug: string }[] }) {
  if (!brands.length) return null
  return (
    <section className="dz-section mt-3 flex items-center gap-4 overflow-hidden px-4 py-3">
      <div className="shrink-0 border-r border-slate-100 pr-4">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-600">Top brands</p>
        <p className="mt-0.5 text-[10px] text-slate-400">Shop official stores</p>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {brands.slice(0, 14).map((brand) => (
          <Link
            key={brand.id}
            to={`/products?brand=${brand.slug}`}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-600"
          >
            {brand.name}
          </Link>
        ))}
      </div>
    </section>
  )
}

function SellerCTA({ storeName }: { storeName: string }) {
  return (
    <section className="relative mt-3 overflow-hidden rounded-lg bg-gradient-to-r from-slate-900 via-slate-900 to-brand-700 p-5 text-white sm:p-7">
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute bottom-0 right-1/3 h-32 w-32 rounded-full bg-brand-500/20 blur-2xl" />
      <div className="relative grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-300">Grow with us</p>
          <h2 className="mt-1 text-xl font-bold sm:text-2xl">Start selling on {storeName}</h2>
          <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-slate-300">
            Reach customers in all 8 divisions, manage stock and orders in one place, and get settled transparently every week.
          </p>
          <div className="mt-4 flex flex-wrap gap-5 text-[11px] text-slate-300">
            <span><b className="text-white">0%</b> listing fee</span>
            <span><b className="text-white">Weekly</b> settlements</span>
            <span><b className="text-white">Nationwide</b> delivery</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/seller/apply" className="rounded-md bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">Apply to sell</Link>
          <Link to="/about" className="rounded-md border border-white/25 px-4 py-2 text-sm font-semibold transition hover:bg-white/10">Learn more</Link>
        </div>
      </div>
    </section>
  )
}

export default function HomePage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['home'],
    queryFn: async () => (await api.get('/home')).data,
  })

  if (isLoading) return <Loading label="Loading the marketplace…" />
  if (error || !data) return <div className="container-page py-8"><ErrorState message="The marketplace could not be loaded." onRetry={() => refetch()} /></div>

  const banners: Banner[] = data.banners || []
  const heroBanners = banners.filter((banner) => banner.placement === 'home_hero')
  const sideBanners = heroBanners.slice(1, 3)
  const categories: Category[] = data.categories || []
  const flashSales: FlashSale[] = data.flash_sales || []
  const featured: Product[] = data.featured || []
  const arrivals: Product[] = data.new_arrivals || []
  const best: Product[] = data.best_sellers || []

  return (
    <div className="container-page pb-4">
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_310px]">
        <HeroCarousel banners={heroBanners.length ? heroBanners : banners.slice(0, 3)} />
        <SidePromos banners={sideBanners} />
      </div>

      <CategoryStrip categories={categories} />
      <FlashSaleSection flashSales={flashSales} />

      <ProductFeed featured={featured} arrivals={arrivals} best={best} />

      <TrustStrip />
      <BrandStrip brands={data.brands || []} />
      <SellerCTA storeName={data.settings?.store_name || 'BD Marketplace'} />

      {!!(data.stores || []).length && (
        <section className="dz-section mt-3">
          <div className="dz-section-head">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Trusted stores</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">Approved sellers with active catalogues</p>
            </div>
            <LinkButton to="/products" size="sm" variant="secondary">Browse all</LinkButton>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
            {data.stores.slice(0, 6).map((store: any) => (
              <div key={store.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 transition hover:border-brand-200">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-base font-bold text-white">{store.name[0]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-slate-900">{store.name}</p>
                  <p className="truncate text-[10px] text-slate-500">{store.products_count} products · {Number(store.rating_avg).toFixed(1)}★ ({store.rating_count})</p>
                  <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">{store.description}</p>
                </div>
                <Link to={`/products?store=${store.slug}`} className="shrink-0 rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-600">Visit</Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
