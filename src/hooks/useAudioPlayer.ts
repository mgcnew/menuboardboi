import { useCallback, useEffect, useRef } from 'react';
import { AudioAsset } from '../types';
import { buildAlternatingAudioQueue, getFileName } from '../lib/utils';

export function useAudioPlayer(music: AudioAsset[], voiceovers: AudioAsset[]) {
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<AudioAsset[]>([]);
  const isPlayingRef = useRef(false);

  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current) {
      console.log('[Audio Player] Já existe um áudio em reprodução.');
      return;
    }

    if (music.length === 0 && voiceovers.length === 0) {
      console.log('[Audio Player] Nenhuma música ou locução disponível.');
      return;
    }

    if (queueRef.current.length === 0) {
      console.log('[Audio Player] Fila vazia. Construindo nova fila...');
      queueRef.current = buildAlternatingAudioQueue(music, voiceovers);
      console.log(`[Audio Player] Nova fila construída com ${queueRef.current.length} itens.`);
    }

    const nextAsset = queueRef.current.shift();
    if (!nextAsset) return;

    console.log(`[Audio Player] Preparando próximo áudio: ${getFileName(nextAsset.file_url)}`);

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio();
      console.log('[Audio Player] Novo elemento HTMLAudioElement criado.');
    }

    const player = audioPlayerRef.current;
    
    player.onended = null;
    player.onerror = null;
    player.ontimeupdate = null;

    player.src = nextAsset.file_url;
    player.volume = 1;

    player.onended = () => {
      console.log(`[Audio Player] Áudio concluído com sucesso: ${getFileName(nextAsset.file_url)}`);
      isPlayingRef.current = false;
      void playNextAudio();
    };

    player.onerror = () => {
      console.error(`[Audio Player] Erro ao reproduzir: ${getFileName(nextAsset.file_url)}`);
      isPlayingRef.current = false;
      setTimeout(() => {
        void playNextAudio();
      }, 1000);
    };

    let lastLoggedTime = 0;
    player.ontimeupdate = () => {
      const currentTime = Math.floor(player.currentTime);
      if (currentTime > 0 && currentTime % 10 === 0 && currentTime !== lastLoggedTime) {
        lastLoggedTime = currentTime;
        console.log(`[Audio Player] Progresso de reprodução: ${currentTime}s / ${Math.floor(player.duration)}s`);
      }
    };

    try {
      isPlayingRef.current = true;
      console.log(`[Audio Player] Iniciando reprodução de: ${getFileName(nextAsset.file_url)}`);
      await player.play();
    } catch (err) {
      console.error('[Audio Player] Falha ao tentar reproduzir áudio (autoplay block ou formato inválido):', err);
      isPlayingRef.current = false;
      setTimeout(() => {
        void playNextAudio();
      }, 1000);
    }
  }, [music, voiceovers]);

  useEffect(() => {
    console.log('[Audio Player] Listas de áudio atualizadas. Reiniciando player...');
    queueRef.current = [];
    isPlayingRef.current = false;
    
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = '';
    }

    if (music.length > 0 || voiceovers.length > 0) {
      void playNextAudio();
    }

    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = '';
      }
    };
  }, [music, voiceovers, playNextAudio]);

  return { audioPlayerRef, isPlayingRef, queueRef };
}
