import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { mediaUrl, usePublicSettings, applyBrandColor, applyAppearance } from '../lib/settings'
import type { Category } from '../lib/types'
import { Badge, Button, cn, useToast } from './ui'
import { UserAvatar } from './UserAvatar'

function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
    cart: <><path d="M3 4h2l2.4 11.2A2 2 0 0 0 9.36 17H18a2 2 0 0 0 1.96-1.6L21 8H6" /><circle cx="9.5" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
    heart: <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1Z" />,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    message: <><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" /><path d="M8 11h8M8 15h5" /></>,
    store: <><path d="M3 9l2-5h14l2 5" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /></>,
    shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    phone: <path d="M5 4h3l2 5-2 1.5a12 12 0 0 0 5.5 5.5L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />,
    truck: <><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7z" /><circle cx="7" cy="18" r="1.5" /><circle cx="18" cy="18" r="1.5" /></>,
    refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
    headset: <><path d="M4 13a8 8 0 0 1 16 0" /><rect x="3" y="13" width="4" height="7" rx="2" /><rect x="17" y="13" width="4" height="7" rx="2" /><path d="M20 20a3 3 0 0 1-3 3h-3" /></>,
    location: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
    tag: <><path d="M20 12l-8 8-8-8V4h8l8 8Z" /><circle cx="8" cy="8" r="1.4" /></>,
    bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || null}
    </svg>
  )
}

export function Logo({ compact, logoUrl, storeName = 'Marketplace', tagline = 'Shop verified sellers', light }: { compact?: boolean; logoUrl?: string | null; storeName?: string; tagline?: string; light?: boolean }) {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2">
      {logoUrl ? (
        <img src={logoUrl} alt={`${storeName} logo`} className="h-9 w-9 rounded-lg bg-white object-contain p-0.5 ring-1 ring-black/10" />
      ) : (
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg shadow-sm', light ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-brand-500 text-white')}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8h12l-1.2 12H7.2L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" />
          </svg>
        </span>
      )}
      {!compact && (
        <span className="leading-tight">
          <span className={cn('block text-[16px] font-extrabold tracking-tight', light ? 'text-white' : 'text-slate-900')}>{storeName}</span>
          <span className={cn('block text-[9px] font-semibold uppercase tracking-[0.18em]', light ? 'text-white/75' : 'text-brand-600')}>{tagline}</span>
        </span>
      )}
    </Link>
  )
}

function MaintenanceScreen({ storeName, message, logoUrl }: { storeName: string; message: string; logoUrl?: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <Logo logoUrl={logoUrl} storeName={storeName} />
      <div className="mt-6 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">Scheduled maintenance</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">We&apos;ll be right back</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{message}</p>
        <p className="mt-4 text-[11px] text-slate-400">Staff can sign in to access the administration area.</p>
        <Link to="/login" className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Staff sign in</Link>
      </div>
    </div>
  )
}

function NewsletterForm({ title, text, compact = false }: { title?: string; text?: string; compact?: boolean }) {
  const { push } = useToast()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      await api.post('/newsletter/subscribe', { email: email.trim(), source: 'storefront' })
      setDone(true)
      setEmail('')
      push('You are subscribed. Check your inbox for a welcome email.')
    } catch (error: any) {
      push(error?.response?.data?.message || 'Subscription failed. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-white p-5 sm:p-6', compact && 'p-4')}>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600">Newsletter</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{title || 'Deals worth opening'}</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">
            {text || 'New arrivals, honest deals, and marketplace updates. No spam — unsubscribe any time.'}
          </p>
        </div>
        {done ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">Subscribed — thank you!</p>
        ) : (
          <form onSubmit={submit} className="flex w-full gap-2 sm:w-[360px]">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="input min-w-0 flex-1"
              aria-label="Email address for newsletter"
            />
            <Button type="submit" size="md" loading={loading} className="shrink-0">Subscribe</Button>
          </form>
        )}
      </div>
    </div>
  )
}

function PaymentBadges() {
  const methods = [
    { label: 'bKash', className: 'text-[#e2136e]' },
    { label: 'Nagad', className: 'text-[#f6921e]' },
    { label: 'Rocket', className: 'text-[#8c3494]' },
    { label: 'Bangla QR', className: 'text-emerald-700' },
    { label: 'COD', className: 'text-slate-700' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {methods.map((method) => (
        <span key={method.label} className={cn('dz-payment-badge', method.className)}>{method.label}</span>
      ))}
    </div>
  )
}

export function StoreLayout() {
  const { user, logout, isStaff, isSeller } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [searchCategory, setSearchCategory] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [catOpen, setCatOpen] = useState(false)

  const { data: settings } = usePublicSettings()
  const storeName = settings?.store_name || 'Marketplace'
  const logoUrl = mediaUrl(settings?.store_logo_path)

  useEffect(() => {
    document.title = settings?.meta_title || `${storeName} — Online Shopping in Bangladesh`

    // Generate the brand palette from the administrator's chosen colour.
    applyBrandColor(settings?.primary_color)

    // Typography, content width, radius, and product-grid density.
    applyAppearance(settings)

    if (settings?.primary_color) {
      let theme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
      if (!theme) {
        theme = document.createElement('meta')
        theme.name = 'theme-color'
        document.head.appendChild(theme)
      }
      theme.content = settings.primary_color
    }

    const ensureMeta = (name: string, content?: string) => {
      if (!content) return
      let tag = document.querySelector(`meta[name="${name}"]`)
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute('name', name)
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', content)
    }
    ensureMeta('description', settings?.meta_description)
    ensureMeta('keywords', settings?.meta_keywords)

    if (settings?.store_favicon_path) {
      let icon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null
      if (!icon) {
        icon = document.createElement('link')
        icon.rel = 'icon'
        document.head.appendChild(icon)
      }
      icon.href = mediaUrl(settings.store_favicon_path) || ''
    }
  }, [settings, storeName])

  if (settings?.maintenance_mode && !isStaff && location.pathname !== '/login' && location.pathname !== '/register') {
    return <MaintenanceScreen storeName={storeName} message={settings.maintenance_message || 'We are performing scheduled maintenance. Please check back shortly.'} logoUrl={logoUrl} />
  }

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data.categories as Category[],
    staleTime: 5 * 60 * 1000,
  })

  const { data: cart } = useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.get('/cart')).data.cart,
    enabled: !!user,
  })
  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get('/notifications')).data.unread_count as number,
    enabled: !!user,
    refetchInterval: 60_000,
  })

  const { data: unreadMessages } = useQuery({
    queryKey: ['messages', 'unread'],
    queryFn: async () => (await api.get('/messages/unread')).data as { unread_conversations: number; unread_messages: number },
    enabled: !!user,
    refetchInterval: 30_000,
  })

  const cartCount = cart?.item_count || 0
  const topCategories = (categories || []).slice(0, 8)

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    const value = search.trim()
    const params = new URLSearchParams()
    if (value) params.set('search', value)
    if (searchCategory) params.set('category', searchCategory)
    navigate(params.toString() ? `/products?${params.toString()}` : '/products')
  }

  return (
    <div className="store-shell flex min-h-screen flex-col">
      {/* Utility strip */}
      <div className="store-topbar hidden md:block">
        <div className="container-page flex h-8 items-center justify-between gap-3 text-[11px]">
          <p className="truncate">{settings?.announcement || 'Cash on Delivery, bKash, Nagad, Rocket, and Bangla QR available nationwide'}</p>
          <div className="flex shrink-0 items-center gap-4">
            <Link to="/seller/apply" className="hover:text-brand-600">Save more on app</Link>
            <Link to="/seller/apply" className="hover:text-brand-600">Become a seller</Link>
            <Link to="/support" className="hover:text-brand-600">Help &amp; Support</Link>
            <Link to="/account/orders" className="hover:text-brand-600">Track my order</Link>
            {!user && <Link to="/login" className="font-semibold text-brand-600 hover:underline">Login / Sign up</Link>}
          </div>
        </div>
      </div>

      {/* Orange marketplace header */}
      <header className={cn('store-header z-40', settings?.sticky_header === false ? 'relative' : 'sticky top-0 shadow-md')}>
        <div className="container-page flex items-center gap-2 py-2.5 sm:gap-4">
          <button className="rounded-lg p-1.5 hover:bg-white/10 lg:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
          <Logo logoUrl={logoUrl} storeName={storeName} tagline={settings?.tagline} light />

          <form onSubmit={submitSearch} className="hidden flex-1 items-center md:flex">
            <div className="store-search-shell w-full">
              <div className="hidden items-center border-r border-slate-200 pl-3 pr-1 lg:flex">
                <select
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                  className="max-w-[8.5rem] cursor-pointer bg-transparent py-2 text-[11px] font-medium text-slate-500 outline-none"
                  aria-label="Search category"
                >
                  <option value="">All Categories</option>
                  {(categories || []).map((category) => (
                    <option key={category.id} value={category.slug}>{category.name}</option>
                  ))}
                </select>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search in products, brands, and categories"
                aria-label="Search products"
              />
              <button type="submit" className="store-search-btn">
                <Icon name="search" className="h-4 w-4" /> <span className="hidden sm:inline">Search</span>
              </button>
            </div>
          </form>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link to="/wishlist" className="hidden flex-col items-center rounded-lg px-2 py-1 hover:bg-white/10 sm:flex" title="Wishlist" aria-label="Wishlist">
              <Icon name="heart" className="h-5 w-5" />
              <span className="mt-0.5 text-[10px] font-medium">Wishlist</span>
            </Link>
            {user && (
              <Link to="/messages" className="relative hidden flex-col items-center rounded-lg px-2 py-1 hover:bg-white/10 sm:flex" title="Messages" aria-label="Messages">
                <Icon name="message" className="h-5 w-5" />
                <span className="mt-0.5 text-[10px] font-medium">Messages</span>
                {!!unreadMessages?.unread_conversations && (
                  <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-brand-600">{unreadMessages.unread_conversations > 9 ? '9+' : unreadMessages.unread_conversations}</span>
                )}
              </Link>
            )}
            {user && (
              <Link to="/account/notifications" className="relative hidden flex-col items-center rounded-lg px-2 py-1 hover:bg-white/10 lg:flex" title="Notifications">
                <Icon name="bell" className="h-5 w-5" />
                <span className="mt-0.5 text-[10px] font-medium">Alerts</span>
                {!!notifications && notifications > 0 && (
                  <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-brand-600">{notifications > 9 ? '9+' : notifications}</span>
                )}
              </Link>
            )}
            {user ? (
              <details className="relative">
                <summary className="flex cursor-pointer list-none flex-col items-center rounded-lg px-2 py-1 hover:bg-white/10 sm:flex-row sm:gap-2 [&::-webkit-details-marker]:hidden">
                  <UserAvatar name={user.name} role={user.role} roleLabel={user.role_label} avatarUrl={user.avatar_url} size="sm" />
                  <span className="mt-0.5 text-left text-[10px] leading-tight sm:mt-0 sm:text-xs">
                    <span className="block max-w-[86px] truncate font-semibold">{user.name.split(' ')[0]}</span>
                    <span className="hidden text-[10px] uppercase tracking-wide opacity-75 sm:block">{user.role_label || 'Account'}</span>
                  </span>
                </summary>
                <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 text-slate-700 shadow-2xl">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-3 pb-2 pt-1">
                    <UserAvatar name={user.name} role={user.role} roleLabel={user.role_label} avatarUrl={user.avatar_url} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                  {[
                    ['/account', 'Account overview'],
                    ['/account/orders', 'My orders'],
                    ['/account/addresses', 'Saved addresses'],
                    ['/messages', 'Messages'],
                    ['/wishlist', 'Wishlist'],
                    ['/account/support', 'Support tickets'],
                  ].map(([to, label]) => (
                    <Link key={to} to={to} className="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-brand-600">{label}</Link>
                  ))}
                  <div className="my-1 border-t border-slate-100" />
                  {isSeller && <Link to="/seller" className="block px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50">Seller center</Link>}
                  {!isSeller && !isStaff && <Link to="/seller/apply" className="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Become a seller</Link>}
                  {isStaff && <Link to="/admin" className="block px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">Admin dashboard</Link>}
                  <button
                    onClick={async () => { await logout(); navigate('/'); }}
                    className="block w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                  >Sign out</button>
                </div>
              </details>
            ) : (
              <Link to="/login" className="flex flex-col items-center rounded-lg px-2 py-1 hover:bg-white/10" title="Sign in">
                <Icon name="user" className="h-5 w-5" />
                <span className="mt-0.5 text-[10px] font-medium">Sign in</span>
              </Link>
            )}
            <Link to="/cart" className="relative flex flex-col items-center rounded-lg px-2 py-1 hover:bg-white/10" aria-label="Cart" title="Cart">
              <Icon name="cart" className="h-5 w-5" />
              <span className="mt-0.5 text-[10px] font-medium">Cart</span>
              {cartCount > 0 && (
                <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-brand-600">{cartCount > 99 ? '99+' : cartCount}</span>
              )}
            </Link>
          </div>
        </div>

        <form onSubmit={submitSearch} className="container-page pb-2.5 md:hidden">
          <div className="store-search-shell">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" />
            <button type="submit" className="store-search-btn"><Icon name="search" className="h-4 w-4" /></button>
          </div>
        </form>

        {/* Category navigation */}
        <div className="store-catnav relative">
          <div className="container-page flex items-center gap-4 overflow-x-auto no-scrollbar">
            <div className="relative shrink-0" onMouseLeave={() => setCatOpen(false)}>
              <button
                onClick={() => setCatOpen((v) => !v)}
                className="store-nav-link gap-1.5 font-semibold text-slate-800"
                aria-expanded={catOpen}
              >
                <Icon name="grid" className="h-4 w-4" /> All Categories
                <Icon name="chevron" className={cn('h-3.5 w-3.5 transition', catOpen && 'rotate-180')} />
              </button>
              {catOpen && (
                <div className="absolute left-0 top-full z-50 w-64 rounded-b-lg border border-slate-100 bg-white py-2 shadow-2xl">
                  {(categories || []).map((category) => (
                    <Link
                      key={category.id}
                      to={`/products?category=${category.slug}`}
                      onClick={() => setCatOpen(false)}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-[13px] text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <span>{category.name}</span>
                      {!!category.products_count && <span className="text-[10px] text-slate-400">{category.products_count}</span>}
                    </Link>
                  ))}
                  <div className="mt-1 border-t border-slate-100 pt-1">
                    <Link to="/products" onClick={() => setCatOpen(false)} className="block px-3 py-2 text-[12px] font-semibold text-brand-600 hover:bg-brand-50">Browse all products →</Link>
                  </div>
                </div>
              )}
            </div>
            {topCategories.map((category) => (
              <NavLink
                key={category.id}
                to={`/products?category=${category.slug}`}
                className={({ isActive }) => cn('store-nav-link', isActive && 'font-semibold text-brand-600')}
              >
                {category.name}
              </NavLink>
            ))}
            <Link to="/products?sort=popular" className="store-nav-link store-nav-hot ml-auto hidden gap-1 sm:inline-flex">
              <Icon name="bolt" className="h-3.5 w-3.5" /> Flash Sale
            </Link>
          </div>
        </div>

        {/* Mobile category panel */}
        {menuOpen && (
          <div className="border-t border-white/20 bg-white px-4 py-3 text-slate-700 shadow-xl lg:hidden">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Shop by category</p>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {(categories || []).map((category) => (
                <Link key={category.id} to={`/products?category=${category.slug}`} onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-brand-50 hover:text-brand-700">
                  {category.name}
                </Link>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm">
              <Link to="/products" onClick={() => setMenuOpen(false)} className="font-semibold text-brand-600">All products</Link>
              <Link to="/wishlist" onClick={() => setMenuOpen(false)} className="text-slate-600">Wishlist</Link>
              <Link to="/account/orders" onClick={() => setMenuOpen(false)} className="text-slate-600">My orders</Link>
              <Link to="/seller/apply" onClick={() => setMenuOpen(false)} className="text-slate-600">Become a seller</Link>
              <Link to="/support" onClick={() => setMenuOpen(false)} className="text-slate-600">Help &amp; support</Link>
              <Link to="/cart" onClick={() => setMenuOpen(false)} className="text-slate-600">Cart ({cartCount})</Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        {settings?.newsletter_enabled !== false && (
          <div className="border-b border-slate-100 bg-slate-50/70 py-6">
            <div className="container-page">
              <NewsletterForm title={settings?.newsletter_title} text={settings?.newsletter_text} />
            </div>
          </div>
        )}
        <div className="container-page grid gap-8 py-9 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo logoUrl={logoUrl} storeName={storeName} tagline={settings?.tagline} />
            <p className="mt-3 max-w-md text-xs leading-relaxed text-slate-500">
              {settings?.footer_text || settings?.about || 'A Bangladesh-focused multi-vendor marketplace. Verified sellers, transparent pricing, flexible payments, and accountable returns.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="amber">Cash on Delivery</Badge>
              <Badge tone="green">Verified sellers</Badge>
              <Badge tone="blue">7-day returns*</Badge>
            </div>
            {(settings?.support_phone || settings?.support_email) && (
              <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                {settings.support_phone && <p>Hotline: <a className="font-semibold text-slate-700 hover:text-brand-600" href={`tel:${settings.support_phone}`}>{settings.support_phone}</a></p>}
                {settings.support_email && <p>Email: <a className="font-semibold text-slate-700 hover:text-brand-600" href={`mailto:${settings.support_email}`}>{settings.support_email}</a></p>}
              </div>
            )}
            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">We accept</p>
              <div className="mt-1.5"><PaymentBadges /></div>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-800">Shop</p>
            <ul className="mt-2.5 space-y-1.5 text-xs text-slate-500">
              <li><Link to="/products" className="hover:text-brand-600">All products</Link></li>
              <li><Link to="/products?sort=newest" className="hover:text-brand-600">New arrivals</Link></li>
              <li><Link to="/products?sort=popular" className="hover:text-brand-600">Best sellers</Link></li>
              <li><Link to="/wishlist" className="hover:text-brand-600">Wishlist</Link></li>
              <li><Link to="/products?availability=in_stock" className="hover:text-brand-600">In stock only</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-800">Account</p>
            <ul className="mt-2.5 space-y-1.5 text-xs text-slate-500">
              <li><Link to="/account/orders" className="hover:text-brand-600">Track my order</Link></li>
              <li><Link to="/account/addresses" className="hover:text-brand-600">Addresses</Link></li>
              <li><Link to="/account/support" className="hover:text-brand-600">Support tickets</Link></li>
              <li><Link to="/seller/apply" className="hover:text-brand-600">Become a seller</Link></li>
              <li><Link to="/messages" className="hover:text-brand-600">Messages</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-800">Policies</p>
            <ul className="mt-2.5 space-y-1.5 text-xs text-slate-500">
              <li><Link to="/support" className="hover:text-brand-600">Help center</Link></li>
              <li><Link to="/about" className="hover:text-brand-600">About us</Link></li>
              <li><Link to="/returns-policy" className="hover:text-brand-600">Returns &amp; refunds</Link></li>
            </ul>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-400">Manual wallet, QR, and Pay Bill payments are verified by staff before an order is marked paid. Never share your password or one-time codes with anyone.</p>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-500">
              {settings?.facebook_url && <a href={settings.facebook_url} target="_blank" rel="noreferrer" className="hover:text-brand-600">Facebook</a>}
              {settings?.instagram_url && <a href={settings.instagram_url} target="_blank" rel="noreferrer" className="hover:text-brand-600">Instagram</a>}
              {settings?.youtube_url && <a href={settings.youtube_url} target="_blank" rel="noreferrer" className="hover:text-brand-600">YouTube</a>}
              {settings?.tiktok_url && <a href={settings.tiktok_url} target="_blank" rel="noreferrer" className="hover:text-brand-600">TikTok</a>}
              {settings?.linkedin_url && <a href={settings.linkedin_url} target="_blank" rel="noreferrer" className="hover:text-brand-600">LinkedIn</a>}
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 py-3">
          <div className="container-page flex flex-col items-center justify-between gap-2 text-[11px] text-slate-400 sm:flex-row">
            <p>© {new Date().getFullYear()} {storeName}. All rights reserved.</p>
            <p>Prices in BDT · All times Asia/Dhaka · Made in Bangladesh</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
