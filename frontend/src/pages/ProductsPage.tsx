import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Category, Product } from '../lib/types'
import { price } from '../lib/format'
import { ProductCard } from '../components/ProductCard'
import { Button, EmptyState, ErrorState, Field, Input, Loading, Select, cn } from '../components/ui'

type Filters = {
  categories: Category[]
  brands: { id: number; name: string; slug: string }[]
  price_range: { min: number; max: number }
}

const sortOptions = [
  ['relevance', 'Relevance'],
  ['popular', 'Best selling'],
  ['newest', 'Newest first'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Highest rated'],
]

export default function ProductsPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') || '')
  const [minPrice, setMinPrice] = useState(params.get('min_price') || '')
  const [maxPrice, setMaxPrice] = useState(params.get('max_price') || '')

  const page = Number(params.get('page') || 1)
  const category = params.get('category') || ''
  const brands = params.get('brand') || ''
  const rating = params.get('rating') || ''
  const availability = params.get('availability') || 'all'
  const sort = params.get('sort') || 'relevance'
  const activeBrands = brands ? brands.split(',').filter(Boolean) : []

  useEffect(() => {
    setSearch(params.get('search') || '')
    setMinPrice(params.get('min_price') || '')
    setMaxPrice(params.get('max_price') || '')
  }, [params])

  const filterParams = {
    search: params.get('search') || '',
    category,
    brand: brands,
    rating,
    availability,
    sort,
    min_price: params.get('min_price') || '',
    max_price: params.get('max_price') || '',
    page: String(page),
    per_page: '12',
  }

  const { data: filters } = useQuery({
    queryKey: ['product-filters'],
    queryFn: async () => (await api.get('/products/filters')).data as Filters,
    staleTime: 10 * 60 * 1000,
  })

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['products', filterParams],
    queryFn: async () => (await api.get('/products', { params: filterParams })).data,
    placeholderData: keepPreviousData,
  })

  function update(values: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    Object.entries(values).forEach(([key, value]) => {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    })
    if (!('page' in values)) next.delete('page')
    setParams(next, { replace: true })
  }

  function applySearch(e: React.FormEvent) {
    e.preventDefault()
    update({ search: search.trim() || null })
  }

  function applyPrice(e: React.FormEvent) {
    e.preventDefault()
    update({ min_price: minPrice || null, max_price: maxPrice || null })
  }

  function toggleBrand(slug: string) {
    const next = activeBrands.includes(slug)
      ? activeBrands.filter((item) => item !== slug)
      : [...activeBrands, slug]
    update({ brand: next.join(',') || null })
  }

  const products: Product[] = data?.data || []
  const meta = data?.meta || {}
  const categories = filters?.categories || []
  const activeCategory = categories.find((item) => item.slug === category)
  const activeFilters = [
    category ? { label: `Category: ${activeCategory?.name || category}`, clear: () => update({ category: null }) } : null,
    params.get('search') ? { label: `Search: “${params.get('search')}”`, clear: () => update({ search: null }) } : null,
    rating ? { label: `${rating}★ & up`, clear: () => update({ rating: null }) } : null,
    availability === 'in_stock' ? { label: 'In stock only', clear: () => update({ availability: null }) } : null,
    params.get('min_price') || params.get('max_price')
      ? { label: `${price(params.get('min_price') || 0)} – ${price(params.get('max_price') || 0)}`, clear: () => update({ min_price: null, max_price: null }) }
      : null,
  ].filter(Boolean) as { label: string; clear: () => void }[]
  activeBrands.forEach((slug) => {
    const brand = filters?.brands.find((b) => b.slug === slug)
    activeFilters.push({ label: brand?.name || slug, clear: () => toggleBrand(slug) })
  })

  return (
    <div className="container-page py-3">
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        <Link to="/" className="hover:text-brand-600">Home</Link>
        <span>/</span>
        {activeCategory ? (
          <>
            <Link to="/products" className="hover:text-brand-600">All products</Link>
            <span>/</span>
            <span className="text-slate-700">{activeCategory.name}</span>
          </>
        ) : (
          <span className="text-slate-700">All products</span>
        )}
      </nav>

      <div className="dz-section mb-3 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 sm:text-xl">
            {activeCategory ? activeCategory.name : params.get('search') ? `Results for “${params.get('search')}”` : 'All products'}
          </h1>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {meta.total ?? '—'} products from verified sellers · Cash on Delivery available
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label className="shrink-0 text-[11px] font-semibold text-slate-500">Sort by</label>
          <Select value={sort} onChange={(e) => update({ sort: e.target.value === 'relevance' ? null : e.target.value })} className="min-w-[170px]">
            {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[236px_1fr]">
        <aside className="space-y-3">
          <form onSubmit={applySearch} className="dz-section p-3.5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-800">Search in store</p>
            <div className="mt-2 flex gap-1.5">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Product or brand" />
              <Button type="submit" size="sm">Go</Button>
            </div>
          </form>

          <div className="dz-section p-3.5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-800">Categories</p>
            <ul className="mt-2 max-h-[320px] space-y-0.5 overflow-y-auto pr-1 text-sm">
              <li>
                <button onClick={() => update({ category: null })} className={cn('w-full rounded-md px-2 py-1.5 text-left text-[12.5px]', !category ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-600 hover:bg-slate-50')}>
                  All categories
                </button>
              </li>
              {categories.map((item) => (
                <li key={item.id}>
                  <button onClick={() => update({ category: item.slug })} className={cn('w-full rounded-md px-2 py-1.5 text-left text-[12.5px]', category === item.slug ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-600 hover:bg-slate-50')}>
                    {item.name}
                  </button>
                  {!!item.children?.length && (
                    <ul className="ml-2 border-l border-slate-100 pl-2">
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <button onClick={() => update({ category: child.slug })} className={cn('w-full rounded-md px-2 py-1 text-left text-[11.5px]', category === child.slug ? 'font-semibold text-brand-700' : 'text-slate-500 hover:bg-slate-50')}>
                            {child.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="dz-section p-3.5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-800">Price (৳)</p>
            <form onSubmit={applyPrice} className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <Input inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/[^\d]/g, ''))} placeholder={String(Math.floor(filters?.price_range?.min || 0))} aria-label="Minimum price" />
                <span className="text-slate-400">–</span>
                <Input inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d]/g, ''))} placeholder={String(Math.ceil(filters?.price_range?.max || 0))} aria-label="Maximum price" />
              </div>
              <Button type="submit" size="sm" variant="secondary" className="w-full">Apply price</Button>
            </form>
          </div>

          <div className="dz-section p-3.5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-800">Brands</p>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
              {(filters?.brands || []).map((brand) => (
                <label key={brand.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[12.5px] text-slate-600 hover:bg-slate-50">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 text-brand-500 focus:ring-brand-400" checked={activeBrands.includes(brand.slug)} onChange={() => toggleBrand(brand.slug)} />
                  {brand.name}
                </label>
              ))}
              {!filters?.brands?.length && <p className="text-xs text-slate-400">No brands listed yet.</p>}
            </div>
          </div>

          <div className="dz-section space-y-2 p-3.5">
            <Field label="Customer rating">
              <Select value={rating} onChange={(e) => update({ rating: e.target.value })}>
                <option value="">Any rating</option>
                <option value="4">4★ &amp; up</option>
                <option value="3">3★ &amp; up</option>
                <option value="2">2★ &amp; up</option>
              </Select>
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-slate-600">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400" checked={availability === 'in_stock'} onChange={(e) => update({ availability: e.target.checked ? 'in_stock' : null })} />
              In stock only
            </label>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Reset all filters</Button>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-brand-50 to-white p-3.5 ring-1 ring-brand-100">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-brand-700">Need help?</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">Our support team can help with orders, returns, and payments.</p>
            <Link to="/support" className="mt-2 inline-flex text-[11px] font-bold text-brand-600 hover:underline">Visit help center →</Link>
          </div>
        </aside>

        <div>
          {activeFilters.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Filters:</span>
              {activeFilters.map((filter, index) => (
                <button key={`${filter.label}-${index}`} onClick={filter.clear} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                  {filter.label} <span className="text-slate-400">×</span>
                </button>
              ))}
              <button onClick={() => setParams(new URLSearchParams(), { replace: true })} className="text-[11px] font-semibold text-brand-600 hover:underline">Clear all</button>
            </div>
          )}

          {isLoading ? <Loading label="Loading products…" /> : error ? (
            <ErrorState message="Products could not be loaded." onRetry={() => refetch()} />
          ) : products.length === 0 ? (
            <EmptyState
              title="No products matched your filters"
              description="Try a different search term, widen the price range, or reset the filters."
              action={<Button variant="secondary" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Reset filters</Button>}
            />
          ) : (
            <>
              <div className={cn('product-grid', isFetching && 'opacity-60 transition')}>
                {products.map((product) => <ProductCard key={product.id} product={product} />)}
              </div>

              {(meta.last_page || 1) > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 ring-1 ring-slate-100">
                  <p className="text-[11px] text-slate-500">Page {meta.current_page} of {meta.last_page}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</Button>
                    <Button size="sm" variant="secondary" disabled={page >= (meta.last_page || 1)} onClick={() => update({ page: String(page + 1) })}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}

          {!isLoading && products.length > 0 && (
            <p className="mt-4 rounded-lg bg-white p-3 text-[11px] leading-relaxed text-slate-500 ring-1 ring-slate-100">
              All prices are in Bangladeshi Taka (৳) and include applicable seller pricing. Pay with Cash on Delivery, bKash, Nagad, Rocket, or Bangla QR at checkout.
              Product availability is checked again when you place the order. <Link to="/returns-policy" className="link">Return policy</Link> applies.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
