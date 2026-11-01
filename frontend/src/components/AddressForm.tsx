import { useState } from 'react'
import { apiError } from '../lib/api'
import { DISTRICTS, DIVISIONS } from '../lib/bd'
import type { Address } from '../lib/types'
import { Button, Field, Input, Select } from './ui'

export type AddressPayload = {
  label: string
  recipient_name: string
  phone: string
  division: string
  district: string
  upazila: string
  area: string
  street_address: string
  postal_code: string
  is_default: boolean
}

const empty: AddressPayload = {
  label: 'Home',
  recipient_name: '',
  phone: '',
  division: 'Dhaka',
  district: 'Dhaka',
  upazila: '',
  area: '',
  street_address: '',
  postal_code: '',
  is_default: false,
}

export function AddressForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Save address',
}: {
  initial?: Partial<Address>
  onSubmit: (payload: AddressPayload) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
}) {
  const [form, setForm] = useState<AddressPayload>({
    ...empty,
    ...(initial
      ? {
          label: initial.label || empty.label,
          recipient_name: initial.recipient_name || '',
          phone: initial.phone || '',
          division: initial.division || empty.division,
          district: initial.district || empty.district,
          upazila: initial.upazila || '',
          area: initial.area || '',
          street_address: initial.street_address || '',
          postal_code: initial.postal_code || '',
          is_default: !!initial.is_default,
        }
      : {}),
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key: keyof AddressPayload, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const districts = DISTRICTS[form.division] || []

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSubmit(form)
    } catch (err) {
      setError(apiError(err, 'Could not save this address.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Address label" required>
          <Input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="Home, Office…" maxLength={50} required />
        </Field>
        <Field label="Recipient name" required>
          <Input value={form.recipient_name} onChange={(e) => set('recipient_name', e.target.value)} maxLength={120} required />
        </Field>
        <Field label="Mobile number" required hint="Bangladeshi number, e.g. 01712345678">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="01XXXXXXXXX" maxLength={20} required />
        </Field>
        <Field label="Division" required>
          <Select
            value={form.division}
            onChange={(e) => {
              const division = e.target.value
              setForm((prev) => ({ ...prev, division, district: DISTRICTS[division]?.[0] || '' }))
            }}
          >
            {DIVISIONS.map((division) => <option key={division} value={division}>{division}</option>)}
          </Select>
        </Field>
        <Field label="District" required>
          <Select value={form.district} onChange={(e) => set('district', e.target.value)} required>
            {districts.map((district) => <option key={district} value={district}>{district}</option>)}
          </Select>
        </Field>
        <Field label="Upazila / Thana">
          <Input value={form.upazila} onChange={(e) => set('upazila', e.target.value)} maxLength={80} />
        </Field>
        <Field label="Area / Neighbourhood">
          <Input value={form.area} onChange={(e) => set('area', e.target.value)} maxLength={120} />
        </Field>
        <Field label="Postal code">
          <Input value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} maxLength={10} />
        </Field>
      </div>
      <Field label="Street address" required hint="House, road, block and any delivery instructions">
        <textarea
          className="input min-h-[80px]"
          value={form.street_address}
          onChange={(e) => set('street_address', e.target.value)}
          maxLength={500}
          required
        />
      </Field>
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400"
          checked={form.is_default}
          onChange={(e) => set('is_default', e.target.checked)}
        />
        Use this as my default delivery address
      </label>
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>}
        <Button type="submit" size="sm" loading={saving}>{submitLabel}</Button>
      </div>
    </form>
  )
}
