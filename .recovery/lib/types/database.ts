export type UserRole = 'guest' | 'celebrant' | 'vendor' | 'merchant'
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'ended'
export type TicketStatus = 'reserved' | 'paid' | 'refunded' | 'cancelled' | 'checked_in'
export type PaymentStatus = 'pending' | 'processing' | 'success' | 'failed' | 'settled'
export type PaymentKind = 'ticket' | 'deposit' | 'withdrawal'
export type BuTxType =
  | 'deposit'
  | 'spray'
  | 'purchase'
  | 'ticket_purchase'
  | 'withdrawal'
  | 'spray_credit'
  | 'refund'
export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying'

export interface Profile {
  id: string
  role: UserRole
  display_name: string
  username: string | null
  phone: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Wallet {
  id: string
  user_id: string
  bu_balance: number
  naira_available: number
  created_at: string
  updated_at: string
}

export interface EventRecord {
  id: string
  organizer_id: string | null
  merchant_id: string | null
  title: string
  slug: string
  description: string | null
  venue_name: string | null
  venue_lat: number | null
  venue_lng: number | null
  start_time: string
  end_time: string | null
  cover_image_url: string | null
  status: EventStatus
  is_gateway_event: boolean
  paystack_subaccount_code: string | null
  commission_rate: number
  spray_budget_bu: number
  celebrant_name: string | null
  celebrant_wallet_id: string | null
  capacity: number | null
  created_at: string
  updated_at: string
}

export interface TicketTier {
  id: string
  event_id: string
  name: string
  price: number
  currency: string
  quantity_total: number
  quantity_sold: number
  sales_start: string | null
  sales_end: string | null
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  reference: string
  paystack_reference: string | null
  user_id: string | null
  merchant_id: string | null
  event_id: string | null
  kind: PaymentKind
  amount: number
  currency: string
  status: PaymentStatus
  buyer_email: string
  buyer_name: string | null
  buyer_phone: string | null
  callback_url: string | null
  authorization_url: string | null
  metadata: PaymentMetadata
  fulfilled_at: string | null
  created_at: string
  updated_at: string
}

export interface PaymentMetadata {
  kind?: PaymentKind
  ticket_tier_id?: string
  quantity?: number
  spray_bu_amount?: number
  event_id?: string
  user_id?: string
  merchant_id?: string
  buyer_name?: string
  buyer_phone?: string
  custom?: Record<string, unknown>
}

export interface TicketRecord {
  id: string
  event_id: string
  tier_id: string
  payment_id: string | null
  buyer_user_id: string | null
  buyer_email: string
  buyer_name: string | null
  buyer_phone: string | null
  amount_paid: number
  status: TicketStatus
  qr_code_data: string | null
  checkin_code: string | null
  checked_in_at: string | null
  checked_in_by: string | null
  reserved_until: string | null
  created_at: string
  updated_at: string
}

export interface GatewayMerchant {
  id: string
  user_id: string | null
  business_name: string
  email: string
  public_key: string
  secret_key_prefix: string
  secret_key_hash: string
  webhook_url: string | null
  webhook_secret: string | null
  bank_account_name: string | null
  bank_account_number_encrypted: string | null
  bank_code: string | null
  paystack_subaccount_code: string | null
  settlement_schedule: string
  cors_origins: string[]
  commission_rate: number
  is_verified: boolean
  created_at: string
  updated_at: string
}

export interface EventWithTiers extends EventRecord {
  ticket_tiers: TicketTier[]
  organizer?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}

export interface CheckinResult {
  status: 'valid' | 'checked_in' | 'already_used' | 'invalid' | 'refunded'
  ticket?: TicketRecord
  message: string
}
