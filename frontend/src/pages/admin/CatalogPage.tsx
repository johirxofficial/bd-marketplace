import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Textarea, cn, useToast } from '../../components/ui'

type Category = {
  id: number
  parent_id?: number | null
  name: string
  slug: string
  description?: string | null
  icon?: string | null
  sort_order?: number
  is_active: boolean
  products_count?: number
  children_count?: number
  parent?: { id: number; name: string } | null
}

type Brand = {
  id: number
  name: string
  slug: string
  description?: string | null
  is_active: boolean
  products_count?: number
}

type CategoryForm = { id?: number; parent_id: string; name: string; slug: string; description: string; icon: string; sort_order: string; is_active: boolean }
type BrandForm = { id?: number; name: string; slug: string; description: string; is_active: boolean }

const emptyCategory: CategoryForm = { parent_id: '', name: '', slug: '', description: '', icon: '', sort_order: '0', is_active: true }
const emptyBrand: BrandForm = { name: '', slug: '', description: '', is_active: true }

export default function AdminCatalogPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [tab, setTab] = useState<'categories' | 'brands'>('categories')
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null)
  const [brandForm, setBrandForm] = useState<BrandForm | null>(null)
  const [error, setError] = useState('')

  const { data: categories, isLoading: loadingCategories, error: categoriesError, refetch: refetchCategories } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => (await api.get('/admin/categories')).data.categories as Category[],
  })

  const { data: brands, isLoading: loadingBrands, error: brandsError, refetch: refetchBrands } = useQuery({
    queryKey: ['admin-brands'],
    queryFn: async () => (await api.get('/admin/brands')).data.brands as Brand[],
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
    queryClient.invalidateQueries({ queryKey: ['admin-brands'] })
    queryClient.invalidateQueries({ queryKey: ['product-filters'] })
  }

  const saveCategory = useMutation({
    mutationFn: async () => {
      const payload = {
        parent_id: categoryForm?.parent_id ? Number(categoryForm.parent_id) : null,
        name: categoryForm?.name,
        slug: categoryForm?.slug || undefined,
        description: categoryForm?.description || null,
        icon: categoryForm?.icon || null,
        sort_order: Number(categoryForm?.sort_order || 0),
        is_active: categoryForm?.is_active,
      }
      return categoryForm?.id
        ? (await api.patch(`/admin/categories/${categoryForm.id}`, payload)).data
        : (await api.post('/admin/categories', payload)).data
    },
    onSuccess: (result) => { refresh(); setCategoryForm(null); push(result.message || 'Category saved.') },
    onError: (err) => setError(apiError(err, 'The category could not be saved.')),
  })

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/categories/${id}`)).data,
    onSuccess: (result) => { refresh(); push(result.message || 'Category deleted.') },
    onError: (err) => push(apiError(err, 'The category could not be deleted.'), 'error'),
  })

  const saveBrand = useMutation({
    mutationFn: async () => {
      const payload = {
        name: brandForm?.name,
        slug: brandForm?.slug || undefined,
        description: brandForm?.description || null,
        is_active: brandForm?.is_active,
      }
      return brandForm?.id
        ? (await api.patch(`/admin/brands/${brandForm.id}`, payload)).data
        : (await api.post('/admin/brands', payload)).data
    },
    onSuccess: (result) => { refresh(); setBrandForm(null); push(result.message || 'Brand saved.') },
    onError: (err) => setError(apiError(err, 'The brand could not be saved.')),
  })

  const deleteBrand = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/brands/${id}`)).data,
    onSuccess: (result) => { refresh(); push(result.message || 'Brand deleted.') },
    onError: (err) => push(apiError(err, 'The brand could not be deleted.'), 'error'),
  })

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Catalog"
        subtitle="Manage the category tree and brands used by sellers when listing products."
        actions={tab === 'categories'
          ? <Button size="sm" onClick={() => { setError(''); setCategoryForm({ ...emptyCategory }) }}>+ New category</Button>
          : <Button size="sm" onClick={() => { setError(''); setBrandForm({ ...emptyBrand }) }}>+ New brand</Button>}
      />

      <div className="mb-3 flex gap-1">
        {([['categories', 'Categories'], ['brands', 'Brands']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn('rounded-full px-3 py-1.5 text-[11px] font-semibold', tab === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}
          >{label}</button>
        ))}
      </div>

      {tab === 'categories' && (
        loadingCategories ? <Loading label="Loading categories…" /> : categoriesError ? (
          <ErrorState message="Categories could not be loaded." onRetry={() => refetchCategories()} />
        ) : !categories?.length ? (
          <EmptyState title="No categories" description="Create the first category so sellers can list products." />
        ) : (
          <div className="card overflow-hidden">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Category</th><th>Parent</th><th>Products</th><th>Children</th><th>Sort</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id}>
                      <td>
                        <p className="text-xs font-semibold text-slate-800">{category.icon ? `${category.icon} ` : ''}{category.name}</p>
                        <p className="font-mono text-[10px] text-slate-400">{category.slug}</p>
                      </td>
                      <td className="text-xs text-slate-600">{category.parent?.name || 'Top level'}</td>
                      <td className="text-xs">{category.products_count ?? 0}</td>
                      <td className="text-xs">{category.children_count ?? 0}</td>
                      <td className="text-xs">{category.sort_order ?? 0}</td>
                      <td><Badge tone={category.is_active ? 'green' : 'slate'}>{category.is_active ? 'Active' : 'Hidden'}</Badge></td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button
                            className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50"
                            onClick={() => { setError(''); setCategoryForm({ id: category.id, parent_id: category.parent_id ? String(category.parent_id) : '', name: category.name, slug: category.slug, description: category.description || '', icon: category.icon || '', sort_order: String(category.sort_order ?? 0), is_active: category.is_active }) }}
                          >Edit</button>
                          <button
                            className="rounded-md px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                            onClick={() => { if (window.confirm(`Delete “${category.name}”? Categories with products or children cannot be deleted.`)) deleteCategory.mutate(category.id) }}
                          >Delete</button>
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

      {tab === 'brands' && (
        loadingBrands ? <Loading label="Loading brands…" /> : brandsError ? (
          <ErrorState message="Brands could not be loaded." onRetry={() => refetchBrands()} />
        ) : !brands?.length ? (
          <EmptyState title="No brands" description="Create brands so sellers can attribute products." />
        ) : (
          <div className="card overflow-hidden">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Brand</th><th>Products</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {brands.map((brand) => (
                    <tr key={brand.id}>
                      <td>
                        <p className="text-xs font-semibold text-slate-800">{brand.name}</p>
                        <p className="font-mono text-[10px] text-slate-400">{brand.slug}</p>
                      </td>
                      <td className="text-xs">{brand.products_count ?? 0}</td>
                      <td><Badge tone={brand.is_active ? 'green' : 'slate'}>{brand.is_active ? 'Active' : 'Hidden'}</Badge></td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button
                            className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50"
                            onClick={() => { setError(''); setBrandForm({ id: brand.id, name: brand.name, slug: brand.slug, description: brand.description || '', is_active: brand.is_active }) }}
                          >Edit</button>
                          <button
                            className="rounded-md px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                            onClick={() => { if (window.confirm(`Delete “${brand.name}”? Brands linked to products cannot be deleted.`)) deleteBrand.mutate(brand.id) }}
                          >Delete</button>
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

      <Modal open={!!categoryForm} onClose={() => setCategoryForm(null)} title={categoryForm?.id ? 'Edit category' : 'New category'} footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setCategoryForm(null)}>Cancel</Button>
          <Button size="sm" loading={saveCategory.isPending} disabled={!categoryForm?.name} onClick={() => saveCategory.mutate()}>Save category</Button>
        </>
      }>
        {categoryForm && (
          <div className="space-y-3">
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category name" required>
                <Input value={categoryForm.name} onChange={(e) => setCategoryForm((prev) => prev && { ...prev, name: e.target.value })} maxLength={120} />
              </Field>
              <Field label="Parent category">
                <select className="input" value={categoryForm.parent_id} onChange={(e) => setCategoryForm((prev) => prev && { ...prev, parent_id: e.target.value })}>
                  <option value="">Top level</option>
                  {(categories || []).filter((category) => category.id !== categoryForm.id).map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="URL slug" hint="Leave empty to generate from the name.">
                <Input value={categoryForm.slug} onChange={(e) => setCategoryForm((prev) => prev && { ...prev, slug: e.target.value })} maxLength={140} />
              </Field>
              <Field label="Icon" hint="Optional emoji or short code.">
                <Input value={categoryForm.icon} onChange={(e) => setCategoryForm((prev) => prev && { ...prev, icon: e.target.value })} maxLength={50} />
              </Field>
              <Field label="Sort order" hint="Lower numbers appear first.">
                <Input inputMode="numeric" value={categoryForm.sort_order} onChange={(e) => setCategoryForm((prev) => prev && { ...prev, sort_order: e.target.value.replace(/[^\d]/g, '') })} />
              </Field>
              <label className="mt-6 flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={categoryForm.is_active} onChange={(e) => setCategoryForm((prev) => prev && { ...prev, is_active: e.target.checked })} />
                Visible and selectable
              </label>
            </div>
            <Field label="Description">
              <Textarea value={categoryForm.description} onChange={(e) => setCategoryForm((prev) => prev && { ...prev, description: e.target.value })} maxLength={2000} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={!!brandForm} onClose={() => setBrandForm(null)} title={brandForm?.id ? 'Edit brand' : 'New brand'} footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setBrandForm(null)}>Cancel</Button>
          <Button size="sm" loading={saveBrand.isPending} disabled={!brandForm?.name} onClick={() => saveBrand.mutate()}>Save brand</Button>
        </>
      }>
        {brandForm && (
          <div className="space-y-3">
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Brand name" required>
                <Input value={brandForm.name} onChange={(e) => setBrandForm((prev) => prev && { ...prev, name: e.target.value })} maxLength={120} />
              </Field>
              <Field label="URL slug" hint="Leave empty to generate from the name.">
                <Input value={brandForm.slug} onChange={(e) => setBrandForm((prev) => prev && { ...prev, slug: e.target.value })} maxLength={140} />
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={brandForm.description} onChange={(e) => setBrandForm((prev) => prev && { ...prev, description: e.target.value })} maxLength={2000} />
            </Field>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={brandForm.is_active} onChange={(e) => setBrandForm((prev) => prev && { ...prev, is_active: e.target.checked })} />
              Active in filters and listings
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}

