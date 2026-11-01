import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { dateTime } from '../../lib/format'
import { Badge, Button, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, useToast } from '../../components/ui'

type ApiToken = {
  id: number
  name: string
  abilities: string[]
  last_used_at?: string | null
  expires_at?: string | null
  created_at?: string | null
}

type Webhook = {
  id: number
  name: string
  url: string
  events: string[]
  active: boolean
  deliveries_count?: number
  last_triggered_at?: string | null
  created_at?: string | null
}

type Delivery = {
  id: number
  event: string
  response_status?: number | null
  attempts: number
  delivered_at?: string | null
  failed_at?: string | null
  response_body?: string | null
  created_at?: string | null
}

const emptyForm = { name: '', url: '', events: [] as string[], secret: '', active: true }

function CopyField({ value }: { value: string }) {
  const { push } = useToast()
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2">
      <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-slate-800">{value}</code>
      <button
        type="button"
        className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            push('Copied to clipboard.')
          } catch {
            push('Copy failed — select the value manually.', 'error')
          }
        }}
      >
        Copy
      </button>
    </div>
  )
}

export default function AdminDeveloperPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [tab, setTab] = useState<'tokens' | 'webhooks'>('tokens')

  const [tokenOpen, setTokenOpen] = useState(false)
  const [tokenForm, setTokenForm] = useState({ name: '', ability: '*', expires_in_days: '90' })
  const [plainToken, setPlainToken] = useState('')

  const [webhookOpen, setWebhookOpen] = useState(false)
  const [editing, setEditing] = useState<Webhook | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [createdSecret, setCreatedSecret] = useState('')
  const [deliveryTarget, setDeliveryTarget] = useState<Webhook | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null)

  const tokensQuery = useQuery({
    queryKey: ['admin-api-tokens'],
    queryFn: async () => (await api.get('/admin/developer/tokens')).data as { tokens: ApiToken[]; abilities: Record<string, string> },
  })

  const webhooksQuery = useQuery({
    queryKey: ['admin-webhooks'],
    queryFn: async () => (await api.get('/admin/developer/webhooks')).data as { webhooks: Webhook[]; events: string[] },
  })

  const deliveriesQuery = useQuery({
    queryKey: ['admin-webhook-deliveries', deliveryTarget?.id],
    queryFn: async () => (await api.get(`/admin/developer/webhooks/${deliveryTarget?.id}/deliveries`)).data as { deliveries: Delivery[] },
    enabled: !!deliveryTarget,
  })

  const createToken = useMutation({
    mutationFn: async () => (await api.post('/admin/developer/tokens', {
      name: tokenForm.name,
      abilities: [tokenForm.ability],
      expires_in_days: tokenForm.expires_in_days ? Number(tokenForm.expires_in_days) : undefined,
    })).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-api-tokens'] })
      setPlainToken(data.plain_text_token)
      setTokenForm({ name: '', ability: '*', expires_in_days: '90' })
      push('API token created. Copy it now.')
    },
    onError: (err) => push(apiError(err, 'The API token could not be created.'), 'error'),
  })

  const revokeToken = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/developer/tokens/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-api-tokens'] })
      push('API token revoked.')
    },
    onError: (err) => push(apiError(err, 'The API token could not be revoked.'), 'error'),
  })

  const saveWebhook = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        url: form.url,
        events: form.events,
        secret: form.secret || undefined,
        active: form.active,
      }
      return editing
        ? (await api.patch(`/admin/developer/webhooks/${editing.id}`, payload)).data
        : (await api.post('/admin/developer/webhooks', payload)).data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] })
      setFormError('')
      if (!editing && data?.secret) {
        setCreatedSecret(data.secret)
      } else {
        setWebhookOpen(false)
        push('Webhook saved.')
      }
      setEditing(null)
    },
    onError: (err) => setFormError(apiError(err, 'The webhook could not be saved.')),
  })

  const toggleWebhook = useMutation({
    mutationFn: async (webhook: Webhook) => (await api.patch(`/admin/developer/webhooks/${webhook.id}`, {
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      active: !webhook.active,
    })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] })
      push('Webhook updated.')
    },
    onError: (err) => push(apiError(err, 'The webhook could not be updated.'), 'error'),
  })

  const testWebhook = useMutation({
    mutationFn: async (webhook: Webhook) => (await api.post(`/admin/developer/webhooks/${webhook.id}/test`)).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] })
      queryClient.invalidateQueries({ queryKey: ['admin-webhook-deliveries'] })
      push(data?.message || 'Test delivery queued.')
    },
    onError: (err) => push(apiError(err, 'The test delivery could not be queued.'), 'error'),
  })

  const deleteWebhook = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/developer/webhooks/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] })
      setDeleteTarget(null)
      push('Webhook deleted.')
    },
    onError: (err) => push(apiError(err, 'The webhook could not be deleted.'), 'error'),
  })

  const tokens = tokensQuery.data?.tokens || []
  const abilities = tokensQuery.data?.abilities || { '*': 'Full access' }
  const webhooks = webhooksQuery.data?.webhooks || []
  const events = webhooksQuery.data?.events || []

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setCreatedSecret('')
    setWebhookOpen(true)
  }

  function openEdit(webhook: Webhook) {
    setEditing(webhook)
    setForm({ name: webhook.name, url: webhook.url, events: [...webhook.events], secret: '', active: webhook.active })
    setFormError('')
    setCreatedSecret('')
    setWebhookOpen(true)
  }

  function toggleEvent(event: string) {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter((value) => value !== event) : [...prev.events, event],
    }))
  }

  return (
    <div>
      <PageHeader
        eyebrow="Developer"
        title="API & webhooks"
        subtitle="Issue Sanctum API tokens for integrations and register signed webhooks for order, payment, return, and settlement events. Secrets are shown once and stored encrypted."
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {([['tokens', `API tokens (${tokens.length})`], ['webhooks', `Webhooks (${webhooks.length})`]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'tokens' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {tokensQuery.isLoading ? <Loading label="Loading API tokens…" /> : tokensQuery.error ? (
              <EmptyState title="API tokens could not be loaded" description={apiError(tokensQuery.error)} />
            ) : tokens.length === 0 ? (
              <EmptyState
                title="No API tokens"
                description="Create a token to authenticate server-to-server API requests with the Authorization: Bearer header."
                action={<Button size="sm" onClick={() => { setPlainToken(''); setTokenOpen(true) }}>Create API token</Button>}
              />
            ) : (
              <div className="card overflow-hidden">
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Name</th><th>Abilities</th><th>Last used</th><th>Expires</th><th className="text-right">Actions</th></tr></thead>
                    <tbody>
                      {tokens.map((token) => (
                        <tr key={token.id}>
                          <td className="text-xs font-semibold text-slate-800">{token.name}</td>
                          <td className="text-[11px] text-slate-500">{token.abilities?.join(', ') || '—'}</td>
                          <td className="text-[11px] text-slate-500">{token.last_used_at ? dateTime(token.last_used_at) : 'Never'}</td>
                          <td className="text-[11px] text-slate-500">{token.expires_at ? dateTime(token.expires_at) : 'No expiry'}</td>
                          <td>
                            <div className="flex justify-end">
                              <Button
                                size="xs"
                                variant="secondary"
                                className="!text-rose-600"
                                loading={revokeToken.isPending}
                                onClick={() => {
                                  if (window.confirm(`Revoke “${token.name}”? Any integration using it will stop working.`)) {
                                    revokeToken.mutate(token.id)
                                  }
                                }}
                              >
                                Revoke
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-900">Using API tokens</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Send the token as <code className="rounded bg-slate-100 px-1 font-mono text-[10px]">Authorization: Bearer &lt;token&gt;</code> to the versioned API at <code className="rounded bg-slate-100 px-1 font-mono text-[10px]">/api/v1</code>.
                Tokens inherit the creating account's permissions, so issue them from a dedicated staff account with the narrowest role that works.
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                Treat tokens like passwords. Revoke immediately if a token is exposed or an integration is retired. Tokens are hashed at rest and only the plain value shown at creation can be used.
              </p>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-900">Create a token</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">The plain token is displayed once and never again.</p>
              <Field label="Token name" required className="mt-2"><Input value={tokenForm.name} onChange={(event) => setTokenForm({ ...tokenForm, name: event.target.value })} placeholder="Warehouse integration" maxLength={100} /></Field>
              <Field label="Ability" className="mt-2">
                <Select value={tokenForm.ability} onChange={(event) => setTokenForm({ ...tokenForm, ability: event.target.value })}>
                  {Object.entries(abilities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label="Expires in (days)" hint="1–365. Leave blank for no expiry." className="mt-2">
                <Input type="number" min={1} max={365} value={tokenForm.expires_in_days} onChange={(event) => setTokenForm({ ...tokenForm, expires_in_days: event.target.value })} />
              </Field>
              <Button className="mt-3 w-full" size="sm" loading={createToken.isPending} disabled={tokenForm.name.trim().length < 2} onClick={() => { setPlainToken(''); setTokenOpen(true) }}>Review and create</Button>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Creating a token is audited. Abilities are advisory unless your integration enforces them.</p>
            </div>

            <div className="card p-4 text-[11px] leading-relaxed text-slate-500">
              <h2 className="text-sm font-bold text-slate-900">Webhook security</h2>
              <p className="mt-1.5">Every delivery includes <code className="rounded bg-slate-100 px-1 font-mono text-[10px]">X-BD-Event</code> and <code className="rounded bg-slate-100 px-1 font-mono text-[10px]">X-BD-Signature</code>.</p>
              <p className="mt-1.5">The signature is <code className="rounded bg-slate-100 px-1 font-mono text-[10px]">sha256=HMAC_SHA256(raw_body, secret)</code>. Reject any request whose signature does not match, and treat deliveries as at-least-once.</p>
            </div>
          </aside>
        </div>
      )}

      {tab === 'webhooks' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">{webhooks.length} endpoint(s) · {webhooks.filter((webhook) => webhook.active).length} active</p>
            <Button size="sm" onClick={openCreate}>Add webhook</Button>
          </div>

          {webhooksQuery.isLoading ? <Loading label="Loading webhooks…" /> : webhooksQuery.error ? (
            <EmptyState title="Webhooks could not be loaded" description={apiError(webhooksQuery.error)} />
          ) : webhooks.length === 0 ? (
            <EmptyState
              title="No webhooks configured"
              description="Register an HTTPS endpoint to receive signed events such as order.placed and payment.collected."
              action={<Button size="sm" onClick={openCreate}>Add webhook</Button>}
            />
          ) : (
            <div className="space-y-2">
              {webhooks.map((webhook) => (
                <div key={webhook.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-bold text-slate-900">{webhook.name}</h2>
                        {webhook.active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Paused</Badge>}
                      </div>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{webhook.url}</p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-slate-700">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={webhook.active} disabled={toggleWebhook.isPending} onChange={() => toggleWebhook.mutate(webhook)} />
                      Active
                    </label>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {webhook.events.map((event) => (
                      <span key={event} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{event}</span>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[10px] text-slate-400">
                    <p>
                      {webhook.deliveries_count ?? 0} deliveries
                      {webhook.last_triggered_at ? ` · last triggered ${dateTime(webhook.last_triggered_at)}` : ' · never triggered'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="xs" variant="secondary" loading={testWebhook.isPending} onClick={() => testWebhook.mutate(webhook)}>Send test</Button>
                      <Button size="xs" variant="secondary" onClick={() => setDeliveryTarget(webhook)}>Deliveries</Button>
                      <Button size="xs" variant="secondary" onClick={() => openEdit(webhook)}>Edit</Button>
                      <Button size="xs" variant="secondary" className="!text-rose-600" onClick={() => setDeleteTarget(webhook)}>Delete</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-[11px] leading-relaxed text-slate-500">
            <h2 className="text-sm font-bold text-slate-900">Supported events</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {events.map((event) => <span key={event} className="rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">{event}</span>)}
            </div>
            <p className="mt-2">
              Deliveries retry up to three times with a 60-second backoff and every attempt is logged. Failed deliveries are not replayed automatically — inspect the response, fix the endpoint, and send a new test. Deliveries are at-least-once, so make your handler idempotent.
            </p>
          </div>
        </div>
      )}

      <Modal
        open={tokenOpen}
        onClose={() => { setTokenOpen(false); setPlainToken(''); }}
        title="Create API token"
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => { setTokenOpen(false); setPlainToken(''); }}>{plainToken ? 'Done' : 'Cancel'}</Button>
            {!plainToken && <Button size="sm" loading={createToken.isPending} disabled={tokenForm.name.trim().length < 2} onClick={() => createToken.mutate()}>Create token</Button>}
          </>
        }
      >
        {plainToken ? (
          <div>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
              <strong>Copy this token now.</strong> It will not be shown again. Store it in your integration's secret manager, never in client-side code or a public repository.
            </p>
            <Field label="Plain-text token" className="mt-3">
              <CopyField value={plainToken} />
            </Field>
          </div>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-slate-600">The token will be created for the current administrator account with the selected ability. You will only see the token value once.</p>
            <Field label="Token name" required className="mt-3">
              <Input value={tokenForm.name} onChange={(event) => setTokenForm({ ...tokenForm, name: event.target.value })} placeholder="Warehouse integration" maxLength={100} />
            </Field>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Ability">
                <Select value={tokenForm.ability} onChange={(event) => setTokenForm({ ...tokenForm, ability: event.target.value })}>
                  {Object.entries(abilities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label="Expires in (days)">
                <Input type="number" min={1} max={365} value={tokenForm.expires_in_days} onChange={(event) => setTokenForm({ ...tokenForm, expires_in_days: event.target.value })} />
              </Field>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={webhookOpen}
        onClose={() => { setWebhookOpen(false); setCreatedSecret(''); }}
        title={editing ? 'Edit webhook' : 'Add webhook'}
        wide
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => { setWebhookOpen(false); setCreatedSecret(''); }}>{createdSecret ? 'Done' : 'Cancel'}</Button>
            {!createdSecret && <Button size="sm" loading={saveWebhook.isPending} disabled={form.name.trim().length < 2 || !form.url.startsWith('http') || form.events.length === 0} onClick={() => saveWebhook.mutate()}>{editing ? 'Save webhook' : 'Create webhook'}</Button>}
          </>
        }
      >
        {createdSecret ? (
          <div>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
              <strong>Copy the signing secret now.</strong> It is encrypted at rest and will not be displayed again. Use it to verify the <code>X-BD-Signature</code> header.
            </p>
            <Field label="Signing secret" className="mt-3">
              <CopyField value={createdSecret} />
            </Field>
          </div>
        ) : (
          <div className="space-y-3">
            {formError && <p className="rounded bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">{formError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Order sync" maxLength={120} /></Field>
              <Field label="Active">
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
                  Deliver events to this endpoint
                </label>
              </Field>
            </div>
            <Field label="Endpoint URL" required hint="Must be HTTPS in production. The endpoint should return 2xx quickly.">
              <Input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://example.com/webhooks/bd-marketplace" maxLength={500} />
            </Field>
            <Field label="Signing secret" hint={editing ? 'Leave blank to keep the existing secret.' : 'Leave blank to generate a strong secret automatically.'}>
              <Input type="password" value={form.secret} onChange={(event) => setForm({ ...form, secret: event.target.value })} placeholder={editing ? 'Unchanged' : 'Auto-generate'} maxLength={200} autoComplete="new-password" />
            </Field>
            <div>
              <p className="label">Events <span className="text-rose-500">*</span></p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {events.map((event) => (
                  <label key={event} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 text-brand-500" checked={form.events.includes(event)} onChange={() => toggleEvent(event)} />
                    <span className="font-mono">{event}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Select at least one event. Only allow-listed events can ever be dispatched.</p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deliveryTarget}
        onClose={() => setDeliveryTarget(null)}
        title={`Deliveries · ${deliveryTarget?.name || ''}`}
        wide
        footer={<Button size="sm" variant="secondary" onClick={() => setDeliveryTarget(null)}>Close</Button>}
      >
        {deliveriesQuery.isLoading ? <Loading label="Loading deliveries…" /> : deliveriesQuery.error ? (
          <p className="text-xs text-rose-600">{apiError(deliveriesQuery.error)}</p>
        ) : !deliveriesQuery.data?.deliveries.length ? (
          <p className="text-xs text-slate-500">No deliveries recorded yet. Use “Send test” to queue one.</p>
        ) : (
          <div className="space-y-2">
            {deliveriesQuery.data.deliveries.map((delivery) => (
              <div key={delivery.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[11px] font-semibold text-slate-800">{delivery.event}</p>
                  <Badge tone={delivery.failed_at ? 'red' : delivery.delivered_at ? 'green' : 'amber'}>
                    {delivery.failed_at ? 'Failed' : delivery.delivered_at ? `HTTP ${delivery.response_status ?? 200}` : 'Pending'}
                  </Badge>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  Attempts: {delivery.attempts}
                  {delivery.created_at ? ` · ${dateTime(delivery.created_at)}` : ''}
                  {delivery.delivered_at ? ` · delivered ${dateTime(delivery.delivered_at)}` : ''}
                </p>
                {delivery.response_body && (
                  <pre className="mt-2 max-h-24 overflow-auto rounded bg-slate-900 px-2 py-1.5 text-[10px] leading-relaxed text-slate-200">{delivery.response_body.slice(0, 500)}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete webhook"
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button size="sm" variant="danger" loading={deleteWebhook.isPending} onClick={() => deleteTarget && deleteWebhook.mutate(deleteTarget.id)}>Delete webhook</Button>
          </>
        }
      >
        <p className="text-xs leading-relaxed text-slate-600">
          Delete <strong>{deleteTarget?.name}</strong>? Its delivery history is removed too. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
