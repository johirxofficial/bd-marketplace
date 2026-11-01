export function money(value: string | number | null | undefined): string {
  const n = Number(value ?? 0)
  return '৳' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Storefront price: ৳1,299 instead of ৳1,299.00 when the amount is whole.
 * Marketplace cards stay compact and easy to scan.
 */
export function price(value: string | number | null | undefined): string {
  const n = Number(value ?? 0)
  return '৳' + n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  })
}

export function compactMoney(value: string | number | null | undefined): string {
  const n = Number(value ?? 0)
  if (n >= 10000000) return '৳' + (n / 10000000).toFixed(2) + ' Cr'
  if (n >= 100000) return '৳' + (n / 100000).toFixed(2) + ' Lakh'
  return money(n)
}

export function date(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function dateTime(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function timeAgo(value?: string | null): string {
  if (!value) return '—'
  const diff = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
  return date(value)
}

const tones: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export function toneClass(tone?: string | null): string {
  return tones[tone || 'slate'] || tones.slate
}

export function statusTone(status?: string | null): string {
  const map: Record<string, string> = {
    pending_confirmation: 'amber', confirmed: 'blue', processing: 'blue', ready_to_ship: 'blue',
    shipped: 'indigo', delivered: 'green', completed: 'green', cancelled: 'red',
    cancellation_requested: 'amber', return_requested: 'amber', returned: 'green',
    requested: 'amber', approved: 'blue', received: 'blue', refunded: 'green', rejected: 'red',
    cod_pending: 'amber', paid: 'green', unpaid: 'amber', failed: 'red', partially_refunded: 'blue',
    active: 'green', pending: 'amber', suspended: 'red', archived: 'slate', draft: 'amber',
    open: 'amber', resolved: 'green', closed: 'slate', earned: 'green', settled: 'blue', reversed: 'red',
  }
  return map[status || ''] || 'slate'
}

export function initials(name?: string | null): string {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

export function daysFrom(min: number, max: number): string {
  return min === max ? `${min} day${min === 1 ? '' : 's'}` : `${min}–${max} days`
}
