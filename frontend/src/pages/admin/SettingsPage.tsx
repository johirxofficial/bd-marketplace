import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { contentWidthOptions, fontOptions, fontScaleOptions, mediaUrl, radiusOptions } from '../../lib/settings'
import { Button, Field, Input, Loading, PageHeader, Select, Textarea, useToast } from '../../components/ui'

type Setting = { id: number; key: string; label?: string; value?: string | null; type?: string; group?: string }
type Kind = 'text' | 'long' | 'boolean' | 'color' | 'image' | 'select'

const groups = [
  { id: 'branding', label: 'Branding & general' },
  { id: 'contact', label: 'Contact & social' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'commerce', label: 'Commerce' },
  { id: 'seo', label: 'SEO' },
  { id: 'legal', label: 'Legal' },
  { id: 'maintenance', label: 'Maintenance' },
] as const

type GroupId = (typeof groups)[number]['id']

const fields: { key: string; label: string; hint: string; kind: Kind; group: GroupId; options?: readonly { value: string; label: string }[] }[] = [
  { key: 'store_name', label: 'Marketplace name', hint: 'Shown in the header, footer, emails, and SMS templates.', kind: 'text', group: 'branding' },
  { key: 'tagline', label: 'Tagline', hint: 'Short supporting line under the logo.', kind: 'text', group: 'branding' },
  { key: 'store_logo_path', label: 'Site logo', hint: 'PNG, JPG, or WebP up to 5 MB. Recommended square or wide mark with transparent background.', kind: 'image', group: 'branding' },
  { key: 'store_favicon_path', label: 'Favicon', hint: 'Small square icon used in browser tabs.', kind: 'image', group: 'branding' },
  { key: 'announcement', label: 'Storefront announcement', hint: 'Displayed in the top bar on every storefront page. Leave blank to hide.', kind: 'text', group: 'branding' },
  { key: 'footer_text', label: 'Footer description', hint: 'Short paragraph in the footer.', kind: 'long', group: 'branding' },
  { key: 'about', label: 'About the marketplace', hint: 'Used on the public about page.', kind: 'long', group: 'branding' },

  { key: 'support_phone', label: 'Support phone', hint: 'Public support number.', kind: 'text', group: 'contact' },
  { key: 'support_email', label: 'Support email', hint: 'Public support email address.', kind: 'text', group: 'contact' },
  { key: 'support_hours', label: 'Support hours', hint: 'Shown in the help center.', kind: 'text', group: 'contact' },
  { key: 'support_address', label: 'Support address', hint: 'Public office address.', kind: 'text', group: 'contact' },
  { key: 'whatsapp_number', label: 'WhatsApp number', hint: 'Includes country code, for example +8801XXXXXXXXX.', kind: 'text', group: 'contact' },
  { key: 'facebook_url', label: 'Facebook URL', hint: 'Full URL including https://', kind: 'text', group: 'contact' },
  { key: 'instagram_url', label: 'Instagram URL', hint: 'Full URL including https://', kind: 'text', group: 'contact' },
  { key: 'youtube_url', label: 'YouTube URL', hint: 'Full URL including https://', kind: 'text', group: 'contact' },
  { key: 'tiktok_url', label: 'TikTok URL', hint: 'Full URL including https://', kind: 'text', group: 'contact' },
  { key: 'linkedin_url', label: 'LinkedIn URL', hint: 'Full URL including https://', kind: 'text', group: 'contact' },

  { key: 'primary_color', label: 'Primary colour', hint: 'Hex colour applied to storefront buttons, links, badges, and accents.', kind: 'color', group: 'appearance' },
  { key: 'secondary_color', label: 'Secondary colour', hint: 'Hex colour used for the storefront announcement bar.', kind: 'color', group: 'appearance' },
  { key: 'currency_symbol', label: 'Currency symbol', hint: 'Displayed next to monetary values.', kind: 'text', group: 'appearance' },

  { key: 'font_family', label: 'Body font', hint: 'Used for product names, descriptions, and all body copy.', kind: 'select', group: 'appearance', options: fontOptions },
  { key: 'heading_font_family', label: 'Heading font', hint: 'Used for page titles and section headings. Pair a distinctive heading with a calm body font.', kind: 'select', group: 'appearance', options: fontOptions },
  { key: 'font_scale', label: 'Font size', hint: 'Scale the whole interface for comfort and accessibility.', kind: 'select', group: 'appearance', options: fontScaleOptions },
  { key: 'content_width', label: 'Content width', hint: 'How wide the storefront and portal content stretches on large screens.', kind: 'select', group: 'appearance', options: contentWidthOptions },
  { key: 'card_radius', label: 'Card corner radius', hint: 'Sharp for editorial, soft for a friendly storefront, rounded for a playful look.', kind: 'select', group: 'appearance', options: radiusOptions },
  { key: 'product_columns', label: 'Product grid columns', hint: 'Columns on desktop. Mobile always uses two columns for comfortable browsing.', kind: 'select', group: 'appearance', options: [{ value: '3', label: '3 columns' }, { value: '4', label: '4 columns' }, { value: '5', label: '5 columns' }] },
  { key: 'sticky_header', label: 'Sticky header', hint: 'Keep search and cart visible while scrolling the storefront.', kind: 'boolean', group: 'appearance' },
  { key: 'show_announcement', label: 'Show announcement bar', hint: 'Display the top storefront announcement above the header.', kind: 'boolean', group: 'appearance' },

  { key: 'newsletter_enabled', label: 'Newsletter signup', hint: 'Show the subscribe form in the storefront footer.', kind: 'boolean', group: 'appearance' },
  { key: 'newsletter_title', label: 'Newsletter title', hint: 'Headline shown above the email signup field.', kind: 'text', group: 'appearance' },
  { key: 'newsletter_text', label: 'Newsletter description', hint: 'One or two honest sentences about what subscribers receive.', kind: 'long', group: 'appearance' },

  { key: 'cod_enabled', label: 'Cash on Delivery enabled', hint: 'Disabling COD blocks new COD checkouts. Existing orders are unaffected.', kind: 'boolean', group: 'commerce' },
  { key: 'tax_enabled', label: 'Tax enabled', hint: 'When disabled, checkout shows zero tax.', kind: 'boolean', group: 'commerce' },
  { key: 'tax_percent', label: 'Tax percentage', hint: 'Applied by the pricing engine when tax is enabled.', kind: 'text', group: 'commerce' },
  { key: 'min_order_amount', label: 'Minimum order amount', hint: 'Use 0 to disable a minimum.', kind: 'text', group: 'commerce' },
  { key: 'order_prefix', label: 'Order number prefix', hint: 'Short prefix used for new order numbers.', kind: 'text', group: 'commerce' },
  { key: 'free_shipping_note', label: 'Free shipping note', hint: 'Shown alongside shipping information at checkout.', kind: 'text', group: 'commerce' },
  { key: 'return_policy', label: 'Returns policy summary', hint: 'Short public summary of the returns policy.', kind: 'long', group: 'commerce' },
  { key: 'sms_enabled', label: 'SMS notifications enabled', hint: 'When off, no SMS is queued even if a gateway is active. Configure gateways under SMS.', kind: 'boolean', group: 'commerce' },

  { key: 'meta_title', label: 'Meta title', hint: 'Browser tab and search result title.', kind: 'text', group: 'seo' },
  { key: 'meta_description', label: 'Meta description', hint: 'Search result summary, ideally under 160 characters.', kind: 'long', group: 'seo' },
  { key: 'meta_keywords', label: 'Meta keywords', hint: 'Comma-separated keywords.', kind: 'text', group: 'seo' },

  { key: 'privacy_policy', label: 'Privacy policy', hint: 'Public privacy policy content.', kind: 'long', group: 'legal' },
  { key: 'terms_conditions', label: 'Terms and conditions', hint: 'Public terms of service content.', kind: 'long', group: 'legal' },

  { key: 'maintenance_mode', label: 'Maintenance mode', hint: 'Customers see a maintenance page. Staff can still sign in and use the administration area.', kind: 'boolean', group: 'maintenance' },
  { key: 'maintenance_message', label: 'Maintenance message', hint: 'Shown to customers while maintenance mode is on.', kind: 'long', group: 'maintenance' },
]

const truthy = (value: string | null | undefined) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase())

function ImageInput({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const { push } = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const preview = mediaUrl(value)

  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      push('Image is larger than 5 MB.', 'error')
      return
    }
    setUploading(true)
    try {
      const body = new FormData()
      body.append('image', file)
      body.append('folder', 'branding')
      const { data } = await api.post('/uploads', body)
      onChange(data.path)
      push('Image uploaded. Save settings to publish it.')
    } catch (error) {
      push(apiError(error, 'The image could not be uploaded.'), 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-3">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
        {preview ? <img src={preview} alt="Current logo" className="h-full w-full object-contain" /> : <span className="text-[10px] text-slate-400">No image</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) upload(file)
          }}
        />
        <Button size="sm" variant="secondary" loading={uploading} onClick={() => inputRef.current?.click()}>Upload image</Button>
        {value && <Button size="sm" variant="ghost" onClick={() => onChange('')}>Remove</Button>}
        <p className="w-full text-[10px] text-slate-400">Stored under <code>branding/</code>. The file is validated server-side and served through the media route.</p>
      </div>
    </div>
  )
}

export default function AdminSettingsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [group, setGroup] = useState<GroupId>('branding')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => (await api.get('/admin/settings')).data.settings as Setting[],
  })

  useEffect(() => {
    if (!data || loaded) return
    const map: Record<string, string> = {}
    data.forEach((setting) => { map[setting.key] = setting.value ?? '' })
    fields.forEach((field) => {
      if (map[field.key] === undefined) map[field.key] = field.kind === 'boolean' ? '0' : ''
    })
    setValues(map)
    setLoaded(true)
  }, [data, loaded])

  const save = useMutation({
    mutationFn: async () => (await api.patch('/admin/settings', {
      settings: fields.map((field) => ({ key: field.key, value: values[field.key] ?? '' })),
    })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
      queryClient.invalidateQueries({ queryKey: ['public-settings'] })
      setError('')
      push('Platform settings saved.')
    },
    onError: (err) => setError(apiError(err, 'Settings could not be saved.')),
  })

  if (isLoading) return <Loading label="Loading settings…" />
  if (!data) return <p className="text-sm text-slate-500">Settings could not be loaded. <button className="link" onClick={() => refetch()}>Retry</button></p>

  const visible = fields.filter((field) => field.group === group)
  const logoPath = values.store_logo_path

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Platform settings"
        subtitle="Branding, contact details, commerce switches, SEO, legal content, maintenance mode, and notifications. Every change is audited."
        actions={<Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save all settings</Button>}
      />

      {error && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {groups.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setGroup(item.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${group === item.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <form onSubmit={(event) => { event.preventDefault(); save.mutate() }} className="card space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">{groups.find((item) => item.id === group)?.label}</h2>
            <span className="text-[10px] uppercase tracking-wide text-slate-400">{visible.length} fields</span>
          </div>

          {visible.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint} required={['store_name', 'support_email', 'meta_title'].includes(field.key)}>
              {field.kind === 'select' ? (
                <Select value={values[field.key] || ''} onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}>
                  <option value="">Use the default</option>
                  {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              ) : field.kind === 'boolean' ? (
                <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-500"
                    checked={truthy(values[field.key])}
                    onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.checked ? '1' : '0' }))}
                  />
                  <span className="text-xs font-semibold text-slate-700">{field.label}</span>
                </label>
              ) : field.kind === 'image' ? (
                <ImageInput value={values[field.key] || ''} onChange={(path) => setValues((prev) => ({ ...prev, [field.key]: path }))} />
              ) : field.kind === 'long' ? (
                <Textarea value={values[field.key] || ''} onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))} maxLength={10000} />
              ) : field.kind === 'color' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                    value={values[field.key] || '#f85606'}
                    onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  />
                  <Input value={values[field.key] || ''} onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))} maxLength={20} />
                </div>
              ) : (
                <Input value={values[field.key] || ''} onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))} maxLength={field.kind === 'text' ? 10000 : 255} />
              )}
            </Field>
          ))}

          <div className="flex justify-end border-t border-slate-100 pt-3">
            <Button type="submit" loading={save.isPending}>Save all settings</Button>
          </div>
        </form>

        <aside className="space-y-3">
          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">Brand preview</h2>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {logoPath ? (
                <img src={mediaUrl(logoPath) || ''} alt="Logo preview" className="h-10 w-10 rounded-lg object-contain ring-1 ring-slate-200" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">{(values.store_name || 'B').slice(0, 1)}</span>
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-800">{values.store_name || 'Marketplace'}</p>
                <p className="truncate text-[10px] text-slate-500">{values.tagline || 'Shop verified sellers'}</p>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Save settings to publish branding to the storefront. The browser tab title and favicon update from the public settings endpoint.</p>
          </div>

          <div className="card p-4 text-[11px] leading-relaxed text-slate-500">
            <h2 className="text-sm font-bold text-slate-900">Operational notes</h2>
            <p className="mt-1.5">Payment gateways are configured under <strong>Payment methods</strong>, SMS under <strong>SMS</strong>, email under <strong>Email center</strong>, and plugins under <strong>Plugins</strong>.</p>
            <p className="mt-1.5">Online card payments stay disabled until real SSLCommerz sandbox/live credentials are entered and verified. Manual wallet and QR numbers must be replaced before production.</p>
            <p className="mt-1.5">Email uses the database SMTP settings. The safe default is the log driver; configure SMTP and send a test message from the Email center before relying on password resets and order emails.</p>
            <p className="mt-1.5">Fonts load from Google Fonts with a system fallback. If the server has no outbound internet, the fallback stack keeps the storefront readable.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
