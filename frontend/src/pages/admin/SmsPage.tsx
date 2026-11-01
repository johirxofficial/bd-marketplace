import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { dateTime } from '../../lib/format'
import { usePublicSettings } from '../../lib/settings'
import { Badge, Button, EmptyState, Field, Input, Loading, PageHeader, Pagination, Select, Textarea, useToast } from '../../components/ui'

type Gateway = {
  id?: number
  name: string
  driver: string
  sender_id?: string | null
  enabled: boolean
  is_default: boolean
  config: Record<string, any>
}

type Template = { id: number; event: string; name: string; body: string; enabled: boolean }
type Message = { id: number; to: string; body: string; event?: string; status: string; gateway?: string; provider_ref?: string; error?: string; sent_at?: string; created_at?: string }

const driverLabels: Record<string, string> = {
  log: 'Log file (development)',
  sslwireless: 'SSL Wireless',
  bulksmsbd: 'BulkSMSBD',
  alpha: 'Alpha SMS',
}

const emptyGateway: Gateway = {
  name: '', driver: 'log', sender_id: '', enabled: false, is_default: false, config: {},
}

function GatewayEditor({ initial, drivers, onSaved }: { initial: Gateway; drivers: Record<string, string>; onSaved: () => void }) {
  const { push } = useToast()
  const [form, setForm] = useState<Gateway>(() => ({ ...initial, config: { ...(initial.config || {}) } }))
  const [error, setError] = useState('')

  useEffect(() => {
    setForm({ ...initial, config: { ...(initial.config || {}) } })
  }, [initial.id])

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        driver: form.driver,
        sender_id: form.sender_id || null,
        enabled: form.enabled,
        is_default: form.is_default,
        // Strip server-side mask flags before sending configuration back.
        config: Object.fromEntries(Object.entries(form.config || {}).filter(([key]) => !key.startsWith('has_'))),
      }
      return initial.id
        ? (await api.patch(`/admin/sms/gateways/${initial.id}`, payload)).data
        : (await api.post('/admin/sms/gateways', payload)).data
    },
    onSuccess: () => {
      setError('')
      push(initial.id ? 'SMS gateway saved.' : 'SMS gateway created.')
      if (!initial.id) setForm({ ...emptyGateway, config: {} })
      onSaved()
    },
    onError: (err) => setError(apiError(err, 'The SMS gateway could not be saved.')),
  })

  const secretKey = form.driver === 'sslwireless' ? 'api_token' : form.driver === 'bulksmsbd' || form.driver === 'alpha' ? 'api_key' : null
  const hasSecret = secretKey ? !!form.config[`has_${secretKey}`] : false

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-slate-800">{initial.id ? form.name : 'New SMS gateway'}</p>
          <p className="text-[10px] text-slate-400">{driverLabels[form.driver] || form.driver}</p>
        </div>
        {form.enabled && <Badge tone={form.is_default ? 'green' : 'blue'}>{form.is_default ? 'Default' : 'Enabled'}</Badge>}
      </div>

      {error && <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{error}</p>}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Gateway name" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={100} /></Field>
        <Field label="Driver" required>
          <Select value={form.driver} onChange={(event) => setForm({ ...form, driver: event.target.value, config: {} })}>
            {Object.entries(drivers).map(([value, label]) => <option key={value} value={value}>{label || driverLabels[value] || value}</option>)}
          </Select>
        </Field>
        <Field label="Sender ID" hint="Approved sender mask, e.g. BDMARKET."><Input value={form.sender_id || ''} onChange={(event) => setForm({ ...form, sender_id: event.target.value })} maxLength={60} /></Field>
        {secretKey && (
          <Field label={secretKey === 'api_token' ? 'API token' : 'API key'} hint={hasSecret ? 'A secret is already stored. Leave blank to keep it.' : 'Required for this provider.'}>
            <Input type="password" value={form.config[secretKey] || ''} onChange={(event) => setForm({ ...form, config: { ...form.config, [secretKey]: event.target.value } })} maxLength={300} autoComplete="new-password" />
          </Field>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={form.is_default} onChange={(event) => setForm({ ...form, is_default: event.target.checked })} />
          Use as default gateway
        </label>
        <Button size="sm" className="ml-auto" loading={save.isPending} disabled={!form.name || !form.driver} onClick={() => save.mutate()}>
          {initial.id ? 'Save gateway' : 'Create gateway'}
        </Button>
      </div>
    </div>
  )
}

export default function AdminSmsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const { data: settings } = usePublicSettings()
  const [tab, setTab] = useState<'overview' | 'gateways' | 'templates' | 'log'>('overview')
  const [messagePage, setMessagePage] = useState(1)
  const [messageStatus, setMessageStatus] = useState('')
  const [testTo, setTestTo] = useState('')
  const [testBody, setTestBody] = useState('Test message from the marketplace. If you received this, SMS delivery is working.')

  const gatewaysQuery = useQuery({
    queryKey: ['admin-sms-gateways'],
    queryFn: async () => (await api.get('/admin/sms/gateways')).data as { gateways: Gateway[]; drivers: Record<string, string> },
  })
  const templatesQuery = useQuery({
    queryKey: ['admin-sms-templates'],
    queryFn: async () => (await api.get('/admin/sms/templates')).data.templates as Template[],
  })
  const messagesQuery = useQuery({
    queryKey: ['admin-sms-messages', messagePage, messageStatus],
    queryFn: async () => (await api.get('/admin/sms/messages', { params: { page: messagePage, status: messageStatus || undefined } })).data as { messages: { data: Message[]; current_page: number; last_page: number; total: number } },
  })

  const toggleSms = useMutation({
    mutationFn: async (enabled: boolean) => (await api.patch('/admin/settings', {
      settings: [{ key: 'sms_enabled', value: enabled ? '1' : '0' }],
    })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-settings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
      push('SMS notification setting saved.')
    },
    onError: (err) => push(apiError(err, 'The SMS setting could not be saved.'), 'error'),
  })

  const sendTest = useMutation({
    mutationFn: async () => (await api.post('/admin/sms/test', { to: testTo, body: testBody })).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-sms-messages'] })
      push(`Test SMS queued (message #${data.sms.id}).`)
    },
    onError: (err) => push(apiError(err, 'The test SMS could not be queued.'), 'error'),
  })

  const refreshGateways = () => queryClient.invalidateQueries({ queryKey: ['admin-sms-gateways'] })

  const gateways = gatewaysQuery.data?.gateways || []
  const drivers = gatewaysQuery.data?.drivers || {}
  const templates = templatesQuery.data || []
  const messages = messagesQuery.data?.messages

  const tabs = [
    ['overview', 'Overview'],
    ['gateways', 'Gateways'],
    ['templates', 'Templates'],
    ['log', 'Message log'],
  ] as const

  return (
    <div>
      <PageHeader
        eyebrow="Notifications"
        title="SMS system"
        subtitle="Template-driven order and payment notifications with encrypted gateway credentials, queued delivery, and a full message log. The default log driver never sends real SMS."
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">SMS delivery master switch</h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">When off, no SMS is queued even if a gateway is enabled. This is the safe default.</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={!!settings?.sms_enabled} disabled={toggleSms.isPending} onChange={(event) => toggleSms.mutate(event.target.checked)} />
                  {settings?.sms_enabled ? 'SMS enabled' : 'SMS disabled'}
                </label>
              </div>
            </div>

            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-900">Send a test SMS</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">Requires SMS enabled and an enabled default gateway. The log driver writes the message to the server log and marks it sent.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[200px_1fr]">
                <Field label="Recipient" required><Input value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="01XXXXXXXXX" maxLength={20} /></Field>
                <Field label="Message" required><Input value={testBody} onChange={(event) => setTestBody(event.target.value)} maxLength={500} /></Field>
              </div>
              <Button size="sm" className="mt-3" loading={sendTest.isPending} disabled={testTo.length < 11 || testBody.length < 3} onClick={() => sendTest.mutate()}>Queue test SMS</Button>
            </div>

            <div className="card p-4 text-[11px] leading-relaxed text-slate-500">
              <h2 className="text-sm font-bold text-slate-900">Provider notes</h2>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>SSL Wireless uses the API v3 send-sms endpoint with an API token and SID.</li>
                <li>BulkSMSBD uses its HTTP API with an API key and sender ID.</li>
                <li>Alpha SMS uses the API key and sender ID.</li>
                <li>Real delivery requires an approved sender mask, an active provider account, and a publicly reachable worker. None of these can be verified without real credentials.</li>
                <li>SMS bodies are truncated to 1,000 characters. Queued messages retry three times before failing.</li>
              </ul>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-900">At a glance</h2>
              <dl className="mt-2 space-y-2 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Master switch</dt><dd className="font-semibold text-slate-800">{settings?.sms_enabled ? 'On' : 'Off'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Gateways</dt><dd className="font-semibold text-slate-800">{gateways.length}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Enabled</dt><dd className="font-semibold text-slate-800">{gateways.filter((gateway) => gateway.enabled).length}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Templates</dt><dd className="font-semibold text-slate-800">{templates.length}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Logged messages</dt><dd className="font-semibold text-slate-800">{messages?.total ?? '—'}</dd></div>
              </dl>
            </div>
            <div className="card p-4 text-[11px] leading-relaxed text-slate-500">
              <h2 className="text-sm font-bold text-slate-900">Default gateway</h2>
              <p className="mt-1.5">{gateways.find((gateway) => gateway.is_default)?.name || 'No default gateway selected.'}</p>
              <p className="mt-1.5">The seeder installs a log-only gateway. Add a real provider and mark it default before enabling SMS for customers.</p>
            </div>
          </aside>
        </div>
      )}

      {tab === 'gateways' && (
        <div className="space-y-4">
          {gatewaysQuery.isLoading ? <Loading label="Loading gateways…" /> : gatewaysQuery.error ? <EmptyState title="Gateways could not be loaded" description={apiError(gatewaysQuery.error)} /> : (
            <>
              {gateways.map((gateway) => <GatewayEditor key={gateway.id} initial={gateway} drivers={drivers} onSaved={refreshGateways} />)}
              <GatewayEditor initial={emptyGateway} drivers={drivers} onSaved={refreshGateways} />
            </>
          )}
        </div>
      )}

      {tab === 'templates' && (
        <div className="space-y-3">
          {templatesQuery.isLoading ? <Loading label="Loading templates…" /> : templates.map((template) => (
            <TemplateEditor key={template.id} template={template} onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin-sms-templates'] })} />
          ))}
        </div>
      )}

      {tab === 'log' && (
        <div>
          <div className="card mb-3 flex flex-wrap items-end gap-2 p-3">
            <Field label="Status" className="w-40">
              <Select value={messageStatus} onChange={(event) => { setMessageStatus(event.target.value); setMessagePage(1) }}>
                <option value="">All statuses</option>
                <option value="queued">Queued</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </Select>
            </Field>
            <p className="ml-auto text-xs text-slate-500">{messages?.total ?? 0} message(s)</p>
          </div>
          {messagesQuery.isLoading ? <Loading label="Loading messages…" /> : messagesQuery.error ? <EmptyState title="Messages could not be loaded" description={apiError(messagesQuery.error)} /> : !messages?.data.length ? (
            <EmptyState title="No SMS messages yet" description="Messages appear here when order, payment, or test SMS events are queued." />
          ) : (
            <div className="card overflow-hidden">
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Recipient</th><th>Event</th><th>Message</th><th>Gateway</th><th>Status</th><th>Created</th></tr></thead>
                  <tbody>
                    {messages.data.map((message) => (
                      <tr key={message.id}>
                        <td className="font-mono text-xs">{message.to}</td>
                        <td className="text-[11px]">{message.event || '—'}</td>
                        <td className="max-w-sm text-[11px] text-slate-600"><p className="line-clamp-2">{message.body}</p>{message.error && <p className="mt-0.5 text-[10px] text-rose-600">{message.error}</p>}</td>
                        <td className="text-[11px]">{message.gateway || '—'}</td>
                        <td><Badge tone={message.status === 'sent' ? 'green' : message.status === 'failed' ? 'red' : 'amber'}>{message.status}</Badge></td>
                        <td className="text-[11px] text-slate-500">{dateTime(message.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={messages.current_page} lastPage={messages.last_page} total={messages.total} onChange={setMessagePage} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TemplateEditor({ template, onSaved }: { template: Template; onSaved: () => void }) {
  const { push } = useToast()
  const [form, setForm] = useState({ name: template.name, body: template.body, enabled: template.enabled })
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: async () => (await api.patch(`/admin/sms/templates/${template.id}`, form)).data,
    onSuccess: () => { setError(''); push(`Template “${template.event}” saved.`); onSaved() },
    onError: (err) => setError(apiError(err, 'The template could not be saved.')),
  })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-slate-800">{form.name}</p>
          <p className="font-mono text-[10px] text-slate-400">{template.event}</p>
        </div>
        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
          Enabled
        </label>
      </div>
      {error && <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{error}</p>}
      <div className="mt-2 grid gap-3 sm:grid-cols-[220px_1fr]">
        <Field label="Template name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} /></Field>
        <Field label="Message body" hint="Placeholders: {customer_name}, {site_name}, {order_number}, {amount}, {status}, {reason}, {payment_method}, {store_name}.">
          <Textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} maxLength={1000} />
        </Field>
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" loading={save.isPending} disabled={!form.name || !form.body} onClick={() => save.mutate()}>Save template</Button>
      </div>
    </div>
  )
}
