import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { date, money } from '../../lib/format'
import type { Coupon } from '../../lib/types'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Textarea, cn, useToast } from '../../components/ui'

type Banner = {
  id: number
  title: string
  subtitle?: string | null
  image_path?: string | null
  link_url?: string | null
  placement: string
  sort_order: number
  is_active: boolean
  starts_at?: string | null
  ends_at?: string | null
}

type CouponForm = {
  id?: number
  code: string
  description: string
  type: 'percent' | 'fixed'
  value: string
  min_order_amount: string
  max_discount: string
  starts_at: string
  expires_at: string
  usage_limit: string
  per_user_limit: string
  applies_to: 'all' | 'category' | 'product' | 'store'
  scope_id: string
  is_active: boolean
}

type BannerForm = {
  id?: number
  title: string
  subtitle: string
  image_path: string
  link_url: string
  placement: string
  sort_order: string
  is_active: boolean
  starts_at: string
  ends_at: string
}

const emptyCoupon: CouponForm = {
  code: '', description: '', type: 'percent', value: '', min_order_amount: '0', max_discount: '',
  starts_at: '', expires_at: '', usage_limit: '', per_user_limit: '1', applies_to: 'all', scope_id: '', is_active: true,
}

const emptyBanner: BannerForm = {
  title: '', subtitle: '', image_path: '', link_url: '', placement: 'home_hero', sort_order: '0', is_active: true, starts_at: '', ends_at: '',
}

const isoDate = (value?: string | null) => (value ? value.slice(0, 10) : '')

export default function AdminMarketingPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'coupons' | 'banners'>('coupons')
  const [couponForm, setCouponForm] = useState<CouponForm | null>(null)
  const [bannerForm, setBannerForm] = useState<BannerForm | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const { data: couponData, isLoading: loadingCoupons, error: couponsError, refetch: refetchCoupons } = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: async () => (await api.get('/admin/coupons')).data.coupons,
  })

  const { data: bannerData, isLoading: loadingBanners, error: bannersError, refetch: refetchBanners } = useQuery({
    queryKey: ['admin-banners'],
    queryFn: async () => (await api.get('/admin/banners')).data.banners as Banner[],
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin-coupons'] })
    queryClient.invalidateQueries({ queryKey: ['admin-banners'] })
    queryClient.invalidateQueries({ queryKey: ['home'] })
  }

  const saveCoupon = useMutation({
    mutationFn: async () => {
      const payload = {
        code: couponForm?.code,
        description: couponForm?.description || null,
        type: couponForm?.type,
        value: Number(couponForm?.value),
        min_order_amount: Number(couponForm?.min_order_amount || 0),
        max_discount: couponForm?.max_discount ? Number(couponForm.max_discount) : null,
        starts_at: couponForm?.starts_at || null,
        expires_at: couponForm?.expires_at || null,
        usage_limit: couponForm?.usage_limit ? Number(couponForm.usage_limit) : null,
        per_user_limit: Number(couponForm?.per_user_limit || 1),
        applies_to: couponForm?.applies_to,
        scope_id: couponForm?.scope_id ? Number(couponForm.scope_id) : null,
        is_active: couponForm?.is_active,
      }
      return couponForm?.id
        ? (await api.patch(`/admin/coupons/${couponForm.id}`, payload)).data
        : (await api.post('/admin/coupons', payload)).data
    },
    onSuccess: (result) => { refresh(); setCouponForm(null); setError(''); push(result.message || 'Coupon saved.') },
    onError: (err) => setError(apiError(err, 'The coupon could not be saved.')),
  })

  const deleteCoupon = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/coupons/${id}`)).data,
    onSuccess: (result) => { refresh(); push(result.message || 'Coupon deleted.') },
    onError: (err) => push(apiError(err, 'The coupon could not be deleted.'), 'error'),
  })

  const saveBanner = useMutation({
    mutationFn: async () => {
      const payload = {
        title: bannerForm?.title,
        subtitle: bannerForm?.subtitle || null,
        image_path: bannerForm?.image_path || null,
        link_url: bannerForm?.link_url || null,
        placement: bannerForm?.placement,
        sort_order: Number(bannerForm?.sort_order || 0),
        is_active: bannerForm?.is_active,
        starts_at: bannerForm?.starts_at || null,
        ends_at: bannerForm?.ends_at || null,
      }
      return bannerForm?.id
        ? (await api.patch(`/admin/banners/${bannerForm.id}`, payload)).data
        : (await api.post('/admin/banners', payload)).data
    },
    onSuccess: (result) => { refresh(); setBannerForm(null); setError(''); push(result.message || 'Banner saved.') },
    onError: (err) => setError(apiError(err, 'The banner could not be saved.')),
  })

  const deleteBanner = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/banners/${id}`)).data,
    onSuccess: (result) => { refresh(); push(result.message || 'Banner deleted.') },
    onError: (err) => push(apiError(err, 'The banner could not be deleted.'), 'error'),
  })

  async function uploadBannerImage(file?: File) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      push('Images must be 5 MB or smaller.', 'error')
      return
    }
    setUploading(true)
    try {
      const body = new FormData()
      body.append('image', file)
      body.append('folder', 'products')
      const { data } = await api.post('/uploads', body)
      setBannerForm((prev) => prev && { ...prev, image_path: data.path })
      push('Banner image uploaded. Save the banner to publish it.')
    } catch (err) {
      push(apiError(err, 'The image could not be uploaded.'), 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const coupons: Coupon[] = couponData?.data || []
  const banners: Banner[] = bannerData || []

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Marketing"
        subtitle="Manage discount coupons and storefront banners. Discount math is validated at checkout."
        actions={tab === 'coupons'
          ? <Button size="sm" onClick={() => { setError(''); setCouponForm({ ...emptyCoupon }) }}>+ New coupon</Button>
          : <Button size="sm" onClick={() => { setError(''); setBannerForm({ ...emptyBanner }) }}>+ New banner</Button>}
      />

      <div className="mb-3 flex gap-1">
        {([['coupons', 'Coupons'], ['banners', 'Banners']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={cn('rounded-full px-3 py-1.5 text-[11px] font-semibold', tab === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}>{label}</button>
        ))}
      </div>

      {tab === 'coupons' && (
        loadingCoupons ? <Loading label="Loading coupons…" /> : couponsError ? (
          <ErrorState message="Coupons could not be loaded." onRetry={() => refetchCoupons()} />
        ) : !coupons.length ? (
          <EmptyState title="No coupons" description="Create a coupon to offer a percentage or fixed discount." />
        ) : (
          <div className="card overflow-hidden">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Code</th><th>Discount</th><th>Minimum</th><th>Usage</th><th>Window</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {coupons.map((coupon) => (
                    <tr key={coupon.id}>
                      <td>
                        <p className="font-mono text-xs font-bold text-slate-800">{coupon.code}</p>
                        <p className="max-w-[180px] truncate text-[10px] text-slate-400">{coupon.description || 'No description'}</p>
                      </td>
                      <td className="text-xs">{coupon.type === 'percent' ? `${Number(coupon.value)}%` : money(coupon.value)}{coupon.max_discount ? <span className="block text-[10px] text-slate-400">max {money(coupon.max_discount)}</span> : null}</td>
                      <td className="text-xs">{money(coupon.min_order_amount || 0)}</td>
                      <td className="text-xs">{coupon.used_count || 0}{coupon.usage_limit ? ` / ${coupon.usage_limit}` : ''}<span className="block text-[10px] text-slate-400">{coupon.per_user_limit || 1} per user</span></td>
                      <td className="text-[10px] text-slate-500">{coupon.starts_at ? date(coupon.starts_at) : 'Anytime'}<br />{coupon.expires_at ? `to ${date(coupon.expires_at)}` : 'no expiry'}</td>
                      <td><Badge tone={coupon.is_active ? 'green' : 'slate'}>{coupon.is_active ? 'Active' : 'Disabled'}</Badge></td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button
                            className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50"
                            onClick={() => {
                              setError('')
                              setCouponForm({
                                id: coupon.id,
                                code: coupon.code,
                                description: coupon.description || '',
                                type: coupon.type,
                                value: String(Number(coupon.value)),
                                min_order_amount: String(Number(coupon.min_order_amount || 0)),
                                max_discount: coupon.max_discount ? String(Number(coupon.max_discount)) : '',
                                starts_at: isoDate(coupon.starts_at),
                                expires_at: isoDate(coupon.expires_at),
                                usage_limit: coupon.usage_limit ? String(coupon.usage_limit) : '',
                                per_user_limit: String(coupon.per_user_limit || 1),
                                applies_to: (coupon.applies_to as CouponForm['applies_to']) || 'all',
                                scope_id: coupon.scope_id ? String(coupon.scope_id) : '',
                                is_active: coupon.is_active,
                              })
                            }}
                          >Edit</button>
                          <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50" onClick={() => { if (window.confirm(`Delete coupon ${coupon.code}?`)) deleteCoupon.mutate(coupon.id) }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {tab === 'banners' && (
        loadingBanners ? <Loading label="Loading banners…" /> : bannersError ? (
          <ErrorState message="Banners could not be loaded." onRetry={() => refetchBanners()} />
        ) : !banners.length ? (
          <EmptyState title="No banners" description="Add a hero or strip banner to promote categories, campaigns, or sellers." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {banners.map((banner) => (
              <div key={banner.id} className="card overflow-hidden">
                <div className="aspect-[3/1] bg-slate-100">
                  {banner.image_path ? <img src={`/media/${banner.image_path}`} alt={banner.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">No image</div>}
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{banner.title}</p>
                      <p className="truncate text-[11px] text-slate-500">{banner.subtitle || 'No subtitle'}</p>
                    </div>
                    <Badge tone={banner.is_active ? 'green' : 'slate'}>{banner.is_active ? 'Active' : 'Hidden'}</Badge>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">{banner.placement.replace(/_/g, ' ')} · sort {banner.sort_order} · {banner.link_url || 'no link'}</p>
                  <div className="mt-2 flex justify-end gap-1">
                    <button
                      className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50"
                      onClick={() => {
                        setError('')
                        setBannerForm({
                          id: banner.id, title: banner.title, subtitle: banner.subtitle || '', image_path: banner.image_path || '',
                          link_url: banner.link_url || '', placement: banner.placement, sort_order: String(banner.sort_order ?? 0),
                          is_active: banner.is_active, starts_at: isoDate(banner.starts_at), ends_at: isoDate(banner.ends_at),
                        })
                      }}
                    >Edit</button>
                    <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50" onClick={() => { if (window.confirm(`Delete banner “${banner.title}”?`)) deleteBanner.mutate(banner.id) }}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <Modal open={!!couponForm} onClose={() => setCouponForm(null)} title={couponForm?.id ? 'Edit coupon' : 'New coupon'} footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setCouponForm(null)}>Cancel</Button>
          <Button size="sm" loading={saveCoupon.isPending} disabled={!couponForm?.code || !couponForm?.value} onClick={() => saveCoupon.mutate()}>Save coupon</Button>
        </>
      }>
        {couponForm && (
          <div className="space-y-3">
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Coupon code" required hint="Letters, numbers, dashes. Stored uppercase.">
                <Input value={couponForm.code} onChange={(e) => setCouponForm((prev) => prev && { ...prev, code: e.target.value.toUpperCase().replace(/\s+/g, '') })} maxLength={40} />
              </Field>
              <Field label="Discount type" required>
                <select className="input" value={couponForm.type} onChange={(e) => setCouponForm((prev) => prev && { ...prev, type: e.target.value as 'percent' | 'fixed' })}>
                  <option value="percent">Percentage off</option>
                  <option value="fixed">Fixed amount off</option>
                </select>
              </Field>
              <Field label={couponForm.type === 'percent' ? 'Percentage (%)' : 'Amount (৳)'} required>
                <Input inputMode="decimal" value={couponForm.value} onChange={(e) => setCouponForm((prev) => prev && { ...prev, value: e.target.value })} />
              </Field>
              <Field label="Minimum order (৳)">
                <Input inputMode="decimal" value={couponForm.min_order_amount} onChange={(e) => setCouponForm((prev) => prev && { ...prev, min_order_amount: e.target.value })} />
              </Field>
              <Field label="Maximum discount (৳)" hint="Percent coupons only. Optional cap.">
                <Input inputMode="decimal" value={couponForm.max_discount} onChange={(e) => setCouponForm((prev) => prev && { ...prev, max_discount: e.target.value })} />
              </Field>
              <Field label="Applies to" required>
                <select className="input" value={couponForm.applies_to} onChange={(e) => setCouponForm((prev) => prev && { ...prev, applies_to: e.target.value as CouponForm['applies_to'] })}>
                  <option value="all">All products</option>
                  <option value="category">A category</option>
                  <option value="product">A product</option>
                  <option value="store">A store</option>
                </select>
              </Field>
              {couponForm.applies_to !== 'all' && (
                <Field label="Scope ID" required hint="Numeric category, product, or store ID.">
                  <Input inputMode="numeric" value={couponForm.scope_id} onChange={(e) => setCouponForm((prev) => prev && { ...prev, scope_id: e.target.value.replace(/[^\d]/g, '') })} />
                </Field>
              )}
              <Field label="Total usage limit" hint="Leave empty for unlimited.">
                <Input inputMode="numeric" value={couponForm.usage_limit} onChange={(e) => setCouponForm((prev) => prev && { ...prev, usage_limit: e.target.value.replace(/[^\d]/g, '') })} />
              </Field>
              <Field label="Per customer limit" required>
                <Input inputMode="numeric" value={couponForm.per_user_limit} onChange={(e) => setCouponForm((prev) => prev && { ...prev, per_user_limit: e.target.value.replace(/[^\d]/g, '') })} />
              </Field>
              <Field label="Starts at">
                <Input type="date" value={couponForm.starts_at} onChange={(e) => setCouponForm((prev) => prev && { ...prev, starts_at: e.target.value })} />
              </Field>
              <Field label="Expires at">
                <Input type="date" value={couponForm.expires_at} min={couponForm.starts_at || undefined} onChange={(e) => setCouponForm((prev) => prev && { ...prev, expires_at: e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <Input value={couponForm.description} onChange={(e) => setCouponForm((prev) => prev && { ...prev, description: e.target.value })} maxLength={255} />
            </Field>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={couponForm.is_active} onChange={(e) => setCouponForm((prev) => prev && { ...prev, is_active: e.target.checked })} />
              Active and redeemable
            </label>
          </div>
        )}
      </Modal>

      <Modal open={!!bannerForm} onClose={() => setBannerForm(null)} title={bannerForm?.id ? 'Edit banner' : 'New banner'} footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setBannerForm(null)}>Cancel</Button>
          <Button size="sm" loading={saveBanner.isPending} disabled={!bannerForm?.title} onClick={() => saveBanner.mutate()}>Save banner</Button>
        </>
      }>
        {bannerForm && (
          <div className="space-y-3">
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" required>
                <Input value={bannerForm.title} onChange={(e) => setBannerForm((prev) => prev && { ...prev, title: e.target.value })} maxLength={160} />
              </Field>
              <Field label="Subtitle">
                <Input value={bannerForm.subtitle} onChange={(e) => setBannerForm((prev) => prev && { ...prev, subtitle: e.target.value })} maxLength={255} />
              </Field>
              <Field label="Placement" required>
                <select className="input" value={bannerForm.placement} onChange={(e) => setBannerForm((prev) => prev && { ...prev, placement: e.target.value })}>
                  <option value="home_hero">Home hero</option>
                  <option value="home_strip">Home strip</option>
                  <option value="category">Category page</option>
                </select>
              </Field>
              <Field label="Link URL" hint="Relative path, e.g. /products?category=electronics">
                <Input value={bannerForm.link_url} onChange={(e) => setBannerForm((prev) => prev && { ...prev, link_url: e.target.value })} maxLength={255} />
              </Field>
              <Field label="Sort order" hint="Lower numbers appear first.">
                <Input inputMode="numeric" value={bannerForm.sort_order} onChange={(e) => setBannerForm((prev) => prev && { ...prev, sort_order: e.target.value.replace(/[^\d]/g, '') })} />
              </Field>
              <Field label="Starts at">
                <Input type="date" value={bannerForm.starts_at} onChange={(e) => setBannerForm((prev) => prev && { ...prev, starts_at: e.target.value })} />
              </Field>
              <Field label="Ends at">
                <Input type="date" value={bannerForm.ends_at} min={bannerForm.starts_at || undefined} onChange={(e) => setBannerForm((prev) => prev && { ...prev, ends_at: e.target.value })} />
              </Field>
            </div>

            <div>
              <p className="label">Banner image</p>
              <div className="mt-1 flex items-center gap-3">
                <div className="aspect-[3/1] w-40 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {bannerForm.image_path ? <img src={`/media/${bannerForm.image_path}`} alt="Banner preview" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[10px] text-slate-400">No image</div>}
                </div>
                <div>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => uploadBannerImage(e.target.files?.[0])} />
                  <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>Upload image</Button>
                  {bannerForm.image_path && <Button size="sm" variant="ghost" className="ml-1" onClick={() => setBannerForm((prev) => prev && { ...prev, image_path: '' })}>Clear</Button>}
                  <p className="mt-1 text-[10px] text-slate-400">JPG, PNG, or WebP up to 5 MB. Recommended 1500×500.</p>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={bannerForm.is_active} onChange={(e) => setBannerForm((prev) => prev && { ...prev, is_active: e.target.checked })} />
              Active in the storefront
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
