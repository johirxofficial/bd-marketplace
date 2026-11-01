import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { date, money } from '../../lib/format'
import type { Product } from '../../lib/types'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Pagination, Textarea, useToast } from '../../components/ui'

type ModerationAction = { product: Product; status: 'approved' | 'rejected' | 'pending' | 'archived' } | null

export default function AdminProductsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<ModerationAction>(null)
  const [reason, setReason] = useState('')
  const [featured, setFeatured] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-products', status, term, page],
    queryFn: async () => (await api.get('/admin/products', { params: { status: status || undefined, search: term || undefined, page } })).data,
    placeholderData: keepPreviousData,
  })

  const { data: detail } = useQuery({
    queryKey: ['admin-product', detailId],
    queryFn: async () => (await api.get(`/admin/products/${detailId}`)).data,
    enabled: !!detailId,
  })

  const products: Product[] = data?.data || []
  const meta = data?.meta || {}

  const moderate = useMutation({
    mutationFn: async () => (await api.patch(`/admin/products/${action?.product.id}/status`, {
      status: action?.status,
      reason: action?.status === 'rejected' ? reason : undefined,
      is_featured: featured,
    })).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      queryClient.invalidateQueries({ queryKey: ['admin-product', detailId] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      setAction(null)
      setReason('')
      push(result.message || 'Product status updated.')
    },
    onError: (err) => push(apiError(err, 'The product status could not be updated.'), 'error'),
  })

  function openAction(product: Product, next: 'approved' | 'rejected' | 'pending' | 'archived') {
    setAction({ product, status: next })
    setReason(product.rejection_reason || '')
    setFeatured(!!product.is_featured)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Product moderation"
        subtitle="Approve, reject, feature, or archive seller listings. Every decision notifies the seller."
      />

      <div className="card mb-3 flex flex-wrap items-end gap-2 p-3">
        <form onSubmit={(e) => { e.preventDefault(); setTerm(search); setPage(1) }} className="flex min-w-[220px] flex-1 gap-1.5">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product name or SKU" />
          <Button type="submit" size="sm" variant="secondary">Search</Button>
        </form>
        <select className="input max-w-[180px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          <option value="pending">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {isLoading ? <Loading label="Loading products…" /> : error ? (
        <ErrorState message="Products could not be loaded." onRetry={() => refetch()} />
      ) : !products.length ? (
        <EmptyState title="No products matched" description="Try a different status or search term." />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Product</th><th>Store</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                          {product.image_url ? <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="min-w-0">
                          <button onClick={() => setDetailId(product.id)} className="line-clamp-1 text-left text-xs font-semibold text-slate-800 hover:text-brand-600">{product.name}</button>
                          <p className="font-mono text-[10px] text-slate-400">{product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-xs">{product.store?.name || '—'}</td>
                    <td className="text-xs">{product.category?.name || '—'}</td>
                    <td className="text-xs font-semibold">{money(product.price)}</td>
                    <td className={product.stock && product.stock > 0 ? 'text-xs' : 'text-xs font-semibold text-rose-600'}>{product.stock ?? 0}</td>
                    <td>
                      <Badge tone={product.status_tone}>{product.status_label}</Badge>
                      {product.is_featured && <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600">Featured</p>}
                      {product.status === 'rejected' && product.rejection_reason && <p className="mt-1 max-w-[180px] text-[10px] text-rose-600">{product.rejection_reason}</p>}
                    </td>
                    <td className="text-[11px] text-slate-500">{date((product as unknown as { updated_at?: string }).updated_at)}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1">
                        {product.status !== 'approved' && (
                          <button onClick={() => openAction(product, 'approved')} className="rounded-md px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">Approve</button>
                        )}
                        {product.status !== 'rejected' && (
                          <button onClick={() => openAction(product, 'rejected')} className="rounded-md px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50">Reject</button>
                        )}
                        {product.status === 'approved' && (
                          <button onClick={() => openAction(product, product.is_featured ? 'approved' : 'approved')} className="rounded-md px-2 py-1 text-[11px] font-semibold text-amber-600 hover:bg-amber-50">Feature</button>
                        )}
                        {product.status !== 'archived' && (
                          <button onClick={() => openAction(product, 'archived')} className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">Archive</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 pb-3"><Pagination page={meta.current_page || 1} lastPage={meta.last_page || 1} total={meta.total} onChange={setPage} /></div>
        </div>
      )}

      <Modal open={!!action} onClose={() => setAction(null)} title={action ? `${action.status === 'approved' ? 'Approve' : action.status === 'rejected' ? 'Reject' : action.status === 'archived' ? 'Archive' : 'Move to review'} product` : ''} footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
          <Button
            size="sm"
            variant={action?.status === 'rejected' ? 'danger' : 'primary'}
            loading={moderate.isPending}
            disabled={action?.status === 'rejected' && reason.trim().length < 5}
            onClick={() => moderate.mutate()}
          >
            {action?.status === 'rejected' ? 'Reject product' : 'Save decision'}
          </Button>
        </>
      }>
        {action && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <p className="font-semibold text-slate-800">{action.product.name}</p>
              <p className="text-slate-500">{action.product.store?.name} · SKU {action.product.sku}</p>
            </div>
            {action.status === 'rejected' && (
              <Field label="Rejection reason" required hint="Shown to the seller. At least 5 characters.">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="e.g. Images are stock photos that do not match the product description." />
              </Field>
            )}
            {action.status === 'approved' && (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
                Feature this product on the storefront
              </label>
            )}
            <p className="rounded bg-slate-50 px-2.5 py-2 text-[10px] leading-relaxed text-slate-500">
              Approved products become visible to customers immediately. Rejections and archiving notify the seller and are recorded in the audit log.
            </p>
          </div>
        )}
      </Modal>

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={detail?.product?.name || 'Product detail'} wide>
        {!detail ? <Loading label="Loading product…" /> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <Badge tone={detail.product.status_tone}>{detail.product.status_label}</Badge>
              <span className="font-mono">{detail.product.sku}</span>
              <span>{detail.product.store?.name}</span>
              {detail.seller && <span>· Seller: {detail.seller.name} ({detail.seller.email})</span>}
            </div>
            {!!detail.product.images?.length && (
              <div className="flex gap-2 overflow-x-auto">
                {detail.product.images.map((image: { id: number; url: string }) => (
                  <img key={image.id} src={image.url} alt="" className="h-24 w-24 shrink-0 rounded-lg border border-slate-200 object-cover" />
                ))}
              </div>
            )}
            <div className="grid gap-3 text-xs sm:grid-cols-3">
              <div><p className="text-slate-400">Price</p><p className="font-semibold">{money(detail.product.price)}</p></div>
              <div><p className="text-slate-400">Compare at</p><p className="font-semibold">{detail.product.compare_at_price ? money(detail.product.compare_at_price) : '—'}</p></div>
              <div><p className="text-slate-400">Stock</p><p className="font-semibold">{detail.product.stock}</p></div>
              <div><p className="text-slate-400">Rating</p><p className="font-semibold">{Number(detail.product.rating_avg).toFixed(1)} ({detail.product.rating_count})</p></div>
              <div><p className="text-slate-400">Sold</p><p className="font-semibold">{detail.product.sold_count}</p></div>
              <div><p className="text-slate-400">Featured</p><p className="font-semibold">{detail.product.is_featured ? 'Yes' : 'No'}</p></div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Description</p>
              <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">{detail.product.description || 'No description.'}</p>
            </div>
            {!!detail.product.variants?.length && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Variants</p>
                <div className="mt-1 overflow-hidden rounded-lg border border-slate-200">
                  <table className="table">
                    <thead><tr><th>Name</th><th>SKU</th><th>Price</th><th>Stock</th></tr></thead>
                    <tbody>
                      {detail.product.variants.map((variant: { id: number; name: string; sku: string; price: string; stock: number }) => (
                        <tr key={variant.id}>
                          <td className="text-xs">{variant.name}</td>
                          <td className="font-mono text-[10px]">{variant.sku}</td>
                          <td className="text-xs">{money(variant.price)}</td>
                          <td className="text-xs">{variant.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
