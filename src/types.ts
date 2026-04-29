export type Company = {
  id: string;
  name: string;
  image_duration_seconds: number;
  created_at: string;
};

export type ImageAsset = {
  id: string;
  company_id: string;
  file_url: string;
  file_path: string;
  order_index: number;
  created_at: string;
};

export type AudioAsset = {
  id: string;
  company_id: string;
  file_url: string;
  file_path: string;
  created_at: string;
};

export type MediaKind = 'music' | 'voiceovers';
