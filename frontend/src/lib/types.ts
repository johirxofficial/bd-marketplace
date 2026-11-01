export type User = {
  id: number
  name: string
  email: string
  phone?: string | null
  status: string
  role?: string
  role_label?: string
  permissions?: string[]
  avatar_path?: string | null
  avatar_url?: string | null
  seller_profile?: SellerProfile | null
  customer_profile?: { date_of_birth?: string | null; gender?: string | null } | null
  created_at?: string
}

export type ChatUser = {
  id: number
  name: string
  email: string
  role?: string
  role_label?: string
  avatar_url?: string | null
}

export type ChatMessage = {
  id: number
  body: string
  sender_id: number
  sender_name?: string
  mine: boolean
  created_at: string
}

export type Conversation = {
  id: number
  other_user: ChatUser | null
  participants: ChatUser[]
  last_message: ChatMessage | null
  last_message_at?: string | null
  unread_count: number
}

export type SellerProfile = {
  id: number
  business_name: string
  business_type?: string
  phone?: string
  status: string
  commission_rate?: string
  rejection_reason?: string | null
  store?: Store | null
}

export type Store = {
  id: number
  name: string
  slug: string
  description?: string | null
  status?: string
  logo_path?: string | null
  banner_path?: string | null
  rating_avg?: number | string
  rating_count?: number
}

export type Variant = {
  id: number
  name: string
  sku: string
  price: string
  effective_price?: string
  compare_at_price?: string | null
  stock: number
  is_active?: boolean
  weight_grams?: number
}

export type ProductImage = { id: number; path: string; url: string; alt_text?: string; is_primary?: boolean }

export type Product = {
  id: number
  name: string
  slug: string
  sku?: string
  short_description?: string | null
  description?: string
  image_url: string
  images?: ProductImage[]
  price: string
  effective_price: string
  compare_at_price?: string | null
  discount_percent?: number
  rating_avg: number | string
  rating_count: number
  sold_count?: number
  stock?: number
  in_stock?: boolean
  status?: string
  status_label?: string
  status_tone?: string
  rejection_reason?: string | null
  is_featured?: boolean
  store?: { id: number; name: string; slug: string; description?: string; logo_path?: string; rating_avg?: number; rating_count?: number; status?: string }
  category?: { id: number; name: string; slug: string }
  brand?: { id: number; name: string; slug: string } | null
  variants?: Variant[]
  specifications?: Record<string, string> | { name: string; value: string }[]
  attributes?: { name: string; values: string[] }[]
  review_summary?: { average: number; count: number; breakdown: Record<string, number> } | null
}

export type Category = {
  id: number
  parent_id?: number | null
  name: string
  slug: string
  icon?: string | null
  is_active?: boolean
  sort_order?: number
  children?: Category[]
  products_count?: number
}

export type Address = {
  id: number
  label: string
  recipient_name: string
  phone: string
  division: string
  district: string
  upazila?: string
  area?: string
  street_address: string
  postal_code?: string
  is_default: boolean
}

export type Coupon = {
  id: number
  code: string
  description?: string
  type: 'percent' | 'fixed'
  value: string
  min_order_amount?: string
  max_discount?: string | null
  starts_at?: string | null
  expires_at?: string | null
  usage_limit?: number | null
  used_count?: number
  per_user_limit?: number
  applies_to?: string
  scope_id?: number | null
  is_active: boolean
}

export type OrderItem = {
  id: number
  seller_order_id?: number
  product_id?: number
  variant_id?: number
  product_name: string
  variant_name: string
  sku: string
  unit_price: string
  quantity: number
  discount_amount?: string
  line_total: string
  image_url?: string | null
  can_review?: boolean
  return_requested?: boolean
}

export type Shipment = {
  id: number
  courier_name: string
  tracking_number?: string | null
  status: string
  shipped_at?: string | null
  delivered_at?: string | null
  events?: { status: string; location?: string; note?: string; happened_at?: string }[]
}

export type SellerOrder = {
  id: number
  order_id?: number
  order_number?: string
  store?: { id: number; name: string }
  status: string
  status_label: string
  status_tone?: string
  customer?: string
  customer_phone?: string | null
  payment_status?: string
  items_count?: number
  subtotal: string
  discount_total?: string
  shipping_total?: string
  commission_rate?: string
  commission_amount?: string
  seller_payable?: string
  placed_at?: string
  items?: OrderItem[]
  shipments?: Shipment[]
  shipping_address?: Record<string, string>
  customer_note?: string | null
  commission?: { rate: string; amount: string; status: string }
}

export type PaymentTransaction = {
  id: number
  provider?: string
  method_code?: string | null
  method_name?: string | null
  type: string
  amount: string
  status: string
  collected_at?: string | null
  submitted_at?: string | null
  reference?: string | null
}

export type PaymentMethod = {
  code: string
  name: string
  provider: string
  type: 'cod' | 'mfs' | 'qr' | 'hosted' | string
  mode?: string
  description?: string | null
  instructions?: string | null
  fee_amount: string
  fee_percent: string
  min_amount?: string | number | null
  max_amount?: string | number | null
  requires_verification: boolean
  config: Record<string, string | boolean | null>
}

export type OrderPayment = {
  code: string
  name: string
  type: string
  instructions?: string | null
  config: Record<string, string | null>
  requires_verification: boolean
  transaction: {
    id: number
    status: string
    reference?: string | null
    submitted_at?: string | null
    metadata?: Record<string, any> | null
  } | null
  qr_payload?: string | null
  redirect_url?: string
  transaction_id?: number
  tran_id?: string
}

export type Order = {
  id: number
  order_number: string
  status: string
  status_label: string
  status_tone?: string
  payment_status: string
  payment_status_label: string
  payment_status_tone?: string
  payment_method: string
  payment_method_name?: string
  payment_fee?: string
  payment?: OrderPayment
  subtotal: string
  discount_total: string
  shipping_total: string
  tax_total: string
  grand_total: string
  coupon_code?: string | null
  shipping_address: Record<string, string>
  customer_note?: string | null
  placed_at?: string
  delivered_at?: string
  cancelled_at?: string
  cancel_reason?: string
  paid_at?: string | null
  customer?: { id: number; name: string; email: string; phone?: string }
  items?: OrderItem[]
  seller_orders?: SellerOrder[]
  status_history?: { from_status?: string; to_status: string; actor_type: string; actor?: string; note?: string; created_at?: string }[]
  returns?: { id: number; return_number: string; status: string; status_label: string; quantity: number; refund_amount: string; reason: string; created_at?: string }[]
  payment_transactions?: PaymentTransaction[]
  receipt?: {
    number: string
    type: string
    type_label: string
    amount: string
    currency: string
    issued_at?: string | null
    url: string
  } | null
}

export type Paginator<T> = {
  current_page: number
  data: T[]
  last_page: number
  total: number
  per_page?: number
}
