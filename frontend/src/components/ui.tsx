import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toneClass } from '../lib/format'

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type ButtonProps = {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'dark'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  loading?: boolean
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
  title?: string
}

const variants: Record<string, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 focus:ring-brand-200 shadow-sm',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 focus:ring-brand-200',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 focus:ring-slate-200',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-200',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-200',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-300',
}

const sizes: Record<string, string> = {
  xs: 'px-2.5 py-1 text-xs rounded-md gap-1',
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-lg gap-2',
}

export function Button({ children, variant = 'primary', size = 'md', loading, className, type = 'button', disabled, onClick, title }: ButtonProps) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant], sizes[size], className,
      )}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
}

export function LinkButton({ to, children, variant = 'primary', size = 'md', className }: { to: string; children: ReactNode; variant?: string; size?: string; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition focus:outline-none focus:ring-2',
        variants[variant] || variants.primary, sizes[size] || sizes.md, className,
      )}
    >
      {children}
    </Link>
  )
}

export function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={cn('animate-spin text-current', className)} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

export function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 py-16 text-sm text-slate-500', className)}>
      <Spinner /> {label}
    </div>
  )
}

export function Badge({ children, tone, className }: { children: ReactNode; tone?: string | null; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', toneClass(tone), className)}>
      {children}
    </span>
  )
}

export function Field({ label, hint, error, required, children, className }: { label?: string; hint?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}{required && <span className="text-rose-500"> *</span>}</label>}
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return <input {...rest} className={cn('input', className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props
  return <select {...rest} className={cn('input', className)}>{children}</select>
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props
  return <textarea {...rest} className={cn('input min-h-[90px]', className)} />
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card', className)}>{children}</div>
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">{eyebrow}</p>}
        <h1 className="mt-0.5 text-xl text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon || <span className="text-xl">∅</span>}
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
      <p className="font-semibold">Unable to load this page</p>
      <p className="mt-1">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 py-10 backdrop-blur-sm" onMouseDown={onClose}>
      <div className={cn('w-full rounded-2xl bg-white shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function StatCard({ label, value, hint, tone = 'slate', icon }: { label: string; value: ReactNode; hint?: string; tone?: string; icon?: ReactNode }) {
  const toneStyles: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700', brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-sky-50 text-sky-700', red: 'bg-rose-50 text-rose-700',
  }
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 truncate text-xl font-bold text-slate-900">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>}
        </div>
        {icon && <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneStyles[tone] || toneStyles.slate)}>{icon}</div>}
      </div>
    </div>
  )
}

export function Pagination({ page, lastPage, onChange, total }: { page: number; lastPage: number; onChange: (page: number) => void; total?: number }) {
  if (!lastPage || lastPage <= 1) return null
  const pages: number[] = []
  const start = Math.max(1, page - 2)
  const end = Math.min(lastPage, page + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">{total !== undefined ? `${total} total` : ''}</p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
        {start > 1 && <Button size="sm" variant="ghost" onClick={() => onChange(1)}>1</Button>}
        {start > 2 && <span className="px-1 text-slate-400">…</span>}
        {pages.map((p) => (
          <button key={p} onClick={() => onChange(p)} className={cn('h-8 min-w-8 rounded-lg px-2 text-xs font-semibold', p === page ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100')}>{p}</button>
        ))}
        {end < lastPage - 1 && <span className="px-1 text-slate-400">…</span>}
        {end < lastPage && <Button size="sm" variant="ghost" onClick={() => onChange(lastPage)}>{lastPage}</Button>}
        <Button size="sm" variant="secondary" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>Next</Button>
      </div>
    </div>
  )
}

type ToastKind = 'success' | 'error' | 'info'
type ToastItem = { id: number; message: string; kind: ToastKind }
const ToastContext = createContext<{ push: (message: string, kind?: ToastKind) => void }>({ push: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { id, message, kind }])
    window.setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 5000)
  }, [])
  const value = useMemo(() => ({ push }), [push])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg',
              item.kind === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              item.kind === 'error' && 'border-rose-200 bg-rose-50 text-rose-800',
              item.kind === 'info' && 'border-sky-200 bg-sky-50 text-sky-800',
            )}
          >
            <span className="mt-0.5 text-base leading-none">{item.kind === 'success' ? '✓' : item.kind === 'error' ? '!' : 'i'}</span>
            <p className="flex-1">{item.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

export function Stars({ rating, count, size = 'sm' }: { rating?: number | string | null; count?: number; size?: 'sm' | 'md' }) {
  const value = Math.round(Number(rating || 0))
  return (
    <span className="inline-flex items-center gap-0.5" title={`${Number(rating || 0).toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} className={cn(size === 'sm' ? 'h-3 w-3' : 'h-4 w-4', star <= value ? 'text-amber-400' : 'text-slate-300')} viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.3 4.02a1 1 0 00.95.69h4.22c.97 0 1.37 1.24.59 1.81l-3.42 2.48a1 1 0 00-.36 1.12l1.3 4.02c.3.92-.75 1.69-1.54 1.12l-3.42-2.48a1 1 0 00-1.18 0l-3.42 2.48c-.79.57-1.84-.2-1.54-1.12l1.3-4.02a1 1 0 00-.36-1.12L1.99 9.45c-.78-.57-.38-1.81.59-1.81h4.22a1 1 0 00.95-.69l1.3-4.02z" />
        </svg>
      ))}
      {count !== undefined && <span className="ml-1 text-[11px] text-slate-500">({count})</span>}
    </span>
  )
}
