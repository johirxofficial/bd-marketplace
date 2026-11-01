import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { money } from '../../lib/format'
import { DIVISIONS } from '../../lib/bd'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, useToast } from '../../components/ui'

type Zone = {
  id: number
  name: string
  division: string
  district?: string | null
  inside_dhaka: boolean
  base_fee: string
  free_shipping_threshold?: string | null
  estimated_days_min: number
  estimated_days_max: number
  is_active: boolean
}

type ZoneForm = {
  id?: number
  name: string
  division: string
  district: string
  inside_dhaka: boolean
  base_fee: string
  free_shipping_threshold: string
  estimated_days_min: string
  estimated_days_max: string
  is_active: boolean
}

const emptyZone: ZoneForm = {
  name: '', division: 'Dhaka', district: '', inside_dhaka: false, base_fee: '60',
  free_shipping_threshold: '', estimated_days_min: '2', estimated_days_max: '4', is_active: true,
}

export default function AdminShippingPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [form, setForm] = useState<ZoneForm | null>(null)
  const [error, setError] = useState('')

  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['admin-shipping-zones'],
    queryFn: async () => (await api.get('/admin/shipping-zones')).data.zones as Zone[],
  })

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form?.name,
        division: form?.division,
        district: form?.district || null,
        inside_dhaka: form?.inside_dhaka,
        base_fee: Number(form?.base_fee),
        free_shipping_threshold: form?.free_shipping_threshold ? Number(form.free_shipping_threshold) : null,
        estimated_days_min: Number(form?.estimated_days_min),
        estimated_days_max: Number(form?.estimated_days_max),
        is_active: form?.is_active,
      }
      return form?.id
        ? (await api.patch(`/admin/shipping-zones/${form.id}`, payload)).data
        : (await api.post('/admin/shipping-zones', payload)).data
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-shipping-zones'] })
      setForm(null)
      setError('')
      push(result.message || 'Shipping zone saved.')
    },
    onError: (err) => setError(apiError(err, 'The shipping zone could not be saved.')),
  })

  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/shipping-zones/${id}`)).data,
    onSuccess: (result) => { queryClient.invalidateQueries({ queryKey: ['admin-shipping-zones'] }); push(result.message || 'Zone deleted.') },
    onError: (err) => push(apiError(err, 'The zone could not be deleted.'), 'error'),
  })

  const zones: Zone[] = data || []

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Shipping zones"
        subtitle="District-level delivery fees and estimates used at checkout. The most specific active match wins."
        actions={<Button size="sm" onClick={() => { setError(''); setForm({ ...emptyZone }) }}>+ New zone</Button>}
      />

      {isLoading ? <Loading label="Loading shipping zones…" /> : loadError ? (
        <ErrorState message="Shipping zones could not be loaded." onRetry={() => refetch()} />
      ) : !zones.length ? (
        <EmptyState title="No shipping zones" description="Create at least one zone so checkout can calculate delivery fees." />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Zone</th><th>Division / district</th><th>Base fee</th><th>Free over</th><th>Estimate</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td>
                      <p className="text-xs font-semibold text-slate-800">{zone.name}</p>
                      {zone.inside_dhaka && <span className="text-[9px] font-bold uppercase tracking-wide text-brand-600">Inside Dhaka</span>}
                    </td>
                    <td className="text-xs text-slate-600">{zone.division}{zone.district ? ` · ${zone.district}` : ' · all districts'}</td>
                    <td className="text-xs font-semibold">{money(zone.base_fee)}</td>
                    <td className="text-xs">{zone.free_shipping_threshold ? money(zone.free_shipping_threshold) : '—'}</td>
                    <td className="text-xs">{zone.estimated_days_min}–{zone.estimated_days_max} days</td>
                    <td><Badge tone={zone.is_active ? 'green' : 'slate'}>{zone.is_active ? 'Active' : 'Inactive'}</Badge></td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50"
                          onClick={() => {
                            setError('')
                            setForm({
                              id: zone.id, name: zone.name, division: zone.division, district: zone.district || '',
                              inside_dhaka: zone.inside_dhaka, base_fee: String(Number(zone.base_fee)),
                              free_shipping_threshold: zone.free_shipping_threshold ? String(Number(zone.free_shipping_threshold)) : '',
                              estimated_days_min: String(zone.estimated_days_min), estimated_days_max: String(zone.estimated_days_max),
                              is_active: zone.is_active,
                            })
                          }}
                        >Edit</button>
                        <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50" onClick={() => { if (window.confirm(`Delete zone “${zone.name}”? Checkout may then fall back to another zone.`)) remove.mutate(zone.id) }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit shipping zone' : 'New shipping zone'} footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
          <Button size="sm" loading={save.isPending} disabled={!form?.name || Number(form?.estimated_days_max) < Number(form?.estimated_days_min)} onClick={() => save.mutate()}>Save zone</Button>
        </>
      }>
        {form && (
          <div className="space-y-3">
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Zone name" required hint="Internal label shown at checkout.">
                <Input value={form.name} onChange={(e) => setForm((prev) => prev && { ...prev, name: e.target.value })} maxLength={100} />
              </Field>
              <Field label="Division" required>
                <select className="input" value={form.division} onChange={(e) => setForm((prev) => prev && { ...prev, division: e.target.value })}>
                  {DIVISIONS.map((division) => <option key={division} value={division}>{division}</option>)}
                </select>
              </Field>
              <Field label="District" hint="Leave empty to cover every district in the division.">
                <Input value={form.district} onChange={(e) => setForm((prev) => prev && { ...prev, district: e.target.value })} maxLength={60} />
              </Field>
              <Field label="Base delivery fee (৳)" required>
                <Input inputMode="decimal" value={form.base_fee} onChange={(e) => setForm((prev) => prev && { ...prev, base_fee: e.target.value })} />
              </Field>
              <Field label="Free shipping threshold (৳)" hint="Optional. Subtotal above this ships free.">
                <Input inputMode="decimal" value={form.free_shipping_threshold} onChange={(e) => setForm((prev) => prev && { ...prev, free_shipping_threshold: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Min days" required>
                  <Input inputMode="numeric" value={form.estimated_days_min} onChange={(e) => setForm((prev) => prev && { ...prev, estimated_days_min: e.target.value.replace(/[^\d]/g, '') })} />
                </Field>
                <Field label="Max days" required>
                  <Input inputMode="numeric" value={form.estimated_days_max} onChange={(e) => setForm((prev) => prev && { ...prev, estimated_days_max: e.target.value.replace(/[^\d]/g, '') })} />
                </Field>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={form.inside_dhaka} onChange={(e) => setForm((prev) => prev && { ...prev, inside_dhaka: e.target.checked })} />
                Inside Dhaka zone
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={form.is_active} onChange={(e) => setForm((prev) => prev && { ...prev, is_active: e.target.checked })} />
                Active at checkout
              </label>
            </div>
            <p className="rounded bg-slate-50 px-2.5 py-2 text-[10px] leading-relaxed text-slate-500">
              A district-specific active zone takes priority over a division-wide zone. A free-shipping threshold of 0 means free delivery at any value.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
