import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Badge, cn } from '../../components/ui'
import { UserAvatar } from '../../components/UserAvatar'

const nav = [
  { to: '/account', label: 'Overview', end: true },
  { to: '/account/orders', label: 'My orders' },
  { to: '/account/receipts', label: 'Receipts' },
  { to: '/messages', label: 'Messages' },
  { to: '/account/profile', label: 'Profile' },
  { to: '/account/addresses', label: 'Addresses' },
  { to: '/account/notifications', label: 'Notifications' },
  { to: '/account/support', label: 'Support tickets' },
  { to: '/wishlist', label: 'Wishlist' },
]

export default function AccountLayout() {
  const { user, isSeller, isStaff } = useAuth()

  return (
    <div className="container-page py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <UserAvatar name={user?.name} role={user?.role} roleLabel={user?.role_label} avatarUrl={user?.avatar_url} size="lg" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">My account</p>
            <h1 className="mt-0.5 text-xl font-bold text-slate-900 sm:text-2xl">{user?.name}</h1>
            <p className="mt-0.5 text-xs text-slate-500">{user?.email} · {user?.phone || 'No phone on file'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="green">{user?.role_label || 'Customer'}</Badge>
          {!!user?.seller_profile?.store && <Badge tone="blue">{user.seller_profile.store.name}</Badge>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
        <aside>
          <nav className="card sticky top-24 space-y-0.5 p-2">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn(
                  'block rounded-lg px-3 py-2 text-[13px] font-medium transition',
                  isActive ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {item.label}
              </NavLink>
            ))}
            {(isSeller || isStaff) && <div className="my-1 border-t border-slate-100" />}
            {isSeller && <NavLink to="/seller" className="block rounded-lg px-3 py-2 text-[13px] font-semibold text-brand-600 hover:bg-brand-50">Seller center</NavLink>}
            {isStaff && <NavLink to="/admin" className="block rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100">Administration</NavLink>}
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
