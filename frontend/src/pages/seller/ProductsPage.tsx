import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { date, money } from '../../lib/format'
import type { Product } from '../../lib/types'
import { Badge, Button, EmptyState, ErrorState, Input, LinkButton, Loading, PageHeader, Pagination, useToast } from '../../components/ui'

export default function SellerProductsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['seller-products', status, term, page],
    queryFn: async () => (await api.get('/seller/products', { params: { status: status || undefined, search: term || undefined, page } })).data,
    placeholderData: keepPreviousData,
  })

  const archive = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/seller/products/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-products'] })
      push('Product archived. Historical orders are preserved.')
    },
    onError: (err) => push(apiError(err, 'The product could not be archived.'), 'error'),
  })

  const products: Product[] = data?.data || []
  const meta = data?.meta || {}

  return (
    <div>
      <PageHeader
        eyebrow="Seller center"
        title="Products"
        subtitle="Create listings, manage stock, and track moderation status."
        actions={<LinkButton to="/seller/products/new" size="sm">+ Add product</LinkButton>}
      />

      <div className="card mb-3 flex flex-wrap items-end gap-2 p-3">
        <form onSubmit={(e) => { e.preventDefault(); setTerm(search); setPage(1) }} className="flex min-w-[220px] flex-1 gap-1.5">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product name or SKU" />
          <Button type="submit" size="sm" variant="secondary">Search</Button>
        </form>
        <select className="input max-w-[170px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending review</option>
          <option value="rejected">Rejected</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {isLoading ? <Loading label="Loading products…" /> : error ? (
        <ErrorState message="Products could not be loaded." onRetry={() => refetch()} />
      ) : !products.length ? (
        <EmptyState
          title={term ? 'No products match this search' : 'No products yet'}
          description="Submit your first product for moderation. Approved products become visible in the marketplace."
          action={<LinkButton to="/seller/products/new" size="sm">Add your first product</LinkButton>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Updated</th><th></th></tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <Link to={`/seller/products/${product.id}/edit`} className="line-clamp-1 text-xs font-semibold text-slate-800 hover:text-brand-600">{product.name}</Link>
                          <p className="font-mono text-[10px] text-slate-400">{product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-xs">{product.category?.name || '—'}</td>
                    <td className="text-xs font-semibold">{money(product.price)}</td>
                    <td className="text-xs">{product.stock ?? 0}</td>
                    <td>
                      <Badge tone={product.status_tone}>{product.status_label}</Badge>
                      {product.status === 'rejected' && product.rejection_reason && <p className="mt-1 max-w-[180px] text-[10px] text-rose-600">{product.rejection_reason}</p>}
                    </td>
                    <td className="text-[11px] text-slate-500">{date((product as any).updated_at)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Link to={`/seller/products/${product.id}/edit`} className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50">Edit</Link>
                        {product.status !== 'archived' && (
                          <button
                            onClick={() => { if (window.confirm(`Archive “${product.name}”? It will be removed from the storefront.`)) archive.mutate(product.id) }}
                            className="rounded-md px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                          >Archive</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 pb-3">
            <Pagination page={meta.current_page || 1} lastPage={meta.last_page || 1} total={meta.total} onChange={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}
