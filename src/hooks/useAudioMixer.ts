import { useCallback, useEffect, useRef } from 'react';
import { AudioAsset, AudioSettings } from '../types';
import { getFileName, shuffleArray } from '../lib/utils';

export function useAudioMixer(music: AudioAsset[], voiceovers: AudioAsset[], settings: AudioSettings) {
  const musicPlayerRef = useRef<HTMLAudioElement | null>(null);
  const voicePlayerRef = useRef<HTMLAudioElement | null>(null);
  
  const musicQueueRef = useRef<AudioAsset[]>([]);
  const voiceQueueRef = useRef<AudioAsset[]>([]);
  
  // Estado estrito da fila sequencial
  const isPlayingRef = useRef(false);
  const failCountRef = useRef(0);

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
      // Inicia a locução correspondente após o fim da música
      void startVoiceover();
    };

    musicPlayer.onerror = () => {
      console.error(`[Audio Mixer] Erro na música: ${getFileName(nextMusic.file_url)}`);
      failCountRef.current++;
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
    } catch (err) {
      console.error('[Audio Mixer] Falha ao tentar reproduzir música:', err);
      failCountRef.current++;
      if (failCountRef.current < 5) {
        setTimeout(() => void playNextMusic(), 1000);
      }
    }
  }, [music, settings.musicBaseVolume]);

  const startVoiceover = useCallback(async () => {
    // Se não houver locuções, avança para a próxima música imediatamente
    if (voiceovers.length === 0) {
      void playNextMusic();
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

    const restoreMusic = () => {
      console.log(`[Audio Mixer] Locução finalizada. Retornando ao ciclo (Música)`);
      failCountRef.current = 0;
      void playNextMusic();
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
      if (failCountRef.current < 5) {
        restoreMusic();
      }
    }
  }, [voiceovers, settings.voiceoverVolume, playNextMusic]);

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
      if (musicPlayerRef.current) {
        musicPlayerRef.current.pause();
        musicPlayerRef.current.src = '';
      }
      if (voicePlayerRef.current) {
        voicePlayerRef.current.pause();
        voicePlayerRef.current.src = '';
      }
    };
  }, [music, voiceovers, playNextMusic]);

  return { musicPlayerRef, voicePlayerRef };
}
