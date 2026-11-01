import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { dateTime, statusTone } from '../../lib/format'
import {
  Badge, Button, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader,
  Pagination, Select, StatCard, Textarea, cn, useToast,
} from '../../components/ui'

type Tab = 'overview' | 'smtp' | 'templates' | 'compose' | 'log' | 'subscribers'

type Overview = {
  enabled: boolean
  driver: string
  from_address?: string | null
  from_name?: string | null
  queued: number
  sent: number
  failed: number
  templates: number
  active_templates: number
  subscribers: number
  campaigns: number
  last_30_days: { day: string; total: number }[]
}

type MessageRow = {
  id: number
  to_email: string
  to_name?: string | null
  subject: string
  event?: string | null
  event_label?: string
  status: string
  attempts: number
  error?: string | null
  campaign_id?: number | null
  sent_at?: string | null
  failed_at?: string | null
  created_at?: string | null
  body?: string
}

type Template = { id: number; event: string; name: string; subject: string; body: string; enabled: boolean; updated_at?: string }
type EventOption = { event: string; label: string }
type Campaign = {
  id: number
  subject: string
  audience: string
  status: string
  recipients_count: number
  sent_count: number
  queued_count: number
  failed_count: number
  created_by?: string | null
  created_at?: string | null
}
type Subscriber = { id: number; email: string; name?: string | null; status: string; source: string; subscribed_at?: string | null; unsubscribed_at?: string | null }

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◉' },
  { id: 'smtp', label: 'SMTP & delivery', icon: '✉' },
  { id: 'templates', label: 'Templates', icon: '✎' },
  { id: 'compose', label: 'Compose & campaigns', icon: '↗' },
  { id: 'log', label: 'Message log', icon: '≡' },
  { id: 'subscribers', label: 'Subscribers', icon: '♡' },
]

const campaignAudiences = [
  { value: 'all', label: 'All active accounts' },
  { value: 'customers', label: 'Customers' },
  { value: 'sellers', label: 'Sellers' },
  { value: 'staff', label: 'Staff (admin, manager, support)' },
  { value: 'subscribers', label: 'Newsletter subscribers' },
  { value: 'custom', label: 'Custom email list' },
]

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>
}

function TestEmailBox({ onSent }: { onSent: () => void }) {
  const { push } = useToast()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const send = useMutation({
    mutationFn: async () => (await api.post('/admin/email/test', { email, name: name || undefined })).data,
    onSuccess: () => {
      push('Test email queued. Check the message log for the result.')
      setEmail('')
      setName('')
      onSent()
    },
    onError: (error) => push(apiError(error, 'The test email could not be queued.'), 'error'),
  })

  return (
    <div className="card p-4">
      <h3 className="text-sm font-bold text-slate-900">Send a test email</h3>
      <p className="mt-1 text-xs text-slate-500">Confirm the current configuration can deliver before relying on password resets and order emails.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="Recipient email">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Name (optional)">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
        </Field>
      </div>
      <Button className="mt-3" size="sm" loading={send.isPending} disabled={!email} onClick={() => send.mutate()}>Send test</Button>
    </div>
  )
}

function OverviewTab({ onOpenLog }: { onOpenLog: () => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-email-overview'],
    queryFn: async () => (await api.get('/admin/email/overview')).data as { overview: Overview; recent: MessageRow[]; events: EventOption[] },
  })

  if (isLoading) return <Loading label="Loading email overview…" />
  if (error) return <ErrorState message={apiError(error, 'The email overview could not be loaded.')} onRetry={() => refetch()} />
  if (!data) return null

  const o = data.overview
  const max = Math.max(1, ...o.last_30_days.map((point) => point.total))

  return (
    <div className="space-y-4">
      <div className={cn('flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between', o.driver === 'smtp' && o.enabled ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70')}>
        <div>
          <p className="text-sm font-bold text-slate-900">
            {!o.enabled ? 'Email delivery is paused' : o.driver === 'smtp' ? 'SMTP delivery is configured' : 'Safe log driver is active'}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            {!o.enabled
              ? 'Messages are still recorded in the log, but nothing is delivered. Enable delivery in SMTP & delivery.'
              : o.driver === 'smtp'
                ? `Sending as ${o.from_name || 'Marketplace'} <${o.from_address || 'not set'}>. Send a test email after any change.`
                : 'Email is written to the application log instead of being delivered. Configure SMTP when you are ready for real inbox delivery.'}
          </p>
        </div>
        <Badge tone={o.driver === 'smtp' && o.enabled ? 'green' : 'amber'}>{o.enabled ? o.driver : 'paused'}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sent" value={o.sent.toLocaleString()} hint="All time delivered" tone="green" icon={<span className="text-sm">✓</span>} />
        <StatCard label="Queued" value={o.queued.toLocaleString()} hint="Waiting for the worker" tone="amber" icon={<span className="text-sm">…</span>} />
        <StatCard label="Failed" value={o.failed.toLocaleString()} hint="Retry from the log" tone="red" icon={<span className="text-sm">!</span>} />
        <StatCard label="Subscribers" value={o.subscribers.toLocaleString()} hint={`${o.active_templates}/${o.templates} templates active`} tone="blue" icon={<span className="text-sm">♡</span>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Volume, last 30 days</h3>
              <p className="text-xs text-slate-500">Every automatic and manual message recorded.</p>
            </div>
            <Badge tone="slate">{o.campaigns} campaigns</Badge>
          </div>
          {o.last_30_days.length === 0 ? (
            <p className="mt-6 text-center text-xs text-slate-400">No email activity yet.</p>
          ) : (
            <div className="mt-5 flex h-32 items-end gap-1">
              {o.last_30_days.map((point) => (
                <div key={point.day} className="group relative flex-1" title={`${point.day}: ${point.total}`}>
                  <div className="w-full rounded-t bg-brand-400 transition group-hover:bg-brand-600" style={{ height: `${Math.max(6, (point.total / max) * 100)}%` }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <TestEmailBox onSent={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-email-overview'] })
          queryClient.invalidateQueries({ queryKey: ['admin-email-messages'] })
        }} />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Recent messages</h3>
          <Button size="xs" variant="ghost" onClick={onOpenLog}>Open full log →</Button>
        </div>
        {data.recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">No messages yet. Send a test email or place an order.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Recipient</th><th>Subject</th><th>Event</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {data.recent.map((message) => (
                  <tr key={message.id}>
                    <td className="font-medium text-slate-800">{message.to_email}</td>
                    <td className="max-w-[280px] truncate">{message.subject}</td>
                    <td className="text-xs text-slate-500">{message.event_label || message.event || '—'}</td>
                    <td><StatusBadge status={message.status} /></td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{dateTime(message.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SmtpTab() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-email-settings'],
    queryFn: async () => (await api.get('/admin/email/settings')).data.settings as Record<string, any>,
  })
  const [form, setForm] = useState<Record<string, any>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!data || loaded) return
    setForm({ ...data, password: '' })
    setLoaded(true)
  }, [data, loaded])

  const save = useMutation({
    mutationFn: async () => (await api.patch('/admin/email/settings', {
      enabled: !!form.enabled,
      driver: form.driver || 'log',
      host: form.host || null,
      port: form.port ? Number(form.port) : null,
      encryption: form.encryption || null,
      username: form.username || null,
      password: form.password || null,
      from_address: form.from_address,
      from_name: form.from_name,
      reply_to: form.reply_to || null,
      footer_note: form.footer_note || null,
    })).data,
    onSuccess: (result) => {
      // Re-sync from the server so password_set reflects the saved secret,
      // then clear the password input instead of leaving it in memory.
      if (result?.settings) setForm({ ...result.settings, password: '' })
      queryClient.invalidateQueries({ queryKey: ['admin-email-settings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-overview'] })
      push('Mail settings saved.')
    },
    onError: (err) => push(apiError(err, 'Mail settings could not be saved.'), 'error'),
  })

  if (isLoading) return <Loading label="Loading mail settings…" />
  if (error) return <ErrorState message={apiError(error, 'Mail settings could not be loaded.')} onRetry={() => refetch()} />

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }))
  const smtp = (form.driver || 'log') === 'smtp'

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Delivery configuration</h3>
            <p className="mt-1 text-xs text-slate-500">Changes apply at runtime. No .env edit or service restart is required.</p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={!!form.enabled} onChange={(event) => set('enabled', event.target.checked)} />
            Email delivery enabled
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Driver" hint="Log is safe for development. SMTP delivers to real inboxes.">
            <Select value={form.driver || 'log'} onChange={(event) => set('driver', event.target.value)}>
              <option value="log">Log file (no delivery)</option>
              <option value="smtp">SMTP server</option>
            </Select>
          </Field>
          <Field label="From email" required>
            <Input type="email" value={form.from_address || ''} onChange={(event) => set('from_address', event.target.value)} placeholder="no-reply@example.com" />
          </Field>
          <Field label="From name" required>
            <Input value={form.from_name || ''} onChange={(event) => set('from_name', event.target.value)} placeholder="Your marketplace" />
          </Field>
          <Field label="Reply-to (optional)">
            <Input type="email" value={form.reply_to || ''} onChange={(event) => set('reply_to', event.target.value)} placeholder="support@example.com" />
          </Field>
        </div>

        <div className={cn('mt-4 rounded-xl border p-3 transition', smtp ? 'border-slate-200 bg-slate-50/60' : 'border-dashed border-slate-200 bg-slate-50/30 opacity-70')}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">SMTP server</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Host">
              <Input value={form.host || ''} onChange={(event) => set('host', event.target.value)} placeholder="smtp.mailprovider.com" disabled={!smtp} />
            </Field>
            <Field label="Port">
              <Input type="number" value={form.port || ''} onChange={(event) => set('port', event.target.value)} placeholder="587" disabled={!smtp} />
            </Field>
            <Field label="Encryption">
              <Select value={form.encryption || ''} onChange={(event) => set('encryption', event.target.value)} disabled={!smtp}>
                <option value="">None</option>
                <option value="tls">STARTTLS (587)</option>
                <option value="ssl">SSL/TLS (465)</option>
              </Select>
            </Field>
            <Field label="Username">
              <Input value={form.username || ''} onChange={(event) => set('username', event.target.value)} placeholder="mailer@example.com" disabled={!smtp} />
            </Field>
            <Field label="Password" hint={form.password_set ? 'A password is saved. Leave blank to keep it.' : 'Stored encrypted in the database.'}>
              <Input type="password" value={form.password || ''} onChange={(event) => set('password', event.target.value)} placeholder={form.password_set ? '•••••••• (unchanged)' : 'SMTP password'} disabled={!smtp} autoComplete="new-password" />
            </Field>
          </div>
        </div>

        <Field className="mt-3" label="Footer note" hint="Shown at the bottom of every branded email.">
          <Textarea value={form.footer_note || ''} onChange={(event) => set('footer_note', event.target.value)} placeholder="You are receiving this email because you have an account or placed an order." />
        </Field>

        <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save mail settings</Button>
        </div>
      </div>

      <div className="space-y-3">
        <TestEmailBox onSent={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-email-overview'] })
          queryClient.invalidateQueries({ queryKey: ['admin-email-messages'] })
        }} />
        <div className="card p-4 text-[11px] leading-relaxed text-slate-500">
          <h3 className="text-sm font-bold text-slate-900">Provider checklist</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Most providers need a verified sender domain and SPF/DKIM DNS records.</li>
            <li>Use port 587 with STARTTLS, or 465 with SSL/TLS.</li>
            <li>Gmail and Outlook often require an app password, not your normal password.</li>
            <li>Keep the queue worker running so queued messages are delivered.</li>
            <li>Send a test after every SMTP change and check the message log for errors.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function TemplatesTab() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-email-templates'],
    queryFn: async () => (await api.get('/admin/email/templates')).data as { templates: Template[]; events: EventOption[]; placeholders: string[] },
  })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState({ name: '', subject: '', body: '', enabled: true })
  const [preview, setPreview] = useState('')

  const selected = useMemo(() => data?.templates.find((template) => template.id === selectedId) || data?.templates[0], [data, selectedId])

  useEffect(() => {
    if (!selected) return
    setSelectedId(selected.id)
    setForm({ name: selected.name, subject: selected.subject, body: selected.body, enabled: selected.enabled })
    setPreview('')
  }, [selected?.id])

  const save = useMutation({
    mutationFn: async () => (await api.patch(`/admin/email/templates/${selected?.id}`, form)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-email-templates'] })
      push('Template saved.')
    },
    onError: (err) => push(apiError(err, 'Template could not be saved.'), 'error'),
  })

  const previewMutation = useMutation({
    mutationFn: async () => (await api.post(`/admin/email/templates/${selected?.id}/preview`, { subject: form.subject, body: form.body })).data as { html: string },
    onSuccess: (result) => setPreview(result.html),
    onError: (err) => push(apiError(err, 'Preview could not be generated.'), 'error'),
  })

  if (isLoading) return <Loading label="Loading templates…" />
  if (error) return <ErrorState message={apiError(error, 'Templates could not be loaded.')} onRetry={() => refetch()} />
  if (!data || data.templates.length === 0) return <EmptyState title="No templates yet" description="Run the EmailSeeder to install the default automatic email templates." />

  return (
    <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
      <div className="card max-h-[70vh] overflow-y-auto p-2">
        {data.templates.map((template) => (
          <button
            key={template.id}
            onClick={() => { setSelectedId(template.id); setPreview('') }}
            className={cn('mb-1 block w-full rounded-lg px-3 py-2 text-left transition', selected?.id === template.id ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50')}
          >
            <span className="block truncate text-xs font-semibold text-slate-800">{template.name}</span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <span className="truncate text-[10px] text-slate-400">{template.event}</span>
              {!template.enabled && <Badge tone="red" className="px-1.5 py-0 text-[9px]">off</Badge>}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{selected?.name}</h3>
              <p className="text-[11px] text-slate-400">Event: <code>{selected?.event}</code></p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-500" checked={form.enabled} onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))} />
              Enabled
            </label>
          </div>

          <div className="mt-3 grid gap-3">
            <Field label="Template name">
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </Field>
            <Field label="Subject line" hint="Use placeholders such as {order_number}, {store_name}, and {customer_name}.">
              <Input value={form.subject} onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))} />
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            {data.placeholders.slice(0, 16).map((placeholder) => (
              <button key={placeholder} type="button" onClick={() => setForm((prev) => ({ ...prev, body: `${prev.body}{${placeholder}}` }))} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 hover:bg-brand-50 hover:text-brand-700">
                {`{${placeholder}}`}
              </button>
            ))}
          </div>

          <Field className="mt-3" label="Email body (HTML)" hint="The body is wrapped in the responsive branded layout automatically. Placeholders are escaped; HTML you write here is trusted administrator content.">
            <Textarea value={form.body} onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))} className="min-h-[240px] font-mono text-xs" />
          </Field>

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" loading={previewMutation.isPending} onClick={() => previewMutation.mutate()}>Preview</Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>Save template</Button>
          </div>
        </div>

        {preview && (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <h3 className="text-sm font-bold text-slate-900">Live preview</h3>
              <Button size="xs" variant="ghost" onClick={() => setPreview('')}>Close</Button>
            </div>
            <iframe title="Email preview" srcDoc={preview} className="h-[520px] w-full bg-slate-100" sandbox="" />
          </div>
        )}
      </div>
    </div>
  )
}

function ComposeTab() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [single, setSingle] = useState({ email: '', name: '', subject: '', body: '<p>Hello,</p>\n<p></p>\n<p>— The team</p>' })
  const [campaign, setCampaign] = useState({ subject: '', body: '<p>Hello,</p>\n<p></p>', audience: 'subscribers', emails: '' })

  const campaigns = useQuery({
    queryKey: ['admin-email-campaigns'],
    queryFn: async () => (await api.get('/admin/email/campaigns')).data.campaigns,
  })

  const sendSingle = useMutation({
    mutationFn: async () => (await api.post('/admin/email/compose', { ...single, name: single.name || undefined })).data,
    onSuccess: () => {
      push('Email queued for delivery.')
      setSingle((prev) => ({ ...prev, email: '', name: '', subject: '' }))
      queryClient.invalidateQueries({ queryKey: ['admin-email-messages'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-overview'] })
    },
    onError: (err) => push(apiError(err, 'The email could not be queued.'), 'error'),
  })

  const sendCampaign = useMutation({
    mutationFn: async () => {
      const emails = campaign.audience === 'custom'
        ? campaign.emails.split(/[\s,;]+/).map((email) => email.trim()).filter(Boolean)
        : undefined
      return (await api.post('/admin/email/campaigns', { ...campaign, emails })).data
    },
    onSuccess: (data) => {
      push(data.message)
      setCampaign((prev) => ({ ...prev, subject: '' }))
      queryClient.invalidateQueries({ queryKey: ['admin-email-campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-messages'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-overview'] })
    },
    onError: (err) => push(apiError(err, 'The campaign could not be queued.'), 'error'),
  })

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-900">Send one email</h3>
            <p className="mt-1 text-xs text-slate-500">A personal, manual message. It appears in the log like every other email.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Recipient email" required>
              <Input type="email" value={single.email} onChange={(event) => setSingle((prev) => ({ ...prev, email: event.target.value }))} placeholder="customer@example.com" />
            </Field>
            <Field label="Name (optional)">
              <Input value={single.name} onChange={(event) => setSingle((prev) => ({ ...prev, name: event.target.value }))} />
            </Field>
          </div>
          <Field className="mt-2" label="Subject" required>
            <Input value={single.subject} onChange={(event) => setSingle((prev) => ({ ...prev, subject: event.target.value }))} />
          </Field>
          <Field className="mt-2" label="Body (HTML)">
            <Textarea className="min-h-[190px] font-mono text-xs" value={single.body} onChange={(event) => setSingle((prev) => ({ ...prev, body: event.target.value }))} />
          </Field>
          <div className="mt-3 text-right">
            <Button loading={sendSingle.isPending} disabled={!single.email || !single.subject} onClick={() => sendSingle.mutate()}>Queue manual email</Button>
          </div>
        </div>

        <div className="card p-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-900">Send a campaign</h3>
            <p className="mt-1 text-xs text-slate-500">Queued in the background. Each recipient gets an unsubscribe link when they are a newsletter subscriber.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Audience">
              <Select value={campaign.audience} onChange={(event) => setCampaign((prev) => ({ ...prev, audience: event.target.value }))}>
                {campaignAudiences.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </Field>
            <Field label="Subject" required>
              <Input value={campaign.subject} onChange={(event) => setCampaign((prev) => ({ ...prev, subject: event.target.value }))} />
            </Field>
          </div>
          {campaign.audience === 'custom' && (
            <Field className="mt-2" label="Custom recipients" hint="Separate addresses with commas, spaces, or new lines (maximum 2,000).">
              <Textarea value={campaign.emails} onChange={(event) => setCampaign((prev) => ({ ...prev, emails: event.target.value }))} className="min-h-[70px]" />
            </Field>
          )}
          <Field className="mt-2" label="Body (HTML)">
            <Textarea className="min-h-[190px] font-mono text-xs" value={campaign.body} onChange={(event) => setCampaign((prev) => ({ ...prev, body: event.target.value }))} />
          </Field>
          <div className="mt-3 text-right">
            <Button loading={sendCampaign.isPending} disabled={!campaign.subject} onClick={() => sendCampaign.mutate()}>Queue campaign</Button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Recent campaigns</h3>
        </div>
        {campaigns.isLoading ? <Loading label="Loading campaigns…" /> : !campaigns.data?.length ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">No campaigns yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Subject</th><th>Audience</th><th>Recipients</th><th>Delivered</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {campaigns.data.map((item: Campaign) => (
                  <tr key={item.id}>
                    <td className="max-w-[280px] truncate font-medium text-slate-800">{item.subject}</td>
                    <td className="capitalize text-xs text-slate-500">{item.audience}</td>
                    <td className="text-xs">{item.recipients_count}</td>
                    <td className="text-xs">{item.sent_count}{item.failed_count ? ` · ${item.failed_count} failed` : ''}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{dateTime(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function LogTab() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [status, setStatus] = useState('')
  const [event, setEvent] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<MessageRow | null>(null)

  const messages = useQuery({
    queryKey: ['admin-email-messages', status, event, search, page],
    queryFn: async () => (await api.get('/admin/email/messages', { params: { status: status || undefined, event: event || undefined, search: search || undefined, page } })).data,
  })

  async function openMessage(id: number) {
    try {
      const { data } = await api.get(`/admin/email/messages/${id}`)
      setSelected(data.message)
    } catch (error) {
      push(apiError(error, 'The message could not be opened.'), 'error')
    }
  }

  const retry = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/email/messages/${id}/retry`)).data,
    onSuccess: () => {
      push('Message queued for another attempt.')
      queryClient.invalidateQueries({ queryKey: ['admin-email-messages'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-overview'] })
      setSelected(null)
    },
    onError: (err) => push(apiError(err, 'The message could not be retried.'), 'error'),
  })

  return (
    <div className="space-y-3">
      <div className="card grid gap-2 p-3 sm:grid-cols-[1fr_170px_200px_auto]">
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search recipient or subject…" />
        <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </Select>
        <Select value={event} onChange={(event) => { setEvent(event.target.value); setPage(1) }}>
          <option value="">All events</option>
          {messages.data?.filters?.events?.map((item: EventOption) => <option key={item.event} value={item.event}>{item.label}</option>)}
        </Select>
        <Button variant="secondary" onClick={() => { setStatus(''); setEvent(''); setSearch(''); setPage(1) }}>Reset</Button>
      </div>

      <div className="card overflow-hidden">
        {messages.isLoading ? <Loading label="Loading message log…" /> : messages.error ? (
          <div className="p-4"><ErrorState message={apiError(messages.error, 'The log could not be loaded.')} onRetry={() => messages.refetch()} /></div>
        ) : !messages.data?.messages?.data?.length ? (
          <EmptyState title="No messages match these filters" description="Try clearing the filters or send a test email." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Recipient</th><th>Subject</th><th>Event</th><th>Status</th><th>Attempts</th><th>Created</th><th /></tr></thead>
              <tbody>
                {messages.data.messages.data.map((message: MessageRow) => (
                  <tr key={message.id}>
                    <td>
                      <p className="font-medium text-slate-800">{message.to_email}</p>
                      {message.to_name && <p className="text-[10px] text-slate-400">{message.to_name}</p>}
                    </td>
                    <td className="max-w-[260px] truncate">{message.subject}</td>
                    <td className="text-xs text-slate-500">{message.event_label || message.event || '—'}</td>
                    <td><StatusBadge status={message.status} /></td>
                    <td className="text-xs text-slate-500">{message.attempts}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{dateTime(message.created_at)}</td>
                    <td className="text-right">
                      <Button size="xs" variant="ghost" onClick={() => openMessage(message.id)}>View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={messages.data?.messages?.current_page || 1}
        lastPage={messages.data?.messages?.last_page || 1}
        onChange={setPage}
        total={messages.data?.messages?.total}
      />

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Message #${selected.id}` : 'Message'} wide
        footer={selected && selected.status !== 'sent' ? <Button variant="secondary" loading={retry.isPending} onClick={() => selected && retry.mutate(selected.id)}>Retry delivery</Button> : undefined}>
        {selected && (
          <div className="space-y-3">
            <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
              <p><span className="text-slate-500">To:</span> <strong>{selected.to_email}</strong></p>
              <p><span className="text-slate-500">Status:</span> <StatusBadge status={selected.status} /></p>
              <p className="sm:col-span-2"><span className="text-slate-500">Subject:</span> <strong>{selected.subject}</strong></p>
              <p><span className="text-slate-500">Event:</span> {selected.event_label || selected.event || '—'}</p>
              <p><span className="text-slate-500">Attempts:</span> {selected.attempts}</p>
              {selected.error && <p className="sm:col-span-2 rounded bg-rose-50 p-2 text-rose-700"><span className="font-semibold">Error:</span> {selected.error}</p>}
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Rendered body (unwrapped)</p>
              <div className="max-h-72 overflow-y-auto text-sm" dangerouslySetInnerHTML={{ __html: selected.body || '' }} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function SubscribersTab() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState({ email: '', name: '' })

  const subscribers = useQuery({
    queryKey: ['admin-email-subscribers', search, status, page],
    queryFn: async () => (await api.get('/admin/email/subscribers', { params: { search: search || undefined, status: status || undefined, page } })).data,
  })

  const add = useMutation({
    mutationFn: async () => (await api.post('/admin/email/subscribers', { email: form.email, name: form.name || undefined })).data,
    onSuccess: () => {
      push('Subscriber saved.')
      setForm({ email: '', name: '' })
      queryClient.invalidateQueries({ queryKey: ['admin-email-subscribers'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-overview'] })
    },
    onError: (err) => push(apiError(err, 'The subscriber could not be saved.'), 'error'),
  })

  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/email/subscribers/${id}`)).data,
    onSuccess: () => {
      push('Subscriber unsubscribed.')
      queryClient.invalidateQueries({ queryKey: ['admin-email-subscribers'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-overview'] })
    },
    onError: (err) => push(apiError(err, 'The subscriber could not be updated.'), 'error'),
  })

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h3 className="text-sm font-bold text-slate-900">Add a subscriber</h3>
        <p className="mt-1 text-xs text-slate-500">Useful for phone orders, events, or customers who asked to be added manually. Consent matters — only add people who asked.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Email"><Input type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="person@example.com" /></Field>
          <Field label="Name (optional)"><Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></Field>
          <Button loading={add.isPending} disabled={!form.email} onClick={() => add.mutate()}>Add subscriber</Button>
        </div>
      </div>

      <div className="card grid gap-2 p-3 sm:grid-cols-[1fr_180px_auto]">
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search email or name…" />
        <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
          <option value="">All subscribers</option>
          <option value="subscribed">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
        </Select>
        <Button variant="secondary" onClick={() => { setSearch(''); setStatus(''); setPage(1) }}>Reset</Button>
      </div>

      <div className="card overflow-hidden">
        {subscribers.isLoading ? <Loading label="Loading subscribers…" /> : !subscribers.data?.subscribers?.data?.length ? (
          <EmptyState title="No subscribers yet" description="The storefront footer signup form feeds this list automatically." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Status</th><th>Subscribed</th><th /></tr></thead>
              <tbody>
                {subscribers.data.subscribers.data.map((subscriber: Subscriber) => (
                  <tr key={subscriber.id}>
                    <td className="font-medium text-slate-800">{subscriber.email}</td>
                    <td className="text-xs text-slate-600">{subscriber.name || '—'}</td>
                    <td className="text-xs capitalize text-slate-500">{subscriber.source}</td>
                    <td><StatusBadge status={subscriber.status === 'subscribed' ? 'active' : 'suspended'} /></td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{dateTime(subscriber.subscribed_at)}</td>
                    <td className="text-right">
                      {subscriber.status === 'subscribed' && <Button size="xs" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate(subscriber.id)}>Unsubscribe</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={subscribers.data?.subscribers?.current_page || 1}
        lastPage={subscribers.data?.subscribers?.last_page || 1}
        onChange={setPage}
        total={subscribers.data?.subscribers?.total}
      />
    </div>
  )
}

export default function AdminEmailPage() {
  const [tab, setTab] = useState<Tab>('overview')

  // Each section is a long page of its own; start at the top when switching.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [tab])

  return (
    <div>
      <PageHeader
        eyebrow="Notifications"
        title="Email center"
        subtitle="Automatic event email, branded templates, manual messages, campaigns, delivery logs, and newsletter subscribers — all in one place."
      />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 no-scrollbar">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition', tab === item.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100')}
          >
            <span className="text-[13px]">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab onOpenLog={() => setTab('log')} />}
      {tab === 'smtp' && <SmtpTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'compose' && <ComposeTab />}
      {tab === 'log' && <LogTab />}
      {tab === 'subscribers' && <SubscribersTab />}
    </div>
  )
}
