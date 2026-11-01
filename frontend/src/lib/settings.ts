import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export type PublicPaymentMethod = {
  code: string
  name: string
  type: string
  logo_path?: string | null
}

export type PublicSettings = {
  store_name: string
  tagline: string
  store_logo_path?: string | null
  store_logo_url?: string | null
  store_favicon_path?: string | null
  store_favicon_url?: string | null
  announcement?: string
  footer_text?: string
  support_phone?: string
  support_email?: string
  support_hours?: string
  support_address?: string
  whatsapp_number?: string
  facebook_url?: string
  instagram_url?: string
  youtube_url?: string
  tiktok_url?: string
  linkedin_url?: string
  primary_color?: string
  secondary_color?: string
  font_family?: string
  heading_font_family?: string
  font_scale?: string
  content_width?: string
  card_radius?: string
  product_columns?: number
  sticky_header?: boolean
  show_announcement?: boolean
  newsletter_enabled?: boolean
  newsletter_title?: string
  newsletter_text?: string
  cod_enabled?: boolean
  tax_enabled?: boolean
  tax_percent?: string
  min_order_amount?: string
  free_shipping_note?: string
  currency?: string
  currency_symbol?: string
  return_policy?: string
  privacy_policy?: string
  terms_conditions?: string
  about?: string
  meta_title?: string
  meta_description?: string
  meta_keywords?: string
  maintenance_mode?: boolean
  maintenance_message?: string
  sms_enabled?: boolean
  payment_methods?: PublicPaymentMethod[]
}

export function usePublicSettings() {
  return useQuery({
    queryKey: ['public-settings'],
    queryFn: async () => (await api.get('/settings/public')).data.settings as PublicSettings,
    staleTime: 5 * 60 * 1000,
  })
}

export function mediaUrl(path?: string | null): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `/media/${path.replace(/^\/+/, '')}`
}

export const fontOptions = [
  { value: 'inter', label: 'Inter — clean and neutral', stack: "'Inter', system-ui, sans-serif" },
  { value: 'manrope', label: 'Manrope — modern and geometric', stack: "'Manrope', system-ui, sans-serif" },
  { value: 'plus-jakarta', label: 'Plus Jakarta Sans — friendly and bold', stack: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { value: 'dm-sans', label: 'DM Sans — soft and readable', stack: "'DM Sans', system-ui, sans-serif" },
  { value: 'sora', label: 'Sora — premium and distinctive', stack: "'Sora', system-ui, sans-serif" },
  { value: 'system', label: 'System font — fastest loading', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
] as const

export const fontScaleOptions = [
  { value: 'compact', label: 'Compact', px: '15px' },
  { value: 'comfortable', label: 'Comfortable', px: '16px' },
  { value: 'large', label: 'Large and accessible', px: '17.5px' },
] as const

export const contentWidthOptions = [
  { value: 'compact', label: 'Compact', px: '1080px' },
  { value: 'wide', label: 'Wide', px: '1280px' },
  { value: 'full', label: 'Full width', px: '1536px' },
] as const

export const radiusOptions = [
  { value: 'sharp', label: 'Sharp', px: '4px' },
  { value: 'soft', label: 'Soft', px: '12px' },
  { value: 'round', label: 'Rounded', px: '20px' },
] as const

function fontStack(value?: string): string {
  return (fontOptions.find((item) => item.value === value) || fontOptions[0]).stack
}

/**
 * Apply typography and layout preferences as CSS variables so the whole
 * storefront and portal react instantly without a rebuild.
 */
export function applyAppearance(settings?: PublicSettings | null): void {
  if (typeof document === 'undefined' || !settings) return

  const root = document.documentElement
  const scale = fontScaleOptions.find((item) => item.value === settings.font_scale) || fontScaleOptions[1]
  const width = contentWidthOptions.find((item) => item.value === settings.content_width) || contentWidthOptions[1]
  const radius = radiusOptions.find((item) => item.value === settings.card_radius) || radiusOptions[1]
  const columns = Math.min(5, Math.max(2, Number(settings.product_columns) || 4))

  root.style.setProperty('--font-body', fontStack(settings.font_family))
  root.style.setProperty('--font-heading', fontStack(settings.heading_font_family || settings.font_family))
  root.style.setProperty('--content-width', width.px)
  root.style.setProperty('--radius-card', radius.px)
  root.style.setProperty('--product-cols', String(columns))
  root.style.fontSize = scale.px
}


/**
 * Apply the administrator's primary colour as a generated Tailwind brand
 * palette. Values are stored as space-separated RGB channels so Tailwind's
 * opacity modifier (bg-brand-500/20) keeps working.
 */
export function applyBrandColor(value?: string | null): void {
  if (typeof document === 'undefined') return
  const hex = (value || '').trim()
  const match = hex.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return

  let raw = match[1]
  if (raw.length === 3) raw = raw.split('').map((char) => char + char).join('')
  const base = [0, 2, 4].map((index) => parseInt(raw.slice(index, index + 2), 16))
  const mix = (target: number, weight: number) =>
    base.map((channel) => Math.round(channel + (target - channel) * weight))

  const palette: Record<number, number[]> = {
    50: mix(255, 0.94),
    100: mix(255, 0.86),
    200: mix(255, 0.7),
    300: mix(255, 0.48),
    400: mix(255, 0.24),
    500: base,
    600: mix(0, 0.12),
    700: mix(0, 0.28),
    800: mix(0, 0.42),
    900: mix(0, 0.54),
  }

  // White text on a bright brand colour (e.g. #00ff88) is unreadable. Pick a
  // contrasting foreground once and expose it to the UI via CSS.
  const [red, green, blue] = base
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  const foreground = luminance > 0.6 ? '0 0 0' : '255 255 255'

  const root = document.documentElement
  Object.entries(palette).forEach(([shade, channels]) => {
    root.style.setProperty(`--brand-${shade}`, channels.join(' '))
  })
  root.style.setProperty('--brand-contrast', foreground)
}
