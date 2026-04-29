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

export function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export async function compressImage(file: File, quality = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // Maximum dimensions for a TV (e.g., 4K)
        const MAX_WIDTH = 3840;
        const MAX_HEIGHT = 2160;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            // If the compressed file is larger, return the original
            if (blob.size >= file.size) {
              resolve(file);
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
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

/**
 * Comprime uma imagem no lado do cliente usando um canvas HTML.
 */
export async function compressImage(file: File, quality = 0.8): Promise<{ file: File; originalSize: number; compressedSize: number }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('O arquivo não é uma imagem válida.'));
    }

    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Canvas não suportado no navegador atual.'));
      }

      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            return reject(new Error('Falha ao gerar blob da imagem.'));
          }
          
          const safeName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
          const compressedFile = new File([blob], safeName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          
          resolve({
            file: compressedFile,
            originalSize: file.size,
            compressedSize: compressedFile.size,
          });
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => reject(new Error('Não foi possível ler o arquivo de imagem.'));
  });
}

/**
 * Formata um valor de bytes para uma string legível (KB, MB, etc).
 */
export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
