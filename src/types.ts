export type Company = {
  id: string;
  name: string;
  access_code: string;
  image_duration_seconds: number;
  transition_type?: string;
  transition_duration_seconds?: number;
  created_at: string;
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

export type MediaKind = 'music' | 'voiceovers';

export type AudioSettings = {
  musicBaseVolume: number; // 0.0 to 1.0
  musicDuckedVolume: number; // 0.0 to 1.0
  voiceoverVolume: number; // 0.0 to 1.0
  duckingFadeOutTime: number; // seconds (time to reduce volume)
  duckingFadeInTime: number; // seconds (time to restore volume)
  voiceoverIntervalMinutes: number; // minutes between voiceovers
};
