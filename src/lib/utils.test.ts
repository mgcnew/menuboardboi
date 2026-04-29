import { describe, it, expect } from 'vitest';
import { buildAlternatingAudioQueue } from './utils';
import type { AudioAsset } from '../types';

describe('buildAlternatingAudioQueue', () => {
  it('should alternate between music and voiceovers', () => {
    const music: AudioAsset[] = [
      { id: 'm1', file_url: 'm1.mp3', company_id: '1', file_path: '', created_at: '' },
      { id: 'm2', file_url: 'm2.mp3', company_id: '1', file_path: '', created_at: '' }
    ];
    const voiceovers: AudioAsset[] = [
      { id: 'v1', file_url: 'v1.mp3', company_id: '1', file_path: '', created_at: '' },
      { id: 'v2', file_url: 'v2.mp3', company_id: '1', file_path: '', created_at: '' }
    ];

    const queue = buildAlternatingAudioQueue(music, voiceovers);
    
    expect(queue.length).toBe(4);
    
    const isVoice = (id: string) => id.startsWith('v');
    
    // Como a fila pode começar com música ou não e tem shuffle,
    // o mais importante é que não existam duas locuções seguidas.
    let voiceCount = 0;
    let consecutiveVoices = false;

    for (let i = 0; i < queue.length; i++) {
      if (isVoice(queue[i].id)) {
        voiceCount++;
        if (i > 0 && isVoice(queue[i - 1].id)) {
          consecutiveVoices = true;
        }
      }
    }

    expect(voiceCount).toBe(2);
    expect(consecutiveVoices).toBe(false);
  });

  it('should handle empty voiceovers gracefully', () => {
    const music: AudioAsset[] = [
      { id: 'm1', file_url: 'm1.mp3', company_id: '1', file_path: '', created_at: '' }
    ];
    const voiceovers: AudioAsset[] = [];

    const queue = buildAlternatingAudioQueue(music, voiceovers);
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe('m1');
  });

  it('should exhaust the larger array at the end', () => {
    const music: AudioAsset[] = [
      { id: 'm1', file_url: 'm1.mp3', company_id: '1', file_path: '', created_at: '' },
      { id: 'm2', file_url: 'm2.mp3', company_id: '1', file_path: '', created_at: '' },
      { id: 'm3', file_url: 'm3.mp3', company_id: '1', file_path: '', created_at: '' }
    ];
    const voiceovers: AudioAsset[] = [
      { id: 'v1', file_url: 'v1.mp3', company_id: '1', file_path: '', created_at: '' }
    ];

    const queue = buildAlternatingAudioQueue(music, voiceovers);
    expect(queue.length).toBe(4);
    
    const isVoice = (id: string) => id.startsWith('v');

    let voiceCount = 0;
    for (const item of queue) {
      if (isVoice(item.id)) voiceCount++;
    }

    expect(voiceCount).toBe(1);
  });
});