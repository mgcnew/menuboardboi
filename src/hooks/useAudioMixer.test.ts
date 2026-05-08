import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioMixer } from './useAudioMixer';
import { AudioAsset } from '../types';
import { DEFAULT_AUDIO_SETTINGS } from './useAudioSettings';

describe('useAudioMixer (Ducking System)', () => {
  let playMock: ReturnType<typeof vi.fn>;
  let pauseMock: ReturnType<typeof vi.fn>;

  // O intervalo padrão é 3 minutos (voiceoverIntervalMinutes: 3)
  const INTERVAL_MS = DEFAULT_AUDIO_SETTINGS.voiceoverIntervalMinutes * 60 * 1000; // 180_000

  beforeEach(() => {
    vi.useFakeTimers();

    playMock = vi.fn().mockResolvedValue(undefined);
    pauseMock = vi.fn();

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
    }

    vi.stubGlobal('Audio', MockAudio);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should play music continuously without ducking if no voiceovers', async () => {
    const music: AudioAsset[] = [
      { id: 'm1', file_url: 'm1.mp3', company_id: '1', file_path: '', created_at: '' }
    ];

    const { result } = renderHook(() => useAudioMixer(music, [], DEFAULT_AUDIO_SETTINGS));

    // Wait for the initial promise to resolve and timers to advance slightly
    await vi.advanceTimersByTimeAsync(1000);

    expect(playMock).toHaveBeenCalledTimes(1);
    
    const musicPlayer = result.current.musicPlayerRef.current as any;
    expect(musicPlayer.volume).toBe(DEFAULT_AUDIO_SETTINGS.musicBaseVolume);
    expect(musicPlayer.src).toContain('m1.mp3');

    // Simulate enough time to exceed the voiceover interval
    await vi.advanceTimersByTimeAsync(INTERVAL_MS + 1000);

    // Voiceover player should not be created or played (no voiceovers available)
    expect(result.current.voicePlayerRef.current).toBeNull();
    expect(musicPlayer.volume).toBe(DEFAULT_AUDIO_SETTINGS.musicBaseVolume); // volume unchanged

    musicPlayer.simulateEnd();
    await vi.advanceTimersByTimeAsync(1000);

    expect(playMock).toHaveBeenCalledTimes(2);
  });

  it('should play voiceover and duck music volume after the configured interval', async () => {
    const music: AudioAsset[] = [
      { id: 'm1', file_url: 'm1.mp3', company_id: '1', file_path: '', created_at: '' }
    ];
    const voiceovers: AudioAsset[] = [
      { id: 'v1', file_url: 'v1.mp3', company_id: '1', file_path: '', created_at: '' }
    ];

    const { result } = renderHook(() => useAudioMixer(music, voiceovers, DEFAULT_AUDIO_SETTINGS));

    await vi.advanceTimersByTimeAsync(1000);

    const musicPlayer = result.current.musicPlayerRef.current as any;
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(musicPlayer.src).toContain('m1.mp3');
    expect(musicPlayer.volume).toBe(DEFAULT_AUDIO_SETTINGS.musicBaseVolume);

    // Advance halfway — voiceover should NOT have triggered
    await vi.advanceTimersByTimeAsync(INTERVAL_MS / 2);
    expect(result.current.voicePlayerRef.current).toBeNull();

    // Advance to the interval — this triggers the voiceover cycle
    await vi.advanceTimersByTimeAsync(INTERVAL_MS / 2);

    // The mixer fades music volume first, then plays the voiceover
    // Advance past the fade-out duration so the voiceover starts
    await vi.advanceTimersByTimeAsync(DEFAULT_AUDIO_SETTINGS.duckingFadeOutTime * 1000 + 100);

    // Now voiceover should have started playing (after fade completed)
    const voicePlayer = result.current.voicePlayerRef.current as any;
    expect(voicePlayer).not.toBeNull();
    expect(playMock).toHaveBeenCalledTimes(2);
    expect(voicePlayer.src).toContain('v1.mp3');
    
    // Volume should be ducked now
    expect(musicPlayer.volume).toBeCloseTo(DEFAULT_AUDIO_SETTINGS.musicDuckedVolume, 1);

    // Voiceover ends
    voicePlayer.simulateEnd();
    
    // Check fade in
    await vi.advanceTimersByTimeAsync(DEFAULT_AUDIO_SETTINGS.duckingFadeInTime * 1000);
    
    // Music volume should be restored
    expect(musicPlayer.volume).toBeCloseTo(DEFAULT_AUDIO_SETTINGS.musicBaseVolume, 1);
  });

  it('should not count time towards voiceover when music is paused/ended', async () => {
    const music: AudioAsset[] = [
      { id: 'm1', file_url: 'm1.mp3', company_id: '1', file_path: '', created_at: '' }
    ];
    const voiceovers: AudioAsset[] = [
      { id: 'v1', file_url: 'v1.mp3', company_id: '1', file_path: '', created_at: '' }
    ];

    const { result } = renderHook(() => useAudioMixer(music, voiceovers, DEFAULT_AUDIO_SETTINGS));
    await vi.advanceTimersByTimeAsync(1000);

    const musicPlayer = result.current.musicPlayerRef.current as any;
    
    // Advance 50s
    await vi.advanceTimersByTimeAsync(50 * 1000); // total 51s active
    
    // Simulate music error, which pauses for 1s before retry
    act(() => {
      musicPlayer.simulateError(); 
    });
    
    // Advance 50 seconds. The error waits 1s, then music plays for 49s.
    // Total active time = 51s + 49s = 100s.
    await vi.advanceTimersByTimeAsync(50 * 1000);
    
    // Voiceover should NOT have started because active music time is only ~100s
    // (interval is 180s)
    expect(result.current.voicePlayerRef.current).toBeNull();
    
    // Now advance another 80s. Active time = ~100s + 80s = ~180s.
    await vi.advanceTimersByTimeAsync(80 * 1000);

    // Allow fade to complete
    await vi.advanceTimersByTimeAsync(DEFAULT_AUDIO_SETTINGS.duckingFadeOutTime * 1000 + 100);
    
    // Now it should be triggered
    expect(result.current.voicePlayerRef.current).not.toBeNull();
  });

  it('should start new music at ducked volume when a track ends during voiceover', async () => {
    const music: AudioAsset[] = [
      { id: 'm1', file_url: 'm1.mp3', company_id: '1', file_path: '', created_at: '' },
      { id: 'm2', file_url: 'm2.mp3', company_id: '1', file_path: '', created_at: '' }
    ];
    const voiceovers: AudioAsset[] = [
      { id: 'v1', file_url: 'v1.mp3', company_id: '1', file_path: '', created_at: '' }
    ];

    const { result } = renderHook(() => useAudioMixer(music, voiceovers, DEFAULT_AUDIO_SETTINGS));
    await vi.advanceTimersByTimeAsync(1000);

    const musicPlayer = result.current.musicPlayerRef.current as any;

    // Advance to trigger voiceover
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(DEFAULT_AUDIO_SETTINGS.duckingFadeOutTime * 1000 + 100);

    // Voiceover should be playing
    expect(result.current.voicePlayerRef.current).not.toBeNull();
    
    // ★ CRITICAL TEST: Simulate music track ending while voiceover is active
    act(() => {
      musicPlayer.simulateEnd();
    });
    await vi.advanceTimersByTimeAsync(100);

    // The new music track should start with DUCKED volume (not full volume)
    expect(musicPlayer.volume).toBeCloseTo(DEFAULT_AUDIO_SETTINGS.musicDuckedVolume, 1);
  });
});
