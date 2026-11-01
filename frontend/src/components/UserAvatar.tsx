import type { ReactNode } from 'react'
import { initials } from '../lib/format'
import { cn } from './ui'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const sizes: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[9px]',
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-20 w-20 text-2xl',
}

const badgeSizes: Record<AvatarSize, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-7 w-7',
}

type RoleStyle = {
  label: string
  ring: string
  bg: string
  text: string
  badge: string
  glyph: ReactNode
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function glyph(role: string): ReactNode {
  switch (role) {
    case 'admin':
      return <svg {...iconProps}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-4.5" /></svg>
    case 'manager':
      return <svg {...iconProps}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></svg>
    case 'support':
      return <svg {...iconProps}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="2.5" y="13" width="4" height="7" rx="1.5" /><rect x="17.5" y="13" width="4" height="7" rx="1.5" /><path d="M20 20a3 3 0 0 1-3 3h-3" /></svg>
    case 'seller':
      return <svg {...iconProps}><path d="M3 9l2-5h14l2 5" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /></svg>
    default:
      return <svg {...iconProps}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>
  }
}

export const roleStyles: Record<string, RoleStyle> = {
  admin: { label: 'Administrator', ring: 'ring-rose-300', bg: 'bg-rose-100', text: 'text-rose-700', badge: 'bg-rose-600', glyph: glyph('admin') },
  manager: { label: 'Manager', ring: 'ring-violet-300', bg: 'bg-violet-100', text: 'text-violet-700', badge: 'bg-violet-600', glyph: glyph('manager') },
  support: { label: 'Support', ring: 'ring-sky-300', bg: 'bg-sky-100', text: 'text-sky-700', badge: 'bg-sky-600', glyph: glyph('support') },
  seller: { label: 'Seller', ring: 'ring-emerald-300', bg: 'bg-emerald-100', text: 'text-emerald-700', badge: 'bg-emerald-600', glyph: glyph('seller') },
  customer: { label: 'Customer', ring: 'ring-slate-200', bg: 'bg-slate-100', text: 'text-slate-600', badge: 'bg-slate-500', glyph: glyph('customer') },
}

export function userRoleStyle(role?: string | null): RoleStyle {
  return roleStyles[role || 'customer'] || roleStyles.customer
}

/**
 * Profile icon that reflects the account type. Shows the uploaded avatar when
 * available, otherwise the user's initials, plus a small role badge so an
 * administrator, seller, support agent, manager and customer are easy to tell
 * apart at a glance.
 */
export function UserAvatar({
  name,
  role,
  roleLabel,
  avatarUrl,
  size = 'md',
  showBadge = true,
  className,
}: {
  name?: string | null
  role?: string | null
  roleLabel?: string | null
  avatarUrl?: string | null
  size?: AvatarSize
  showBadge?: boolean
  className?: string
}) {
  const style = userRoleStyle(role)

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-1', style.bg, style.text, style.ring, sizes[size], className)}
      title={`${name || 'User'} · ${roleLabel || style.label}`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name || 'User avatar'} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
      {showBadge && (
        <span className={cn('absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full p-[2px] text-white ring-2 ring-white', style.badge, badgeSizes[size])}>
          {style.glyph}
        </span>
      )}
      <span className="sr-only">{roleLabel || style.label}</span>
    </span>
  )
}
