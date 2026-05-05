import { useCallback, useEffect, useRef } from 'react';
import { AudioAsset, AudioSettings } from '../types';
import { getFileName, shuffleArray } from '../lib/utils';

export function useAudioMixer(music: AudioAsset[], voiceovers: AudioAsset[], settings: AudioSettings) {
  const musicPlayerRef = useRef<HTMLAudioElement | null>(null);
  const voicePlayerRef = useRef<HTMLAudioElement | null>(null);
  
  const musicQueueRef = useRef<AudioAsset[]>([]);
  const voiceQueueRef = useRef<AudioAsset[]>([]);
  const volumeFadeIntervalRef = useRef<number | null>(null);
  const voiceoverTickerRef = useRef<number | null>(null);
  const startVoiceoverRef = useRef<() => void>(() => {});
  const elapsedMusicMsRef = useRef(0);
  const isVoiceoverPlayingRef = useRef(false);
  
  // Estado estrito da fila sequencial
  const isPlayingRef = useRef(false);
  const isMusicPlayingRef = useRef(false);
  const failCountRef = useRef(0);

  const clearVolumeFade = useCallback(() => {
    if (volumeFadeIntervalRef.current !== null) {
      window.clearInterval(volumeFadeIntervalRef.current);
      volumeFadeIntervalRef.current = null;
    }
  }, []);

  const fadeMusicVolume = useCallback((targetVolume: number, durationSeconds: number) => {
    const player = musicPlayerRef.current;
    if (!player) return;

    clearVolumeFade();

    if (durationSeconds <= 0) {
      player.volume = targetVolume;
      return;
    }

    const startVolume = player.volume;
    const stepMs = 50;
    const totalSteps = Math.max(1, Math.ceil((durationSeconds * 1000) / stepMs));
    let step = 0;

    volumeFadeIntervalRef.current = window.setInterval(() => {
      step += 1;
      const progress = Math.min(step / totalSteps, 1);
      player.volume = startVolume + (targetVolume - startVolume) * progress;

      if (progress >= 1) {
        clearVolumeFade();
      }
    }, stepMs);
  }, [clearVolumeFade]);

  const startVoiceoverTicker = useCallback(() => {
    if (voiceoverTickerRef.current !== null) return;

    voiceoverTickerRef.current = window.setInterval(() => {
      if (!isMusicPlayingRef.current || isVoiceoverPlayingRef.current) return;

      const intervalMs = Math.max(1, settings.voiceoverIntervalMinutes) * 60 * 1000;
      elapsedMusicMsRef.current += 1000;
      if (elapsedMusicMsRef.current < intervalMs) return;

      elapsedMusicMsRef.current = 0;
      startVoiceoverRef.current();
    }, 1000);
  }, [settings.voiceoverIntervalMinutes]);

  const stopVoiceoverTicker = useCallback(() => {
    if (voiceoverTickerRef.current !== null) {
      window.clearInterval(voiceoverTickerRef.current);
      voiceoverTickerRef.current = null;
    }
  }, []);

  const playNextMusic = useCallback(async () => {
    if (music.length === 0) return;

    if (musicQueueRef.current.length === 0) {
      musicQueueRef.current = shuffleArray([...music]);
    }
    const nextMusic = musicQueueRef.current.shift();
    if (!nextMusic) return;

    if (!musicPlayerRef.current) {
      musicPlayerRef.current = new Audio();
    }
    const musicPlayer = musicPlayerRef.current;

    musicPlayer.src = nextMusic.file_url;
    musicPlayer.volume = settings.musicBaseVolume;
    musicPlayer.onended = null;
    musicPlayer.onerror = null;

    musicPlayer.onended = () => {
      console.log(`[Audio Mixer] Música finalizada: ${getFileName(nextMusic.file_url)}`);
      failCountRef.current = 0;
      isMusicPlayingRef.current = false;
      void playNextMusic();
    };

    musicPlayer.onerror = () => {
      console.error(`[Audio Mixer] Erro na música: ${getFileName(nextMusic.file_url)}`);
      failCountRef.current++;
      isMusicPlayingRef.current = false;
      if (failCountRef.current < 5) {
        setTimeout(() => void playNextMusic(), 1000);
      } else {
        console.error('[Audio Mixer] Loop de falhas evitado na música.');
      }
    };

    try {
      console.log(`[Audio Mixer] Iniciando música: ${getFileName(nextMusic.file_url)}`);
      await musicPlayer.play();
      isPlayingRef.current = true;
      isMusicPlayingRef.current = true;
      startVoiceoverTicker();
    } catch (err) {
      console.error('[Audio Mixer] Falha ao tentar reproduzir música:', err);
      failCountRef.current++;
      isMusicPlayingRef.current = false;
      if (failCountRef.current < 5) {
        setTimeout(() => void playNextMusic(), 1000);
      }
    }
  }, [music, settings.musicBaseVolume, startVoiceoverTicker]);

  const startVoiceover = useCallback(async () => {
    if (isVoiceoverPlayingRef.current) return;

    // Se não houver locuções, avança para a próxima música imediatamente
    if (voiceovers.length === 0) {
      return;
    }

    if (voiceQueueRef.current.length === 0) {
      voiceQueueRef.current = shuffleArray([...voiceovers]);
    }
    const nextVoice = voiceQueueRef.current.shift();
    if (!nextVoice) {
      void playNextMusic();
      return;
    }

    if (!voicePlayerRef.current) {
      voicePlayerRef.current = new Audio();
    }
    const voicePlayer = voicePlayerRef.current;
    
    voicePlayer.src = nextVoice.file_url;
    voicePlayer.volume = settings.voiceoverVolume;

    voicePlayer.onended = null;
    voicePlayer.onerror = null;

    isVoiceoverPlayingRef.current = true;
    fadeMusicVolume(settings.musicDuckedVolume, settings.duckingFadeOutTime);

    const restoreMusic = () => {
      console.log('[Audio Mixer] Locução finalizada. Restaurando volume da música.');
      isVoiceoverPlayingRef.current = false;
      failCountRef.current = 0;
      fadeMusicVolume(settings.musicBaseVolume, settings.duckingFadeInTime);
    };

    voicePlayer.onended = restoreMusic;
    
    voicePlayer.onerror = () => {
      console.error(`[Audio Mixer] Erro na locução: ${getFileName(nextVoice.file_url)}`);
      failCountRef.current++;
      if (failCountRef.current < 5) {
        restoreMusic();
      } else {
         console.error('[Audio Mixer] Loop de falhas evitado na locução.');
      }
    };

    try {
      console.log(`[Audio Mixer] Iniciando locução: ${getFileName(nextVoice.file_url)}`);
      await voicePlayer.play();
    } catch (err) {
      console.error('[Audio Mixer] Falha ao tocar locução:', err);
      failCountRef.current++;
      isVoiceoverPlayingRef.current = false;
      fadeMusicVolume(settings.musicBaseVolume, settings.duckingFadeInTime);
      if (failCountRef.current < 5) {
        // Mantém ciclo de música e aguarda próximo intervalo para nova tentativa.
      }
    }
  }, [
    voiceovers,
    settings.voiceoverVolume,
    settings.musicDuckedVolume,
    settings.musicBaseVolume,
    settings.duckingFadeOutTime,
    settings.duckingFadeInTime,
    fadeMusicVolume
  ]);

  useEffect(() => {
    startVoiceoverRef.current = () => {
      void startVoiceover();
    };
  }, [startVoiceover]);

  // Efeito de inicialização estrita: Começa o ciclo (Música)
  useEffect(() => {
    console.log('[Audio Mixer] Inicializando sistema de áudio sequencial...');
    
    if (!isPlayingRef.current) {
      if (music.length > 0) {
        failCountRef.current = 0;
        void playNextMusic();
      }
    }

    return () => {
      isPlayingRef.current = false;
      isMusicPlayingRef.current = false;
      isVoiceoverPlayingRef.current = false;
      stopVoiceoverTicker();
      clearVolumeFade();
      if (musicPlayerRef.current) {
        musicPlayerRef.current.pause();
        musicPlayerRef.current.src = '';
      }
      if (voicePlayerRef.current) {
        voicePlayerRef.current.pause();
        voicePlayerRef.current.src = '';
      }
    };
  }, [music, voiceovers, playNextMusic, stopVoiceoverTicker, clearVolumeFade]);

  return { musicPlayerRef, voicePlayerRef };
}
