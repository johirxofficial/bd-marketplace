import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { usePublicSettings } from '../lib/settings'
import { useAuth } from '../context/AuthContext'
import { Badge, Button, Field, Input, Loading, useToast } from '../components/ui'

type SellerApplication = {
  business_name: string
  business_type: string
  phone: string
  status: string
  commission_rate?: string
  rejection_reason?: string | null
  store?: { id: number; name: string; slug: string; status: string } | null
}

export default function SellerApplyPage() {
  const { user } = useAuth()
  const { data: settings } = usePublicSettings()
  const storeName = settings?.store_name || 'Marketplace'
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [form, setForm] = useState({
    business_name: '',
    business_type: 'individual',
    national_id: '',
    phone: user?.phone || '',
    business_address: '',
    store_name: '',
    store_description: '',
  })
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['seller-application'],
    queryFn: async () => (await api.get('/seller/application')).data.seller as SellerApplication | null,
  })

  const apply = useMutation({
    mutationFn: async () => (await api.post('/seller/apply', form)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-application'] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
      push('Application submitted. Our team will review it shortly.')
    },
    onError: (err) => setError(apiError(err, 'Your application could not be submitted.')),
  })

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  if (isLoading) return <Loading label="Checking your seller application…" />

  if (data) {
    const tone = data.status === 'approved' ? 'green' : data.status === 'pending' ? 'amber' : 'red'
    return (
      <div className="container-page py-8">
        <div className="mx-auto max-w-2xl">
          <div className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-xl font-bold text-slate-900">Seller application</h1>
              <Badge tone={tone}>{data.status}</Badge>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-[11px] uppercase tracking-wide text-slate-400">Business</dt><dd className="mt-0.5 font-semibold text-slate-800">{data.business_name}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-slate-400">Store</dt><dd className="mt-0.5 font-semibold text-slate-800">{data.store?.name || '—'}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-slate-400">Business type</dt><dd className="mt-0.5 text-slate-700 capitalize">{data.business_type?.replace(/_/g, ' ')}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-slate-400">Phone</dt><dd className="mt-0.5 text-slate-700">{data.phone}</dd></div>
            </dl>
            {data.status === 'pending' && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Your application is in the review queue. You will receive a notification after an administrator approves or rejects it.
              </p>
            )}
            {data.status === 'approved' && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Your store is approved. {data.store?.status === 'active' ? 'You can start adding products now.' : 'Your store is being activated.'}
                <div className="mt-2"><Link to="/seller" className="inline-flex rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Open seller center</Link></div>
              </div>
            )}
            {data.status === 'rejected' && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <p className="font-semibold">Application not approved</p>
                <p className="mt-0.5">{data.rejection_reason || 'No reason was provided.'}</p>
                <p className="mt-1">Contact support if you believe this was a mistake.</p>
                <Link to="/account/support" className="mt-2 inline-block font-semibold text-rose-700 underline">Open a support ticket</Link>
              </div>
            )}
            {data.status === 'suspended' && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                Your store is suspended. {data.rejection_reason}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">Sell with us</p>
        <h1 className="mt-0.5 text-2xl font-bold text-slate-900">Open your store on {storeName}</h1>
        <p className="mt-1 text-sm text-slate-500">Apply once. After approval, you can publish products, fulfil orders, handle returns, and receive settlements.</p>
        <form onSubmit={(e) => { e.preventDefault(); setError(''); apply.mutate() }} className="card mt-4 space-y-3 p-5">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name" required>
              <Input value={form.business_name} onChange={(e) => set('business_name', e.target.value)} required maxLength={160} />
            </Field>
            <Field label="Business type" required>
              <select className="input" value={form.business_type} onChange={(e) => set('business_type', e.target.value)}>
                <option value="individual">Individual</option>
                <option value="sole_proprietorship">Sole proprietorship</option>
                <option value="partnership">Partnership</option>
                <option value="limited_company">Limited company</option>
              </select>
            </Field>
            <Field label="Contact phone" required hint="Bangladeshi mobile number">
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} required maxLength={20} placeholder="01XXXXXXXXX" />
            </Field>
            <Field label="National ID" hint="Optional">
              <Input value={form.national_id} onChange={(e) => set('national_id', e.target.value)} maxLength={50} />
            </Field>
          </div>
          <Field label="Business address" required>
            <textarea className="input min-h-[75px]" value={form.business_address} onChange={(e) => set('business_address', e.target.value)} required minLength={10} maxLength={1000} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Store name" required hint="Must be unique across the marketplace.">
              <Input value={form.store_name} onChange={(e) => set('store_name', e.target.value)} required maxLength={120} />
            </Field>
            <Field label="Store description" required hint="At least 20 characters. Customers will see this.">
              <textarea className="input min-h-[75px]" value={form.store_description} onChange={(e) => set('store_description', e.target.value)} required minLength={20} maxLength={2000} />
            </Field>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
            Commission is set by the marketplace after review (typically 5–15% per sale, shown in your seller center). COD orders are collected by the platform and settled after delivery windows close.
          </div>
          <Button type="submit" className="w-full" size="lg" loading={apply.isPending}>Submit application</Button>
        </form>
      </div>
    </div>
  )
}
