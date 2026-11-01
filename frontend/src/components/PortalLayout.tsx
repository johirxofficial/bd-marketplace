import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { applyAppearance, applyBrandColor, usePublicSettings } from '../lib/settings'
import { cn } from './ui'
import { Logo } from './StoreLayout'
import { UserAvatar } from './UserAvatar'

export type PortalNavItem = { to: string; label: string; end?: boolean; badge?: string; permission?: string; unread?: boolean }

const sellerNav: PortalNavItem[] = [
  { to: '/seller', label: 'Overview', end: true },
  { to: '/seller/products', label: 'Products' },
  { to: '/seller/orders', label: 'Orders' },
  { to: '/seller/returns', label: 'Returns' },
  { to: '/seller/settlements', label: 'Settlements' },
  { to: '/seller/reports', label: 'Sales reports' },
  { to: '/seller/store', label: 'Store settings' },
  { to: '/messages', label: 'Messages', unread: true },
]

const adminNav: PortalNavItem[] = [
  { to: '/admin', label: 'Overview', end: true, permission: 'dashboard.view' },
  { to: '/messages', label: 'Messages', unread: true },
  { to: '/admin/orders', label: 'Orders', permission: 'orders.manage' },
  { to: '/admin/products', label: 'Product moderation', permission: 'products.moderate' },
  { to: '/admin/sellers', label: 'Sellers', permission: 'sellers.manage' },
  { to: '/admin/catalog', label: 'Categories & brands', permission: 'catalog.manage' },
  { to: '/admin/returns', label: 'Returns & refunds', permission: 'refunds.manage' },
  { to: '/admin/settlements', label: 'Settlements', permission: 'settlements.manage' },
  { to: '/admin/payments', label: 'Payment verification', permission: 'payments.manage' },
  { to: '/admin/payment-methods', label: 'Payment methods', permission: 'payments.manage' },
  { to: '/admin/marketing', label: 'Coupons & banners', permission: 'promotions.manage' },
  { to: '/admin/sms', label: 'SMS notifications', permission: 'sms.manage' },
  { to: '/admin/email', label: 'Email center', permission: 'email.manage' },
  { to: '/admin/plugins', label: 'Plugins', permission: 'plugins.manage' },
  { to: '/admin/developer', label: 'API & webhooks', permission: 'developer.manage' },
  { to: '/admin/reviews', label: 'Reviews', permission: 'reviews.moderate' },
  { to: '/admin/support', label: 'Support', permission: 'support.manage' },
  { to: '/admin/users', label: 'Users & roles', permission: 'users.manage' },
  { to: '/admin/shipping', label: 'Shipping zones', permission: 'shipping.manage' },
  { to: '/admin/settings', label: 'Settings', permission: 'settings.manage' },
  { to: '/admin/reports', label: 'Reports', permission: 'reports.view' },
  { to: '/admin/audit', label: 'Audit logs', permission: 'audit.view' },
]

export function PortalLayout({ kind }: { kind: 'seller' | 'admin' }) {
  const { user, logout } = useAuth()
  const { data: settings } = usePublicSettings()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const { data: unread } = useQuery({
    queryKey: ['messages', 'unread'],
    queryFn: async () => (await api.get('/messages/unread')).data as { unread_conversations: number },
    refetchInterval: 30_000,
  })
  // Hide admin sections the signed-in role cannot use. If the server did not
  // send permissions we keep the full list and let route guards enforce access.
  const permissions = user?.permissions
  const nav = (kind === 'seller' ? sellerNav : adminNav).filter(
    (item) => !item.permission || !permissions || permissions.includes(item.permission),
  )
  const home = kind === 'seller' ? '/seller' : '/admin'
  const heading = kind === 'seller' ? 'Seller center' : 'Administration'

  // Apply the marketplace palette here too: a full page reload on an admin URL
  // never mounts the storefront layout, which would otherwise leave buttons on
  // the default Tailwind palette.
  useEffect(() => {
    applyBrandColor(settings?.primary_color)
    applyAppearance(settings)
  }, [settings?.primary_color, settings?.font_family, settings?.heading_font_family, settings?.font_scale, settings?.content_width, settings?.card_radius, settings?.product_columns])

  const link = (item: PortalNavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={() => setOpen(false)}
      className={({ isActive }) => cn(
        'flex items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition',
        isActive ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      <span>{item.label}</span>
      {item.unread && !!unread?.unread_conversations && (
        <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold text-white">{unread.unread_conversations > 9 ? '9+' : unread.unread_conversations}</span>
      )}
      {item.badge && <span className="rounded-full bg-white/20 px-1.5 text-[10px] font-bold">{item.badge}</span>}
    </NavLink>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="container-page flex h-14 items-center gap-3">
          <button className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <Logo compact />
          <span className="hidden h-5 w-px bg-slate-200 sm:block" />
          <span className="hidden text-xs font-bold uppercase tracking-widest text-slate-400 sm:block">{heading}</span>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/" className="hidden rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 sm:block">Back to store</Link>
            {kind === 'seller' && <Link to="/seller/products/new" className="hidden rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 sm:block">+ Add product</Link>}
            <div className="flex items-center gap-2 border-l border-slate-200 pl-2">
              <div className="hidden text-right sm:block">
                <p className="max-w-[150px] truncate text-xs font-semibold text-slate-800">{user?.name}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{user?.role_label}</p>
              </div>
              <UserAvatar name={user?.name} role={user?.role} roleLabel={user?.role_label} avatarUrl={user?.avatar_url} size="md" />
            </div>
          </div>
        </div>
      </header>

      <div className="container-page flex gap-6 py-5">
        <aside className={cn('w-full shrink-0 lg:block lg:w-56', open ? 'block' : 'hidden')}>
          <div className="sticky top-20 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <Link to={home} className="mb-1 block rounded-lg bg-slate-900 px-3 py-2.5 text-[13px] font-bold text-white">
              {kind === 'seller' ? 'Seller dashboard' : 'Admin dashboard'}
            </Link>
            {nav.map(link)}
            <div className="my-1 border-t border-slate-100" />
            <button
              onClick={async () => { await logout(); navigate('/'); }}
              className="block w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-rose-600 hover:bg-rose-50"
            >Sign out</button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
