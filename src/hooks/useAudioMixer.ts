import { useCallback, useEffect, useRef } from 'react';
import { AudioAsset, AudioSettings } from '../types';
import { getFileName, shuffleArray } from '../lib/utils';
import { getCachedAudioUrl } from '../lib/audioCache';

/**
 * ─────────────────────────────────────────────────────────────
 * useAudioMixer — Sistema robusto de reprodução de música
 *                 contínua com ducking para locuções.
 * ─────────────────────────────────────────────────────────────
 *
 * ARQUITETURA:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ Música toca CONTINUAMENTE em loop infinito              │
 *   │ (uma faixa termina → próxima faixa começa)              │
 *   │                                                         │
 *   │ Um timer conta tempo de música.                         │
 *   │ Ao atingir o intervalo configurado:                     │
 *   │   1. Marca estado de ducking (isVoiceoverPlayingRef)    │
 *   │   2. Inicia fade-out da música                          │
 *   │   3. Após o fade, inicia a locução                      │
 *   │   4. Locução termina → fade-in da música                │
 *   │   5. Timer reinicia contagem                            │
 *   └─────────────────────────────────────────────────────────┘
 *
 * INVARIANTES CRÍTICAS:
 *   - A música NUNCA é pausada, apenas tem volume ajustado.
 *   - Quando a locução está ativa, QUALQUER nova faixa de
 *     música deve iniciar com volume ducked.
 *   - O estado de ducking (isVoiceoverPlayingRef) é a fonte
 *     de verdade para o volume da música a qualquer momento.
 * ─────────────────────────────────────────────────────────────
 */
export function useAudioMixer(music: AudioAsset[], voiceovers: AudioAsset[], settings: AudioSettings) {
  // ── Refs estáveis (não causam re-render) ──────────────────
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const musicRef = useRef(music);
  musicRef.current = music;

  const voiceoversRef = useRef(voiceovers);
  voiceoversRef.current = voiceovers;

  const musicPlayerRef = useRef<HTMLAudioElement | null>(null);
  const voicePlayerRef = useRef<HTMLAudioElement | null>(null);

  const musicQueueRef = useRef<AudioAsset[]>([]);
  const voiceQueueRef = useRef<AudioAsset[]>([]);

  const volumeFadeIntervalRef = useRef<number | null>(null);
  const voiceoverTickerRef = useRef<number | null>(null);
  const voiceoverDelayTimerRef = useRef<number | null>(null);

  const elapsedMusicMsRef = useRef(0);
  const isVoiceoverPlayingRef = useRef(false);
  const isInitializedRef = useRef(false);
  const failCountRef = useRef(0);
  const isMusicPlayingRef = useRef(false);

  // ── Utilitários de fade ───────────────────────────────────

  const clearVolumeFade = useCallback(() => {
    if (volumeFadeIntervalRef.current !== null) {
      window.clearInterval(volumeFadeIntervalRef.current);
      volumeFadeIntervalRef.current = null;
    }
  }, []);

  const clearVoiceoverDelay = useCallback(() => {
    if (voiceoverDelayTimerRef.current !== null) {
      window.clearTimeout(voiceoverDelayTimerRef.current);
      voiceoverDelayTimerRef.current = null;
    }
  }, []);

  /**
   * Fade suave do volume da música para um valor alvo.
   * Chama onComplete quando o fade termina.
   */
  const fadeMusicVolume = useCallback((targetVolume: number, durationSeconds: number, onComplete?: () => void) => {
    const player = musicPlayerRef.current;
    if (!player) {
      onComplete?.();
      return;
    }

    clearVolumeFade();

    if (durationSeconds <= 0) {
      player.volume = Math.max(0, Math.min(1, targetVolume));
      onComplete?.();
      return;
    }

    const startVolume = player.volume;
    const clampedTarget = Math.max(0, Math.min(1, targetVolume));
    const stepMs = 50;
    const totalSteps = Math.max(1, Math.ceil((durationSeconds * 1000) / stepMs));
    let step = 0;

    volumeFadeIntervalRef.current = window.setInterval(() => {
      step += 1;
      const progress = Math.min(step / totalSteps, 1);
      player.volume = startVolume + (clampedTarget - startVolume) * progress;

      if (progress >= 1) {
        clearVolumeFade();
        onComplete?.();
      }
    }, stepMs);
  }, [clearVolumeFade]);

  // ── Controle da música ────────────────────────────────────

  /**
   * Resolve o volume correto para a música baseado no estado atual.
   * Esta é a ÚNICA fonte de verdade para decidir o volume ao trocar faixas.
   */
  const getCurrentMusicVolume = useCallback(() => {
    return isVoiceoverPlayingRef.current
      ? settingsRef.current.musicDuckedVolume
      : settingsRef.current.musicBaseVolume;
  }, []);

  /**
   * Inicia a próxima faixa de música.
   * RESPEITA o estado de ducking: se a locução está ativa,
   * a nova faixa inicia com volume reduzido.
   */
  const playNextMusic = useCallback(async () => {
    const currentMusic = musicRef.current;
    if (currentMusic.length === 0) return;

    if (musicQueueRef.current.length === 0) {
      musicQueueRef.current = shuffleArray([...currentMusic]);
    }
    const nextMusic = musicQueueRef.current.shift();
    if (!nextMusic) return;

    if (!musicPlayerRef.current) {
      musicPlayerRef.current = new Audio();
    }
    const musicPlayer = musicPlayerRef.current;

    // Limpa handlers antigos para evitar fantasmas
    musicPlayer.onended = null;
    musicPlayer.onerror = null;

    try {
      const cachedUrl = await getCachedAudioUrl(nextMusic.file_url);
      musicPlayer.src = cachedUrl;
    } catch (err) {
      console.warn('[Audio Mixer] Erro no cache da música, usando url original.', err);
      musicPlayer.src = nextMusic.file_url;
    }

    // ★ CORREÇÃO PRINCIPAL: Volume inicial respeita estado de ducking
    musicPlayer.volume = getCurrentMusicVolume();

    musicPlayer.onended = () => {
      console.log(`[Audio Mixer] Música finalizada: ${getFileName(nextMusic.file_url)}`);
      failCountRef.current = 0;
      isMusicPlayingRef.current = false;
      // A próxima música vai respeitar o ducking automaticamente
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
      // Marca como playing ANTES do await para que o ticker detecte imediatamente
      isMusicPlayingRef.current = true;
      console.log(
        `[Audio Mixer] Iniciando música: ${getFileName(nextMusic.file_url)} (vol: ${musicPlayer.volume.toFixed(2)}, ducking: ${isVoiceoverPlayingRef.current})`
      );
      await musicPlayer.play();
    } catch (err) {
      console.error('[Audio Mixer] Falha ao tentar reproduzir música:', err);
      failCountRef.current++;
      isMusicPlayingRef.current = false;
      if (failCountRef.current < 5) {
        setTimeout(() => void playNextMusic(), 1000);
      }
    }
  }, [getCurrentMusicVolume]);

  // ── Controle de locução ───────────────────────────────────

  /**
   * Efetivamente toca a locução (chamado APÓS o fade-out da música).
   */
  const playVoiceoverTrack = useCallback(async (voiceAsset: AudioAsset) => {
    if (!voicePlayerRef.current) {
      voicePlayerRef.current = new Audio();
    }
    const voicePlayer = voicePlayerRef.current;

    // Limpa handlers antigos
    voicePlayer.onended = null;
    voicePlayer.onerror = null;

    const s = settingsRef.current;
    
    try {
      const cachedUrl = await getCachedAudioUrl(voiceAsset.file_url);
      voicePlayer.src = cachedUrl;
    } catch (err) {
      console.warn('[Audio Mixer] Erro no cache da locução, usando url original.', err);
      voicePlayer.src = voiceAsset.file_url;
    }
    
    voicePlayer.volume = s.voiceoverVolume;

    const restoreMusic = () => {
      console.log('[Audio Mixer] Locução finalizada. Restaurando volume da música.');
      isVoiceoverPlayingRef.current = false;
      failCountRef.current = 0;

      // Restaura volume gradualmente
      const currentSettings = settingsRef.current;
      fadeMusicVolume(currentSettings.musicBaseVolume, currentSettings.duckingFadeInTime);

      // Reinicia o contador para o próximo ciclo
      elapsedMusicMsRef.current = 0;
    };

    voicePlayer.onended = restoreMusic;

    voicePlayer.onerror = () => {
      console.error(`[Audio Mixer] Erro na locução: ${getFileName(voiceAsset.file_url)}`);
      failCountRef.current++;
      if (failCountRef.current < 5) {
        restoreMusic();
      } else {
        console.error('[Audio Mixer] Loop de falhas evitado na locução.');
        isVoiceoverPlayingRef.current = false;
        elapsedMusicMsRef.current = 0;
      }
    };

    console.log(`[Audio Mixer] Tocando locução: ${getFileName(voiceAsset.file_url)}`);
    voicePlayer.play().catch((err) => {
      console.error('[Audio Mixer] Falha ao tocar locução:', err);
      failCountRef.current++;
      isVoiceoverPlayingRef.current = false;
      elapsedMusicMsRef.current = 0;

      // Restaura volume da música já que a locução falhou
      const currentSettings = settingsRef.current;
      fadeMusicVolume(currentSettings.musicBaseVolume, currentSettings.duckingFadeInTime);
    });
  }, [fadeMusicVolume]);

  /**
   * Inicia o ciclo de locução:
   *   1. Marca ducking (para que qualquer troca de música respeite volume baixo)
   *   2. Fade out da música para volume ducked
   *   3. Após o fade completar, toca a locução
   *   4. Ao terminar, fade in da música de volta
   */
  const startVoiceover = useCallback(() => {
    // Guard: evita sobreposição de locuções
    if (isVoiceoverPlayingRef.current) {
      console.log('[Audio Mixer] Locução já em andamento — ignorando.');
      return;
    }

    const currentVoiceovers = voiceoversRef.current;
    if (currentVoiceovers.length === 0) return;

    if (voiceQueueRef.current.length === 0) {
      voiceQueueRef.current = shuffleArray([...currentVoiceovers]);
    }
    const nextVoice = voiceQueueRef.current.shift();
    if (!nextVoice) return;

    // ★ MARCAR DUCKING ANTES de começar o fade
    // Isso garante que qualquer troca de música durante o fade
    // já respeitará o volume reduzido.
    isVoiceoverPlayingRef.current = true;
    console.log('[Audio Mixer] Iniciando ducking da música...');

    const s = settingsRef.current;

    // Fade out da música, e quando terminar, tocar a locução
    fadeMusicVolume(s.musicDuckedVolume, s.duckingFadeOutTime, () => {
      // Callback: fade completou, agora inicia a locução
      void playVoiceoverTrack(nextVoice);
    });
  }, [fadeMusicVolume, playVoiceoverTrack]);

  // ── Ticker: conta tempo e dispara locução ─────────────────

  // Ref estável para a função de voiceover (evita recriação do ticker)
  const startVoiceoverRef = useRef(startVoiceover);
  useEffect(() => {
    startVoiceoverRef.current = startVoiceover;
  }, [startVoiceover]);

  const startVoiceoverTicker = useCallback(() => {
    if (voiceoverTickerRef.current !== null) return;

    console.log('[Audio Mixer] Ticker de locução iniciado.');
    voiceoverTickerRef.current = window.setInterval(() => {
      // Não conta tempo se:
      // - Música não está tocando
      // - Locução já está ativa
      if (!isMusicPlayingRef.current || isVoiceoverPlayingRef.current) return;

      const intervalMs = Math.max(1, settingsRef.current.voiceoverIntervalMinutes) * 60 * 1000;
      elapsedMusicMsRef.current += 1000;

      if (elapsedMusicMsRef.current >= intervalMs) {
        console.log(`[Audio Mixer] Intervalo atingido (${settingsRef.current.voiceoverIntervalMinutes}min). Disparando locução.`);
        elapsedMusicMsRef.current = 0;
        startVoiceoverRef.current();
      }
    }, 1000);
  }, []);

  const stopVoiceoverTicker = useCallback(() => {
    if (voiceoverTickerRef.current !== null) {
      window.clearInterval(voiceoverTickerRef.current);
      voiceoverTickerRef.current = null;
    }
  }, []);

  // ── Sincronização de volume em tempo real ─────────────────
  // Quando o admin altera os volumes via painel, atualiza em tempo real
  // MAS só se NÃO houver um fade ativo (para não conflitar).

  useEffect(() => {
    // Se há um fade em andamento, não interfere
    if (volumeFadeIntervalRef.current !== null) return;

    const musicPlayer = musicPlayerRef.current;
    const voicePlayer = voicePlayerRef.current;

    if (musicPlayer) {
      musicPlayer.volume = isVoiceoverPlayingRef.current
        ? settings.musicDuckedVolume
        : settings.musicBaseVolume;
    }
    if (voicePlayer) {
      voicePlayer.volume = settings.voiceoverVolume;
    }
  }, [settings.musicBaseVolume, settings.musicDuckedVolume, settings.voiceoverVolume]);

  // ── Inicialização e cleanup ───────────────────────────────

  useEffect(() => {
    // Evita reinicialização desnecessária se já está tocando
    if (isInitializedRef.current && isMusicPlayingRef.current) {
      console.log('[Audio Mixer] Assets atualizados — fila será renovada no próximo ciclo.');
      return;
    }

    console.log('[Audio Mixer] Inicializando sistema de áudio...');
    isInitializedRef.current = true;

    if (music.length > 0) {
      failCountRef.current = 0;
      elapsedMusicMsRef.current = 0;
      void playNextMusic();
      startVoiceoverTicker();
    }

    return () => {
      console.log('[Audio Mixer] Desmontando sistema de áudio.');
      isInitializedRef.current = false;
      isMusicPlayingRef.current = false;
      isVoiceoverPlayingRef.current = false;
      elapsedMusicMsRef.current = 0;
      stopVoiceoverTicker();
      clearVolumeFade();
      clearVoiceoverDelay();
      if (musicPlayerRef.current) {
        musicPlayerRef.current.pause();
        musicPlayerRef.current.src = '';
      }
      if (voicePlayerRef.current) {
        voicePlayerRef.current.pause();
        voicePlayerRef.current.src = '';
      }
    };
    // ★ Dependências MÍNIMAS: só reinicializa quando os assets mudam de verdade,
    // NÃO quando settings mudam (settings são lidos via ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [music, voiceovers]);

  return { musicPlayerRef, voicePlayerRef };
}
