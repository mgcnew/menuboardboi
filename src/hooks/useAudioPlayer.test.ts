import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioPlayer } from './useAudioPlayer';
import { AudioAsset } from '../types';

describe('useAudioPlayer', () => {
  let playMock: ReturnType<typeof vi.fn>;
  let pauseMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    playMock = vi.fn().mockResolvedValue(undefined);
    pauseMock = vi.fn();

    // Mock HTMLAudioElement
    class MockAudio {
      play = playMock;
      pause = pauseMock;
      src = '';
      volume = 1;
      currentTime = 0;
      duration = 100;
      onended: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      ontimeupdate: (() => void) | null = null;

      simulateEnd() {
        if (this.onended) this.onended();
      }

      simulateError() {
        if (this.onerror) this.onerror(new Error('Simulated error'));
      }

      simulateTimeUpdate(time: number) {
        this.currentTime = time;
        if (this.ontimeupdate) this.ontimeupdate();
      }
    }

    vi.stubGlobal('Audio', MockAudio);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should not play if both music and voiceovers are empty', () => {
    const { result } = renderHook(() => useAudioPlayer([], []));
    
    expect(result.current.isPlayingRef.current).toBe(false);
    expect(playMock).not.toHaveBeenCalled();
  });

  it('should play the first audio in the queue when provided', async () => {
    const music: AudioAsset[] = [
      { id: 'm1', file_url: 'm1.mp3', company_id: '1', file_path: '', created_at: '' }
    ];

    const { result } = renderHook(() => useAudioPlayer(music, []));

    await vi.runAllTimersAsync();

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(result.current.isPlayingRef.current).toBe(true);
    expect(result.current.audioPlayerRef.current?.src).toBe('m1.mp3');
  });

  it('should play the next audio sequentially after onended', async () => {
    const music: AudioAsset[] = [
      { id: 'm1', file_url: 'm1.mp3', company_id: '1', file_path: '', created_at: '' },
      { id: 'm2', file_url: 'm2.mp3', company_id: '1', file_path: '', created_at: '' }
    ];

    const { result } = renderHook(() => useAudioPlayer(music, []));

    await vi.runAllTimersAsync();

    expect(playMock).toHaveBeenCalledTimes(1);
    const player = result.current.audioPlayerRef.current as any;
    const firstSrc = player.src;
    
    player.simulateEnd();

    await vi.runAllTimersAsync();

    expect(playMock).toHaveBeenCalledTimes(2);
    expect(player.src).not.toBe(firstSrc);
    expect(['m1.mp3', 'm2.mp3']).toContain(player.src);
  });

  it('should handle errors and try next track without entering an infinite synchronous loop', async () => {
    const music: AudioAsset[] = [
      { id: 'm1', file_url: 'm1.mp3', company_id: '1', file_path: '', created_at: '' },
      { id: 'm2', file_url: 'm2.mp3', company_id: '1', file_path: '', created_at: '' }
    ];

    const { result } = renderHook(() => useAudioPlayer(music, []));

    await vi.runAllTimersAsync();

    const player = result.current.audioPlayerRef.current as any;
    const firstSrc = player.src;
    
    player.simulateError();

    expect(result.current.isPlayingRef.current).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);

    expect(playMock).toHaveBeenCalledTimes(2);
    expect(player.src).not.toBe(firstSrc);
    expect(['m1.mp3', 'm2.mp3']).toContain(player.src);
  });

  it('should track progress correctly', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const music: AudioAsset[] = [
      { id: 'm1', file_url: 'm1.mp3', company_id: '1', file_path: '', created_at: '' }
    ];

    const { result } = renderHook(() => useAudioPlayer(music, []));

    await vi.runAllTimersAsync();

    const player = result.current.audioPlayerRef.current as any;
    
    // Simula 10 segundos
    player.simulateTimeUpdate(10);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Progresso de reprodução: 10s'));

    consoleSpy.mockRestore();
  });
});
