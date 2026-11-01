import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { Badge, Button, Card, Field, Input, Loading, PageHeader, Stars, useToast } from '../../components/ui'

function mediaUrl(path?: string | null) {
  return path ? `/media/${path}` : ''
}

export default function SellerStorePage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const logoRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [logoPath, setLogoPath] = useState('')
  const [bannerPath, setBannerPath] = useState('')
  const [uploading, setUploading] = useState<'' | 'logo' | 'banner'>('')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['seller-store'],
    queryFn: async () => (await api.get('/seller/store')).data.store,
  })

  useEffect(() => {
    if (!data || loaded) return
    setName(data.name || '')
    setDescription(data.description || '')
    setLogoPath(data.logo_path || '')
    setBannerPath(data.banner_path || '')
    setLoaded(true)
  }, [data, loaded])

  const save = useMutation({
    mutationFn: async () => (await api.patch('/seller/store', {
      name,
      description,
      logo_path: logoPath || null,
      banner_path: bannerPath || null,
    })).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['seller-store'] })
      push(result.message || 'Store profile updated.')
    },
    onError: (err) => setError(apiError(err, 'The store profile could not be saved.')),
  })

  async function uploadImage(file: File | undefined, target: 'logo' | 'banner') {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      push('Images must be 5 MB or smaller.', 'error')
      return
    }
    setUploading(target)
    try {
      const body = new FormData()
      body.append('image', file)
      body.append('folder', 'products')
      const { data: result } = await api.post('/uploads', body)
      if (target === 'logo') setLogoPath(result.path)
      else setBannerPath(result.path)
      push('Image uploaded. Save the store to apply it.')
    } catch (err) {
      push(apiError(err, 'The image could not be uploaded.'), 'error')
    } finally {
      setUploading('')
    }
  }

  if (isLoading) return <Loading label="Loading store profile…" />
  if (!data) return <p className="text-sm text-slate-500">Store profile could not be loaded. <button className="link" onClick={() => refetch()}>Retry</button></p>

  return (
    <div>
      <PageHeader
        eyebrow="Seller center"
        title="Store settings"
        subtitle="Customers see this branding on your storefront and product pages."
        actions={<Badge tone={data.status === 'active' ? 'green' : 'amber'}>{data.status}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <form onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate() }} className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-bold text-slate-900">Store profile</h2>
            {error && <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
            <div className="mt-3 space-y-3">
              <Field label="Store name" required hint="Changing the name does not change your store URL.">
                <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
              </Field>
              <Field label="Store description" required hint="At least 20 characters. Tell customers what you sell and how you operate.">
                <textarea className="input min-h-[110px]" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={20} maxLength={2000} />
              </Field>
              <Field label="Store URL slug">
                <Input value={data.slug} disabled />
              </Field>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-bold text-slate-900">Branding</h2>
            <p className="mt-1 text-[11px] text-slate-500">Upload a square logo and a wide banner. JPG, PNG, or WebP up to 5 MB.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-[140px_1fr]">
              <div>
                <p className="label">Logo</p>
                <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  {logoPath ? <img src={mediaUrl(logoPath)} alt="Store logo" className="h-full w-full object-cover" /> : <span className="text-xs text-slate-400">No logo</span>}
                </div>
                <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0], 'logo')} />
                <div className="mt-1.5 flex gap-1.5">
                  <Button type="button" size="xs" variant="secondary" loading={uploading === 'logo'} onClick={() => logoRef.current?.click()}>Upload</Button>
                  {logoPath && <Button type="button" size="xs" variant="ghost" onClick={() => setLogoPath('')}>Clear</Button>}
                </div>
              </div>
              <div>
                <p className="label">Banner</p>
                <div className="flex aspect-[3/1] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  {bannerPath ? <img src={mediaUrl(bannerPath)} alt="Store banner" className="h-full w-full object-cover" /> : <span className="text-xs text-slate-400">No banner</span>}
                </div>
                <input ref={bannerRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0], 'banner')} />
                <div className="mt-1.5 flex gap-1.5">
                  <Button type="button" size="xs" variant="secondary" loading={uploading === 'banner'} onClick={() => bannerRef.current?.click()}>Upload</Button>
                  {bannerPath && <Button type="button" size="xs" variant="ghost" onClick={() => setBannerPath('')}>Clear</Button>}
                </div>
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" loading={save.isPending}>Save store profile</Button>
          </div>
        </form>

        <aside className="space-y-3">
          <Card className="p-4">
            <h2 className="text-sm font-bold text-slate-900">Store health</h2>
            <dl className="mt-2 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between"><dt>Status</dt><dd><Badge tone={data.status === 'active' ? 'green' : 'amber'}>{data.status}</Badge></dd></div>
              <div className="flex justify-between"><dt>Rating</dt><dd className="font-semibold">{Number(data.rating_avg || 0).toFixed(1)} / 5</dd></div>
              <div className="flex justify-between"><dt>Reviews</dt><dd className="font-semibold">{data.rating_count || 0}</dd></div>
              <div className="flex justify-between"><dt>Store slug</dt><dd className="font-mono text-[10px]">{data.slug}</dd></div>
            </dl>
            <div className="mt-2"><Stars rating={data.rating_avg} count={data.rating_count} /></div>
          </Card>

          <Card className="p-4 text-[11px] leading-relaxed text-slate-500">
            <h2 className="text-sm font-bold text-slate-900">Why branding matters</h2>
            <p className="mt-1.5">Stores with a complete description and clear images build trust. Customers can see your name on every product page and order.</p>
            <p className="mt-2">Store status changes are controlled by the marketplace. Contact support if your store is suspended.</p>
          </Card>
        </aside>
      </div>
    </div>
  )
}
