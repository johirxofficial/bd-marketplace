import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import type { Category } from '../../lib/types'
import { Button, Card, ErrorState, Field, Input, Loading, PageHeader, useToast } from '../../components/ui'

type VariantRow = {
  id?: number
  name: string
  sku: string
  price: string
  compare_at_price: string
  stock: string
  weight_grams: string
  is_active: boolean
}

type SpecRow = { name: string; value: string }
type ImageRow = { path: string; url: string }

const blankVariant = (): VariantRow => ({ name: 'Default', sku: '', price: '', compare_at_price: '', stock: '0', weight_grams: '0', is_active: true })

function flattenCategories(categories: Category[], depth = 0): { id: number; name: string; depth: number }[] {
  return categories.flatMap((category) => [
    { id: category.id, name: category.name, depth },
    ...flattenCategories(category.children || [], depth + 1),
  ])
}

export default function SellerProductFormPage() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const { push } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')
  const [basePrice, setBasePrice] = useState('')
  const [compareAtPrice, setCompareAtPrice] = useState('')
  const [specs, setSpecs] = useState<SpecRow[]>([{ name: '', value: '' }])
  const [variants, setVariants] = useState<VariantRow[]>([blankVariant()])
  const [images, setImages] = useState<ImageRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(!editing)

  const { data: filterData } = useQuery({
    queryKey: ['product-filters'],
    queryFn: async () => (await api.get('/products/filters')).data,
    staleTime: 10 * 60 * 1000,
  })

  const { data: productData, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['seller-product', id],
    queryFn: async () => (await api.get(`/seller/products/${id}`)).data.product,
    enabled: editing,
  })

  const categories = useMemo(() => flattenCategories(filterData?.categories || []), [filterData])

  useEffect(() => {
    if (!editing || !productData || loaded) return
    setName(productData.name || '')
    setCategoryId(String(productData.category?.id || ''))
    setBrandId(productData.brand?.id ? String(productData.brand.id) : '')
    setShortDescription(productData.short_description || '')
    setDescription(productData.description || '')
    setBasePrice(productData.price ? String(Number(productData.price)) : '')
    setCompareAtPrice(productData.compare_at_price ? String(Number(productData.compare_at_price)) : '')
    setSpecs(
      Array.isArray(productData.specifications)
        ? productData.specifications.map((row: any) => ({ name: row.name || '', value: row.value || '' }))
        : Object.entries(productData.specifications || {}).map(([specName, value]) => ({ name: specName, value: String(value) })),
    )
    setVariants(
      (productData.variants || []).map((variant: any) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        price: String(Number(variant.price)),
        compare_at_price: variant.compare_at_price ? String(Number(variant.compare_at_price)) : '',
        stock: String(variant.stock ?? 0),
        weight_grams: String(variant.weight_grams ?? 0),
        is_active: variant.is_active !== false,
      })),
    )
    setImages((productData.images || []).map((image: any) => ({ path: image.path, url: image.url })))
    setLoaded(true)
  }, [editing, productData, loaded])

  const save = useMutation({
    mutationFn: async (status: 'draft' | 'pending') => {
      const payload = {
        name,
        category_id: Number(categoryId),
        brand_id: brandId ? Number(brandId) : null,
        short_description: shortDescription || null,
        description,
        base_price: Number(basePrice),
        compare_at_price: compareAtPrice ? Number(compareAtPrice) : null,
        specifications: specs.filter((row) => row.name.trim() && row.value.trim()).map((row) => ({ name: row.name, value: row.value })),
        images: images.map((image) => image.path),
        variants: variants.map((variant) => ({
          ...(variant.id ? { id: variant.id } : {}),
          name: variant.name,
          sku: variant.sku,
          price: Number(variant.price),
          compare_at_price: variant.compare_at_price ? Number(variant.compare_at_price) : null,
          stock: Number(variant.stock) || 0,
          weight_grams: Number(variant.weight_grams) || 0,
          is_active: variant.is_active,
        })),
        status,
      }
      return editing
        ? (await api.patch(`/seller/products/${id}`, payload)).data
        : (await api.post('/seller/products', payload)).data
    },
    onSuccess: (data) => {
      push(data.message || 'Product saved.')
      navigate('/seller/products')
    },
    onError: (err) => setError(apiError(err, 'The product could not be saved.')),
  })

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return
    if (images.length + files.length > 6) {
      push('You can upload at most 6 images per product.', 'error')
      return
    }
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          push(`${file.name} is larger than 5 MB and was skipped.`, 'error')
          continue
        }
        const body = new FormData()
        body.append('image', file)
        body.append('folder', 'products')
        const { data } = await api.post('/uploads', body)
        setImages((prev) => [...prev, { path: data.path, url: data.url }])
      }
    } catch (err) {
      push(apiError(err, 'The image could not be uploaded.'), 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function updateVariant(index: number, key: keyof VariantRow, value: string | boolean) {
    setVariants((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  function updateSpec(index: number, key: keyof SpecRow, value: string) {
    setSpecs((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  function submit(status: 'draft' | 'pending') {
    setError('')
    if (!categoryId) { setError('Choose a category.'); return }
    if (!variants.length || variants.some((v) => !v.name || !v.sku || !v.price)) {
      setError('Every variant needs a name, SKU, and price.')
      return
    }
    save.mutate(status)
  }

  if (editing && isLoading) return <Loading label="Loading product…" />
  if (editing && (loadError || !productData)) return <ErrorState message="This product could not be loaded." onRetry={() => refetch()} />

  return (
    <div>
      <PageHeader
        eyebrow="Seller center"
        title={editing ? 'Edit product' : 'Add a product'}
        subtitle={editing ? 'Saving changes resubmits the listing for moderation.' : 'Provide accurate details and stock. Products are reviewed before they go live.'}
        actions={<Link to="/seller/products" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">← Back to products</Link>}
      />

      {error && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      <form onSubmit={(e) => { e.preventDefault(); submit('pending') }} className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-bold text-slate-900">Product details</h2>
            <Field label="Product name" required hint="Customers see this first. Be specific.">
              <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={200} placeholder="e.g. Samsung Galaxy A55 5G 8GB/128GB" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" required>
                <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{'— '.repeat(category.depth)}{category.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Brand">
                <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                  <option value="">No brand / generic</option>
                  {(filterData?.brands || []).map((brand: any) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Short description" hint="Optional. One line shown in listings.">
              <Input value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} maxLength={500} />
            </Field>
            <Field label="Full description" required hint="At least 20 characters. Describe condition, contents, and warranty.">
              <textarea className="input min-h-[150px]" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={20} maxLength={20000} />
            </Field>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Images <span className="font-normal text-slate-400">(up to 6)</span></h2>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
              <Button size="sm" variant="secondary" type="button" loading={uploading} onClick={() => fileRef.current?.click()}>Upload image</Button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">JPG, PNG, or WebP up to 5 MB each. The first image is used as the listing thumbnail. Images are stored outside the public web root and served through a controlled endpoint.</p>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((image, index) => (
                <div key={`${image.path}-${index}`} className="group relative overflow-hidden rounded-lg border border-slate-200">
                  <img src={image.url} alt={`Product image ${index + 1}`} className="aspect-square w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-slate-900/70 px-1.5 py-1 text-[9px] text-white">
                    <span>{index === 0 ? 'Primary' : `#${index + 1}`}</span>
                    <button type="button" onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))} className="font-bold hover:text-rose-300">Remove</button>
                  </div>
                </div>
              ))}
              {images.length === 0 && (
                <button type="button" onClick={() => fileRef.current?.click()} className="col-span-3 flex aspect-[3/1] items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-400 hover:text-brand-600 sm:col-span-4">
                  + No images yet — upload at least one
                </button>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Variants & stock</h2>
              <Button size="sm" variant="secondary" type="button" onClick={() => setVariants((prev) => [...prev, { ...blankVariant(), name: '', sku: '' }])}>+ Add variant</Button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Each variant has its own SKU, price, and stock. Stock updates are applied as an absolute count.</p>
            <div className="mt-3 space-y-3">
              {variants.map((variant, index) => (
                <div key={index} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Variant {index + 1}</p>
                    {variants.length > 1 && <button type="button" className="text-[10px] font-semibold text-rose-600 hover:underline" onClick={() => setVariants((prev) => prev.filter((_, i) => i !== index))}>Remove</button>}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Field label="Variant name" required><Input value={variant.name} onChange={(e) => updateVariant(index, 'name', e.target.value)} maxLength={100} placeholder="e.g. 8GB / 128GB Navy" /></Field>
                    <Field label="SKU" required hint="Unique across the marketplace."><Input value={variant.sku} onChange={(e) => updateVariant(index, 'sku', e.target.value.toUpperCase())} maxLength={80} /></Field>
                    <Field label="Price (৳)" required><Input inputMode="decimal" value={variant.price} onChange={(e) => updateVariant(index, 'price', e.target.value)} placeholder="0.00" /></Field>
                    <Field label="Compare-at price (৳)" hint="Optional. Must be above the selling price."><Input inputMode="decimal" value={variant.compare_at_price} onChange={(e) => updateVariant(index, 'compare_at_price', e.target.value)} placeholder="0.00" /></Field>
                    <Field label="Stock quantity" required><Input inputMode="numeric" value={variant.stock} onChange={(e) => updateVariant(index, 'stock', e.target.value.replace(/[^\d]/g, ''))} /></Field>
                    <Field label="Weight (grams)"><Input inputMode="numeric" value={variant.weight_grams} onChange={(e) => updateVariant(index, 'weight_grams', e.target.value.replace(/[^\d]/g, ''))} /></Field>
                  </div>
                  <label className="mt-1 flex items-center gap-2 text-[11px] font-medium text-slate-600">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 text-brand-500" checked={variant.is_active} onChange={(e) => updateVariant(index, 'is_active', e.target.checked)} />
                    Active and purchasable
                  </label>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Specifications</h2>
              <Button size="sm" variant="secondary" type="button" onClick={() => setSpecs((prev) => [...prev, { name: '', value: '' }])}>+ Add row</Button>
            </div>
            <div className="mt-2 space-y-2">
              {specs.map((spec, index) => (
                <div key={index} className="flex gap-2">
                  <Input value={spec.name} onChange={(e) => updateSpec(index, 'name', e.target.value)} placeholder="Attribute (e.g. Warranty)" maxLength={80} />
                  <Input value={spec.value} onChange={(e) => updateSpec(index, 'value', e.target.value)} placeholder="Value (e.g. 12 months)" maxLength={300} />
                  {specs.length > 1 && <button type="button" onClick={() => setSpecs((prev) => prev.filter((_, i) => i !== index))} className="shrink-0 rounded-lg px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">×</button>}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-bold text-slate-900">Pricing</h2>
            <Field label="Base price (৳)" required hint="The lowest variant price is shown in listings.">
              <Input inputMode="decimal" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} required placeholder="0.00" />
            </Field>
            <Field label="Compare-at price (৳)" hint="Optional. Shows a strike-through original price.">
              <Input inputMode="decimal" value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} placeholder="0.00" />
            </Field>
            <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] leading-relaxed text-slate-500">Base price should match the lowest variant price. The marketplace commission is deducted from the item subtotal after discounts.</p>
          </Card>

          <Card className="space-y-2 p-4">
            <h2 className="text-sm font-bold text-slate-900">Publish</h2>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {editing ? 'Edits to an approved product return it to moderation. Orders already placed keep their original snapshot.' : 'Submitting sends the listing to moderators. You can save a draft first and submit later.'}
            </p>
            <Button type="submit" className="w-full" loading={save.isPending} disabled={!loaded}>Submit for review</Button>
            <Button type="button" variant="secondary" className="w-full" loading={save.isPending} disabled={!loaded} onClick={() => submit('draft')}>Save as draft</Button>
            <p className="text-center text-[10px] text-slate-400">All fields are validated again on the server.</p>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-bold text-slate-900">Checklist</h2>
            <ul className="mt-1.5 space-y-1 text-[11px] text-slate-500">
              <li>{name.length >= 3 ? '✓' : '○'} Descriptive product name</li>
              <li>{categoryId ? '✓' : '○'} Category selected</li>
              <li>{description.length >= 20 ? '✓' : '○'} Full description</li>
              <li>{variants.every((v) => v.sku && v.price) ? '✓' : '○'} Complete variants</li>
              <li>{images.length > 0 ? '✓' : '○'} At least one image</li>
              <li>{variants.some((v) => Number(v.stock) > 0) ? '✓' : '○'} Stock available</li>
            </ul>
          </Card>
        </aside>
      </form>
    </div>
  )
}
