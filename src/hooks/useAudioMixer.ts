import { useCallback, useEffect, useRef } from 'react';
import { AudioAsset, AudioSettings } from '../types';
import { getFileName, shuffleArray } from '../lib/utils';

/**
 * Função utilitária para transição suave de volume (Fade In / Fade Out)
 * Usa setInterval para funcionar mesmo com a aba em background.
 */
function fadeVolume(
  player: HTMLAudioElement,
  targetVolume: number,
  durationMs: number,
  onComplete?: () => void
) {
  if ((player as any)._fadeInterval) {
    clearInterval((player as any)._fadeInterval);
  }

  const startVolume = player.volume;
  const startTime = Date.now();

  if (durationMs <= 0) {
    player.volume = targetVolume;
    if (onComplete) onComplete();
    return;
  }

  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    
    // Interpolação linear
    player.volume = startVolume + (targetVolume - startVolume) * progress;

    if (progress >= 1) {
      clearInterval(interval);
      delete (player as any)._fadeInterval;
      if (onComplete) onComplete();
    }
  }, 50);

  (player as any)._fadeInterval = interval;
}

export function useAudioMixer(music: AudioAsset[], voiceovers: AudioAsset[], settings: AudioSettings) {
  const musicPlayerRef = useRef<HTMLAudioElement | null>(null);
  const voicePlayerRef = useRef<HTMLAudioElement | null>(null);
  
  const musicQueueRef = useRef<AudioAsset[]>([]);
  const voiceQueueRef = useRef<AudioAsset[]>([]);
  
  // Controle de estado
  const isMusicPlayingRef = useRef(false);
  const isVoiceoverActiveRef = useRef(false);
  
  // Timer de reprodução de música (em milissegundos)
  const musicPlaybackTimeMsRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);

  // Hardcoded para 120 segundos (2 minutos) conforme os requisitos,
  // ou pode usar settings.voiceoverIntervalMinutes * 60000.
  // Como o requisito pede "exatamente 2 minutos", vamos garantir isso.
  const VOICEOVER_TARGET_MS = 120 * 1000; 

  const startVoiceover = useCallback(async () => {
    if (voiceovers.length === 0) return;
    if (isVoiceoverActiveRef.current) return;

    if (voiceQueueRef.current.length === 0) {
      voiceQueueRef.current = shuffleArray([...voiceovers]);
    }
    const nextVoice = voiceQueueRef.current.shift();
    if (!nextVoice) return;

    isVoiceoverActiveRef.current = true;
    console.log(`[Audio Mixer] Iniciando locução: ${getFileName(nextVoice.file_url)}`);

    // Inicia ducking (redução do volume da música)
    if (musicPlayerRef.current && isMusicPlayingRef.current) {
      console.log(`[Audio Mixer] Reduzindo volume da música para ${settings.musicDuckedVolume * 100}% (Ducking)`);
      fadeVolume(
        musicPlayerRef.current,
        settings.musicDuckedVolume,
        settings.duckingFadeOutTime * 1000
      );
    }

    if (!voicePlayerRef.current) {
      voicePlayerRef.current = new Audio();
    }
    const voicePlayer = voicePlayerRef.current;
    
    voicePlayer.src = nextVoice.file_url;
    voicePlayer.volume = settings.voiceoverVolume;

    // Cleanup anterior
    voicePlayer.onended = null;
    voicePlayer.onerror = null;

    const restoreMusic = () => {
      isVoiceoverActiveRef.current = false;
      // Reseta o timer da música para contar os próximos 2 minutos
      musicPlaybackTimeMsRef.current = 0;
      
      console.log(`[Audio Mixer] Locução finalizada. Restaurando música para ${settings.musicBaseVolume * 100}%`);
      if (musicPlayerRef.current && isMusicPlayingRef.current) {
        fadeVolume(
          musicPlayerRef.current,
          settings.musicBaseVolume,
          settings.duckingFadeInTime * 1000
        );
      }
    };

    voicePlayer.onended = restoreMusic;
    voicePlayer.onerror = () => {
      console.error(`[Audio Mixer] Erro na locução: ${getFileName(nextVoice.file_url)}`);
      restoreMusic();
    };

    try {
      await voicePlayer.play();
    } catch (err) {
      console.error('[Audio Mixer] Falha ao tocar locução:', err);
      restoreMusic();
    }
  }, [voiceovers, settings]);

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
    
    // Se a locução estiver ativa, a música já começa com volume reduzido
    const targetVolume = isVoiceoverActiveRef.current ? settings.musicDuckedVolume : settings.musicBaseVolume;
    musicPlayer.volume = targetVolume;

    musicPlayer.onended = null;
    musicPlayer.onerror = null;

    musicPlayer.onended = () => {
      console.log(`[Audio Mixer] Música finalizada: ${getFileName(nextMusic.file_url)}`);
      isMusicPlayingRef.current = false;
      void playNextMusic();
    };

    musicPlayer.onerror = () => {
      console.error(`[Audio Mixer] Erro na música: ${getFileName(nextMusic.file_url)}`);
      isMusicPlayingRef.current = false;
      setTimeout(() => void playNextMusic(), 1000);
    };

    try {
      console.log(`[Audio Mixer] Iniciando música: ${getFileName(nextMusic.file_url)}`);
      await musicPlayer.play();
      isMusicPlayingRef.current = true;
    } catch (err) {
      console.error('[Audio Mixer] Falha ao tentar reproduzir música:', err);
      isMusicPlayingRef.current = false;
      setTimeout(() => void playNextMusic(), 1000);
    }
  }, [music, settings]);

  // Efeito principal: Controle de tempo de reprodução da música
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    timerIntervalRef.current = window.setInterval(() => {
      // Conta o tempo apenas se a música estiver tocando
      if (isMusicPlayingRef.current) {
        // Se locução NÃO estiver tocando, incrementa o tempo
        if (!isVoiceoverActiveRef.current) {
          musicPlaybackTimeMsRef.current += 100;

          // Se atingiu o alvo (120s), dispara locução
          if (musicPlaybackTimeMsRef.current >= VOICEOVER_TARGET_MS) {
            if (voiceovers.length > 0) {
              void startVoiceover();
            } else {
              // Sem locuções, apenas reseta o timer
              musicPlaybackTimeMsRef.current = 0;
            }
          }
        }
      }
    }, 100);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [startVoiceover, voiceovers.length]);

  // Efeito de inicialização: Tocar a primeira música
  useEffect(() => {
    console.log('[Audio Mixer] Inicializando sistema de áudio...');
    
    if (music.length > 0 && !isMusicPlayingRef.current) {
      void playNextMusic();
    } else if (music.length === 0) {
      if (musicPlayerRef.current) {
        musicPlayerRef.current.pause();
        isMusicPlayingRef.current = false;
      }
    }
  }, [music, playNextMusic]);

  // Efeito para sincronizar as mudanças de configuração (Settings) em tempo real
  useEffect(() => {
    if (musicPlayerRef.current) {
      const expectedVol = isVoiceoverActiveRef.current ? settings.musicDuckedVolume : settings.musicBaseVolume;
      // Ajuste brusco caso não haja transição em andamento
      if (!(musicPlayerRef.current as any)._fadeInterval) {
        musicPlayerRef.current.volume = expectedVol;
      }
    }
    if (voicePlayerRef.current) {
      voicePlayerRef.current.volume = settings.voiceoverVolume;
    }
  }, [settings.musicBaseVolume, settings.musicDuckedVolume, settings.voiceoverVolume]);

  // Cleanup na desmontagem
  useEffect(() => {
    return () => {
      if (musicPlayerRef.current) {
        musicPlayerRef.current.pause();
        if ((musicPlayerRef.current as any)._fadeInterval) {
          clearInterval((musicPlayerRef.current as any)._fadeInterval);
        }
      }
      if (voicePlayerRef.current) {
        voicePlayerRef.current.pause();
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      isMusicPlayingRef.current = false;
      isVoiceoverActiveRef.current = false;
    };
  }, []);

  return { musicPlayerRef, voicePlayerRef };
}
