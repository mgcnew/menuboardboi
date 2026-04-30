import { useState, useEffect, useCallback } from 'react';
import type { AudioSettings } from '../types';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicBaseVolume: 0.4, // 40%
  musicDuckedVolume: 0.1, // 10%
  voiceoverVolume: 1.0, // 100%
  duckingFadeOutTime: 0.5, // 0.5s to duck
  duckingFadeInTime: 2.0, // 2s to restore
  voiceoverIntervalMinutes: 3, // 3 minutes
};

export function useAudioSettings(companyId: string) {
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS);

  useEffect(() => {
    if (!companyId) return;
    
    const key = `tv-ads-audio-settings-${companyId}`;
    const stored = localStorage.getItem(key);
    
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<AudioSettings>;
        setSettings({ ...DEFAULT_AUDIO_SETTINGS, ...parsed });
      } catch (err) {
        console.error('Failed to parse audio settings:', err);
        setSettings(DEFAULT_AUDIO_SETTINGS);
      }
    } else {
      setSettings(DEFAULT_AUDIO_SETTINGS);
    }
  }, [companyId]);

  const updateSettings = useCallback((newSettings: Partial<AudioSettings>) => {
    if (!companyId) return;

    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(`tv-ads-audio-settings-${companyId}`, JSON.stringify(updated));
      return updated;
    });
  }, [companyId]);

  return { settings, updateSettings };
}
