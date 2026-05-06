import { useState, useEffect, useCallback, useRef } from 'react';
import type { AudioSettings } from '../types';
import { updateCompanyAudioSettings } from '../lib/supabase';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicBaseVolume: 0.4,
  musicDuckedVolume: 0.1,
  voiceoverVolume: 1.0,
  duckingFadeOutTime: 0.5,
  duckingFadeInTime: 2.0,
  voiceoverIntervalMinutes: 3,
};

const STORAGE_KEYS: (keyof AudioSettings)[] = [
  'musicBaseVolume',
  'musicDuckedVolume',
  'voiceoverVolume',
  'duckingFadeOutTime',
  'duckingFadeInTime',
  'voiceoverIntervalMinutes',
];

function normalizeAudioPatch(raw: unknown): Partial<AudioSettings> | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: Partial<AudioSettings> = {};
  for (const key of STORAGE_KEYS) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export type UseAudioSettingsOptions = {
  /** Painel admin: mantém cópia no localStorage. TVs só usam dados do servidor. */
  persistLocal?: boolean;
};

export function useAudioSettings(
  companyId: string,
  serverPatch?: unknown,
  options?: UseAudioSettingsOptions,
) {
  const persistLocal = options?.persistLocal ?? false;
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS);
  const persistTimerRef = useRef<number | null>(null);

  const serverKey =
    serverPatch === undefined || serverPatch === null ? '' : JSON.stringify(serverPatch);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!companyId) return;

    let next: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };

    if (persistLocal) {
      const stored = localStorage.getItem(`tv-ads-audio-settings-${companyId}`);
      if (stored) {
        try {
          const parsed: unknown = JSON.parse(stored);
          const patch = normalizeAudioPatch(parsed);
          if (patch) next = { ...next, ...patch };
        } catch {
          /* ignore */
        }
      }
    }

    const fromServer = normalizeAudioPatch(serverPatch === undefined ? null : serverPatch);
    if (fromServer) {
      next = { ...next, ...fromServer };
    }

    setSettings(next);
  }, [companyId, persistLocal, serverKey]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const updateSettings = useCallback(
    (partial: Partial<AudioSettings>) => {
      if (!companyId) return;

      setSettings((prev) => {
        const updated = { ...prev, ...partial };

        if (persistLocal) {
          localStorage.setItem(`tv-ads-audio-settings-${companyId}`, JSON.stringify(updated));
          if (persistTimerRef.current !== null) {
            window.clearTimeout(persistTimerRef.current);
          }
          persistTimerRef.current = window.setTimeout(() => {
            persistTimerRef.current = null;
            void updateCompanyAudioSettings(companyId, updated).catch((err) => {
              console.error('Erro ao salvar mixagem no servidor:', err);
            });
          }, 550);
        }

        return updated;
      });
    },
    [companyId, persistLocal],
  );

  /** Cancela debounce e grava já (ex.: botão Salvar configurações). */
  const flushRemoteAudioSettings = useCallback(async () => {
    if (!companyId || !persistLocal) return;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    await updateCompanyAudioSettings(companyId, settingsRef.current);
  }, [companyId, persistLocal]);

  return { settings, updateSettings, flushRemoteAudioSettings };
}
