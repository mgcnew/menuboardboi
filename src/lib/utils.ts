import type { AudioAsset } from '../types';

export function shuffleArray<T>(items: T[]): T[] {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

export function getFileName(filePathOrUrl: string): string {
  const normalized = filePathOrUrl.split('?')[0] ?? filePathOrUrl;
  return normalized.split('/').pop() ?? filePathOrUrl;
}

export function buildAlternatingAudioQueue(
  musicItems: AudioAsset[],
  voiceItems: AudioAsset[],
): AudioAsset[] {
  const musicPool = shuffleArray(musicItems);
  const voicePool = shuffleArray(voiceItems);
  const queue: AudioAsset[] = [];
  let useMusic = musicPool.length > 0;

  while (musicPool.length > 0 || voicePool.length > 0) {
    if (useMusic && musicPool.length > 0) {
      queue.push(musicPool.shift() as AudioAsset);
      useMusic = voicePool.length > 0;
      continue;
    }

    if (!useMusic && voicePool.length > 0) {
      queue.push(voicePool.shift() as AudioAsset);
      useMusic = musicPool.length > 0;
      continue;
    }

    if (musicPool.length > 0) {
      queue.push(musicPool.shift() as AudioAsset);
      continue;
    }

    if (voicePool.length > 0) {
      queue.push(voicePool.shift() as AudioAsset);
    }
  }

  return queue;
}
