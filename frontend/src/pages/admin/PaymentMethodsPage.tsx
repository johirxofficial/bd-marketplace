import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { money } from '../../lib/format'
import { Badge, Button, EmptyState, Field, Input, Loading, PageHeader, Select, Textarea, useToast } from '../../components/ui'

type AdminPaymentMethod = {
  id: number
  code: string
  name: string
  provider: string
  type: string
  mode: string
  description?: string | null
  instructions?: string | null
  logo_path?: string | null
  enabled: boolean
  sort_order: number
  fee_amount: string
  fee_percent: string
  min_amount?: string | null
  max_amount?: string | null
  config: Record<string, any>
  public_config: Record<string, any>
}

type MethodForm = {
  name: string
  description: string
  instructions: string
  enabled: boolean
  mode: string
  sort_order: string
  fee_amount: string
  fee_percent: string
  min_amount: string
  max_amount: string
  logo_path: string
  config: Record<string, any>
}

const typeLabels: Record<string, string> = { cod: 'Cash on delivery', mfs: 'Mobile wallet', qr: 'Bangla QR', hosted: 'Hosted gateway' }
const typeTone: Record<string, string> = { cod: 'amber', mfs: 'blue', qr: 'green', hosted: 'indigo' }

function toForm(method: AdminPaymentMethod): MethodForm {
  return {
    name: method.name,
    description: method.description || '',
    instructions: method.instructions || '',
    enabled: method.enabled,
    mode: method.mode,
    sort_order: String(method.sort_order),
    fee_amount: String(method.fee_amount ?? '0'),
    fee_percent: String(method.fee_percent ?? '0'),
    min_amount: method.min_amount ? String(method.min_amount) : '',
    max_amount: method.max_amount ? String(method.max_amount) : '',
    logo_path: method.logo_path || '',
    config: { ...method.config },
  }
}

export default function AdminPaymentMethodsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [form, setForm] = useState<MethodForm | null>(null)

  const { data: methods = [], isLoading, error } = useQuery({
    queryKey: ['admin-payment-methods'],
    queryFn: async () => (await api.get('/admin/payment-methods')).data.payment_methods as AdminPaymentMethod[],
  })

  useEffect(() => {
    if (!methods.length) return
    const current = methods.find((method) => method.code === selectedCode) || methods[0]
    if (current.code !== selectedCode) setSelectedCode(current.code)
    setForm(toForm(current))
  }, [methods, selectedCode])

  const selected = useMemo(() => methods.find((method) => method.code === selectedCode) || null, [methods, selectedCode])

  const hostedConfigured = selected?.provider === 'bkash'
    ? Boolean(form?.config.app_key && form?.config.username
        && (form?.config.app_secret || form?.config.has_app_secret)
        && (form?.config.password || form?.config.has_password))
    : Boolean(form?.config.store_id)

  const save = useMutation({
    mutationFn: async () => {
      if (!selected || !form) throw new Error('Select a payment method first.')
      // Drop the server-side "has_*" mask flags; they are display hints, not config.
      const config = Object.fromEntries(Object.entries(form.config || {}).filter(([key]) => !key.startsWith('has_')))
      return (await api.patch(`/admin/payment-methods/${selected.id}`, {
        name: form.name,
        description: form.description || null,
        instructions: form.instructions || null,
        enabled: form.enabled,
        mode: form.mode,
        sort_order: Number(form.sort_order) || 0,
        fee_amount: Number(form.fee_amount) || 0,
        fee_percent: Number(form.fee_percent) || 0,
        min_amount: form.min_amount === '' ? null : Number(form.min_amount),
        max_amount: form.max_amount === '' ? null : Number(form.max_amount),
        logo_path: form.logo_path || null,
        config,
      })).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payment-methods'] })
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] })
      queryClient.invalidateQueries({ queryKey: ['public-settings'] })
      push('Payment method saved.')
    },
    onError: (err) => push(apiError(err, 'The payment method could not be saved.'), 'error'),
  })

  function setConfig(key: string, value: any) {
    setForm((prev) => prev ? { ...prev, config: { ...prev.config, [key]: value } } : prev)
  }

  if (isLoading) return <Loading label="Loading payment methods…" />
  if (error) return <EmptyState title="Payment methods could not be loaded" description={apiError(error)} />

  return (
    <div>
      <PageHeader
        eyebrow="Payments"
        title="Payment methods"
        subtitle="Enable the methods customers can use, set fees and limits, and configure merchant/wallet details. Secrets are encrypted at rest and never returned in plain text."
        actions={<Button size="sm" loading={save.isPending} disabled={!form} onClick={() => save.mutate()}>Save method</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {methods.map((method) => (
            <button
              key={method.code}
              type="button"
              onClick={() => setSelectedCode(method.code)}
              className={`w-full rounded-xl border p-3 text-left transition ${selectedCode === method.code ? 'border-brand-400 bg-brand-50/40 ring-1 ring-brand-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-800">{method.name}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{method.provider} · {method.mode}</p>
                </div>
                <Badge tone={method.enabled ? 'green' : 'red'}>{method.enabled ? 'Enabled' : 'Disabled'}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                <Badge tone={typeTone[method.type] || 'slate'}>{typeLabels[method.type] || method.type}</Badge>
                {Number(method.fee_amount) > 0 || Number(method.fee_percent) > 0 ? (
                  <span className="text-slate-500">Fee {Number(method.fee_amount) > 0 ? money(method.fee_amount) : ''}{Number(method.fee_amount) > 0 && Number(method.fee_percent) > 0 ? ' + ' : ''}{Number(method.fee_percent) > 0 ? `${method.fee_percent}%` : ''}</span>
                ) : <span className="text-slate-400">No fee</span>}
              </div>
            </button>
          ))}
        </div>

        {form && selected && (
          <div className="space-y-4">
            {selected.type === 'hosted' && form.enabled && !hostedConfigured && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">
                {selected.provider === 'bkash'
                  ? <>This bKash checkout is enabled but merchant credentials are incomplete. Checkout will reject it until the <strong>App Key</strong>, <strong>App Secret</strong>, <strong>Username</strong> and <strong>Password</strong> are saved. Keep it disabled until bKash sandbox/live access is verified.</>
                  : <>This hosted gateway is enabled but has no <strong>Store ID</strong>. Checkout will reject it until credentials are saved. Keep it disabled until SSLCommerz credentials are verified.</>}
              </div>
            )}
            {(selected.type === 'mfs' || selected.type === 'qr') && String(form.config.merchant_number || '').startsWith('0170000000') && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                The merchant number looks like a demo placeholder. Replace it with the real merchant wallet number before accepting live payments.
              </div>
            )}

            <div className="card space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">{selected.name}</h2>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">{selected.code} · {selected.provider}</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
                  Enabled at checkout
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Display name" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={100} /></Field>
                <Field label="Mode" hint="Manual methods use staff verification. Hosted gateways support sandbox/live.">
                  <Select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}>
                    <option value="manual">Manual</option>
                    <option value="sandbox">Sandbox</option>
                    <option value="live">Live</option>
                  </Select>
                </Field>
              </div>

              <Field label="Customer description" hint="Short line shown in the checkout payment selector.">
                <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-[70px]" maxLength={1000} />
              </Field>

              <Field label="Payment instructions" hint="Placeholders: {amount}, {order_number}, {merchant_number}, {merchant_name}, {account_type}, {biller_id}, {biller_name}.">
                <Textarea value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} maxLength={2000} />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Fixed fee (৳)" hint="Added once per order."><Input type="number" min={0} step="0.01" value={form.fee_amount} onChange={(event) => setForm({ ...form, fee_amount: event.target.value })} /></Field>
                <Field label="Fee (%)" hint="Percentage of the order subtotal."><Input type="number" min={0} max={100} step="0.01" value={form.fee_percent} onChange={(event) => setForm({ ...form, fee_percent: event.target.value })} /></Field>
                <Field label="Minimum order (৳)" hint="Blank means no minimum."><Input type="number" min={0} step="0.01" value={form.min_amount} onChange={(event) => setForm({ ...form, min_amount: event.target.value })} /></Field>
                <Field label="Maximum order (৳)" hint="Blank means no maximum."><Input type="number" min={0} step="0.01" value={form.max_amount} onChange={(event) => setForm({ ...form, max_amount: event.target.value })} /></Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Sort order" hint="Lower numbers appear first at checkout."><Input type="number" min={0} max={999} value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} /></Field>
                <Field label="Logo path" hint="Optional internal media path, for example branding/bkash.png."><Input value={form.logo_path} onChange={(event) => setForm({ ...form, logo_path: event.target.value })} maxLength={255} /></Field>
              </div>

              {selected.type !== 'cod' && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <h3 className="text-xs font-bold text-slate-800">Merchant configuration</h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {(selected.type === 'mfs' || selected.type === 'qr') && (
                      <>
                        <Field label="Merchant number" required><Input value={form.config.merchant_number || ''} onChange={(event) => setConfig('merchant_number', event.target.value)} placeholder="01XXXXXXXXX" maxLength={30} /></Field>
                        <Field label="Merchant name"><Input value={form.config.merchant_name || ''} onChange={(event) => setConfig('merchant_name', event.target.value)} maxLength={100} /></Field>
                        <Field label="Account type"><Input value={form.config.account_type || ''} onChange={(event) => setConfig('account_type', event.target.value)} placeholder="Merchant / Personal" maxLength={40} /></Field>
                        {selected.provider === 'bkash_paybill' && (
                          <>
                            <Field label="bKash biller ID" required hint="Biller ID issued during bKash merchant/Pay Bill onboarding.">
                              <Input value={form.config.biller_id || ''} onChange={(event) => setConfig('biller_id', event.target.value)} placeholder="BILLER-XXXX" maxLength={60} />
                            </Field>
                            <Field label="Biller display name" hint="Shown in the customer instructions.">
                              <Input value={form.config.biller_name || ''} onChange={(event) => setConfig('biller_name', event.target.value)} maxLength={100} />
                            </Field>
                          </>
                        )}
                        {selected.type === 'qr' && (
                          <>
                            <Field label="QR merchant name"><Input value={form.config.qr_merchant_name || ''} onChange={(event) => setConfig('qr_merchant_name', event.target.value)} maxLength={25} /></Field>
                            <Field label="QR merchant city"><Input value={form.config.qr_merchant_city || ''} onChange={(event) => setConfig('qr_merchant_city', event.target.value)} maxLength={15} /></Field>
                          </>
                        )}
                      </>
                    )}
                    {selected.type === 'hosted' && selected.provider !== 'bkash' && (
                      <>
                        <Field label="Store ID" required hint="Provided by SSLCommerz."><Input value={form.config.store_id || ''} onChange={(event) => setConfig('store_id', event.target.value)} maxLength={100} /></Field>
                        <Field label="Store password" hint={form.config.has_store_password ? 'A password is already stored. Leave blank to keep it.' : 'Provided by SSLCommerz.'}>
                          <Input type="password" value={form.config.store_password || ''} onChange={(event) => setConfig('store_password', event.target.value)} maxLength={200} autoComplete="new-password" />
                        </Field>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={form.config.sandbox !== false} onChange={(event) => setConfig('sandbox', event.target.checked)} />
                          Use sandbox endpoint
                        </label>
                      </>
                    )}
                    {selected.type === 'hosted' && selected.provider === 'bkash' && (
                      <>
                        <Field label="App Key" required hint="From your bKash merchant dashboard."><Input value={form.config.app_key || ''} onChange={(event) => setConfig('app_key', event.target.value)} maxLength={200} autoComplete="off" /></Field>
                        <Field label="App Secret" hint={form.config.has_app_secret ? 'A secret is already stored. Leave blank to keep it.' : 'From your bKash merchant dashboard.'}>
                          <Input type="password" value={form.config.app_secret || ''} onChange={(event) => setConfig('app_secret', event.target.value)} maxLength={200} autoComplete="new-password" />
                        </Field>
                        <Field label="API username" required hint="bKash tokenized checkout username."><Input value={form.config.username || ''} onChange={(event) => setConfig('username', event.target.value)} maxLength={120} autoComplete="off" /></Field>
                        <Field label="API password" hint={form.config.has_password ? 'A password is already stored. Leave blank to keep it.' : 'bKash tokenized checkout password.'}>
                          <Input type="password" value={form.config.password || ''} onChange={(event) => setConfig('password', event.target.value)} maxLength={200} autoComplete="new-password" />
                        </Field>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={form.config.sandbox !== false} onChange={(event) => setConfig('sandbox', event.target.checked)} />
                          Use bKash sandbox endpoint
                        </label>
                      </>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                    {selected.type === 'hosted'
                      ? 'Online payments are only live after credentials are entered and a real sandbox/live transaction is verified. bKash checkout and SSLCommerz both require HTTPS and gateway confirmation before enabling on a public deployment.'
                      : selected.provider === 'bkash_paybill'
                        ? 'Customers pay the bill in the bKash app using your biller ID, then submit the Pay Bill transaction ID. Staff verify each reference under Payments before the order is marked paid. Automatic biller reconciliation requires bKash onboarding and API approval.'
                        : 'Customers send money to this account and submit the transaction reference. Staff must verify each payment under Payments before the order is marked paid.'}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <p className="text-[10px] text-slate-400">Changes affect new checkouts only. Existing orders keep their original payment method.</p>
                <Button type="button" loading={save.isPending} onClick={() => save.mutate()}>Save this method</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
