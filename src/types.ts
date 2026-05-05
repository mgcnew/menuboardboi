export type Company = {
  id: string;
  name: string;
  access_code: string;
  image_duration_seconds: number;
  transition_type?: string;
  transition_duration_seconds?: number;
  image_fit_mode?: 'contain' | 'cover';
  ticker_text?: string;
  ticker_active?: boolean;
  created_at: string;
};

export type Player = {
  id: string;
  company_id: string;
  player_name: string;
  last_ping_at: string;
  current_media_name?: string;
  created_at: string;
};

export type UserRole = 'client' | 'master_admin' | 'admin_empresa' | 'editor' | 'visualizador';

export type Profile = {
  id: string;
  company_id: string | null;
  role: UserRole;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ImageAsset = {
  id: string;
  company_id: string;
  file_url: string;
  file_path: string;
  order_index: number;
  active_days?: number[]; // [0, 1, 2, 3, 4, 5, 6] onde 0 = Domingo
  created_at: string;
};

export type AudioAsset = {
  id: string;
  company_id: string;
  file_url: string;
  file_path: string;
  created_at: string;
};

export type VideoAsset = {
  id: string;
  company_id: string;
  file_url: string;
  file_path: string;
  order_index: number;
  active_days?: number[];
  created_at: string;
};

export type MediaKind = 'music' | 'voiceovers' | 'videos';

export type AudioSettings = {
  musicBaseVolume: number; // 0.0 to 1.0
  musicDuckedVolume: number; // 0.0 to 1.0
  voiceoverVolume: number; // 0.0 to 1.0
  duckingFadeOutTime: number; // seconds (time to reduce volume)
  duckingFadeInTime: number; // seconds (time to restore volume)
  voiceoverIntervalMinutes: number; // minutes between voiceovers
};

export type CompanyUsage = {
  id: string;
  company_id: string;
  monthly_images_uploaded: number;
  monthly_storage_bytes: number;
  billing_cycle_month: number;
  billing_cycle_year: number;
  created_at: string;
};

// ==========================================
// WHATSAPP MODULE TYPES
// ==========================================

export type WhatsAppBanner = {
  id: string;
  company_id: string;
  name: string;
  file_url: string;
  file_size: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type WhatsAppPostTemplate = {
  id: string;
  company_id: string;
  name: string;
  message_text: string;
  category?: string | null;
  is_status_template: boolean;
  default_banner_id?: string | null;
  created_at: string;
};

export type WhatsAppContact = {
  id: string;
  company_id: string;
  name: string;
  phone_numbers: string[];
  segment?: string | null;
  last_purchase_at?: string | null;
  total_purchases: number;
  total_spent: number;
  last_contact_at?: string | null;
  has_opted_out: boolean;
  opted_out_at?: string | null;
  created_at: string;
};

export type WhatsAppPostStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export type WhatsAppApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

export type WhatsAppPost = {
  id: string;
  company_id: string;
  banner_id?: string | null;
  template_id?: string | null;
  message_text?: string | null;
  recipient_ids: string[];
  scheduled_at?: string | null;
  status: WhatsAppPostStatus;
  sent_at?: string | null;
  recipient_count: number;
  approval_status: WhatsAppApprovalStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppCredentials = {
  id: string;
  company_id: string;
  provider: string;
  api_key: string;
  instance_id?: string | null;
  phone_number?: string | null;
  is_active: boolean;
  created_at: string;
};

// ==========================================
// NOVOS TIPOS - MELHORIAS PROPOSTAS
// ==========================================

export type WhatsAppStatusSchedule = {
  id: string;
  company_id: string;
  name: string;
  time_slots: string[];
  active_days: number[];
  frequency: 'daily' | 'weekly' | 'monthly';
  max_posts_per_day: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type WhatsAppPostMetric = {
  id: string;
  post_id: string;
  views_count: number;
  avg_view_duration_seconds?: number | null;
  clicks_count: number;
  replies_count: number;
  unique_viewers_count: number;
  collected_at: string;
};

export type WhatsAppContactTag = {
  id: string;
  contact_id: string;
  tag: string;
  created_at: string;
};

export type WhatsAppFrequencyRule = {
  id: string;
  company_id: string;
  name: string;
  max_messages_per_day: number;
  max_messages_per_week: number;
  max_messages_per_month: number;
  is_active: boolean;
  created_at: string;
};

export type WhatsAppMessageType = 'status' | 'promotional' | 'transactional';

export type WhatsAppContactMessageLog = {
  id: string;
  contact_id: string;
  post_id: string;
  sent_at: string;
  message_type: WhatsAppMessageType;
};

export type WhatsAppABTestStatus = 'draft' | 'running' | 'paused' | 'completed';

export type WhatsAppABTest = {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  status: WhatsAppABTestStatus;
  start_at?: string | null;
  end_at?: string | null;
  winner_variant_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppABTestVariant = {
  id: string;
  test_id: string;
  name: string;
  banner_id?: string | null;
  template_id?: string | null;
  traffic_percentage: number;
  is_control: boolean;
  created_at: string;
};

export type WhatsAppABTestResult = {
  id: string;
  test_id: string;
  variant_id: string;
  sent_count: number;
  views_count: number;
  clicks_count: number;
  conversions_count: number;
  collected_at: string;
};
