import type { AudioAsset } from '../types';
import imageCompression from 'browser-image-compression';

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

/**
 * Nome seguro para chave no Supabase Storage: sem acentos, parênteses ou caracteres especiais
 * (evita erro "Invalid key" em uploads vindos do celular / WhatsApp).
 */
export function sanitizeStorageFilename(originalName: string): string {
  const trimmed = originalName.trim() || 'file';
  const lastDot = trimmed.lastIndexOf('.');
  const hasExt = lastDot > 0 && lastDot < trimmed.length - 1;

  let ext = hasExt ? trimmed.slice(lastDot).toLowerCase() : '';
  ext = ext.replace(/[^a-z0-9.]+/g, '');
  if (ext && !ext.startsWith('.')) {
    ext = `.${ext}`;
  }
  if (ext.length > 14) {
    ext = ext.slice(0, 14);
  }
  if (ext !== '' && ext !== '.' && !/^\.[a-z0-9]{1,10}$/.test(ext)) {
    ext = '';
  }

  let base = hasExt ? trimmed.slice(0, lastDot) : trimmed;
  base = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .toLowerCase();

  if (!base) base = 'arquivo';

  const maxStem = 100;
  if (base.length > maxStem) {
    base = base.slice(0, maxStem).replace(/-+$/, '');
  }

  const out = ext ? `${base}${ext}` : base;
  return out || 'arquivo.bin';
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export async function compressImageFile(file: File): Promise<{ file: File; originalSize: number; compressedSize: number }> {
  const options = {
    maxSizeMB: 2, // Tenta reduzir para no máximo 2MB, ou o tamanho necessário para ~70% de redução
    maxWidthOrHeight: 3840, // 4K max
    useWebWorker: true,
    initialQuality: 0.85, // 85% de qualidade
    alwaysKeepResolution: true, // Mantém a resolução sempre que possível, mas redimensiona se for maior que 4K
    fileType: 'image/jpeg',
  };

  try {
    const compressedBlob = await imageCompression(file, options);
    const compressedFile = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    return {
      file: compressedFile.size >= file.size ? file : compressedFile,
      originalSize: file.size,
      compressedSize: compressedFile.size >= file.size ? file.size : compressedFile.size,
    };
  } catch (error) {
    console.error('Erro na compressão:', error);
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
    };
  }
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
      useMusic = voicePool.length > 0 ? false : true;
      continue;
    }

    if (!useMusic && voicePool.length > 0) {
      queue.push(voicePool.shift() as AudioAsset);
      useMusic = musicPool.length > 0 ? true : false;
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

export function validateImage(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error(`O arquivo ${file.name} excede o limite de 10MB.`));
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      reject(new Error(`O arquivo ${file.name} tem um formato inválido. Use JPG, PNG ou WebP.`));
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Suporta landscape (ex: 1280x720), portrait (ex: 720x1280) e quadrado (ex: 1080x1080)
      if (img.width < 400 || img.height < 400) {
        reject(new Error(`A imagem ${file.name} possui resolução muito baixa. O mínimo é 400px em ambos os lados.`));
        return;
      }
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`O arquivo ${file.name} está corrompido ou é inválido.`));
    };
    img.src = url;
  });
}

export function validateAudio(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    // 50MB limit
    if (file.size > 50 * 1024 * 1024) {
      reject(new Error(`O arquivo de áudio ${file.name} excede o limite de 50MB.`));
      return;
    }

    // Detecção automática de formato baseada no MIME Type.
    // O browser gerencia a decodificação via Web Audio API/HTML5 Audio (MPEG, MP3, WAV).
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'video/mp4'];
    
    // Fallback: se o SO/Browser não enviar mime-type, vamos confiar na extensão do arquivo e deixar
    // a tag <audio> falhar caso esteja corrompido
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['mp3', 'wav', 'mpeg', 'm4a', 'mp4'];
    
    if (file.type && !validTypes.includes(file.type)) {
      // Se tiver type mas nao for suportado, checamos a extensão como fallback
      if (!fileExt || !validExts.includes(fileExt)) {
        reject(new Error(`O formato do arquivo ${file.name} (${file.type}) não é suportado. Use MP3, WAV ou MPEG.`));
        return;
      }
    } else if (!file.type) {
      if (!fileExt || !validExts.includes(fileExt)) {
        reject(new Error(`O formato do arquivo ${file.name} não pôde ser identificado. Use MP3, WAV ou MPEG.`));
        return;
      }
    }

    const audio = new Audio();
    const url = URL.createObjectURL(file);
    
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      // Validar se o áudio tem pelo menos 1 segundo
      if (audio.duration < 1) {
        reject(new Error(`O arquivo de áudio ${file.name} é muito curto (mínimo de 1 segundo).`));
        return;
      }
      resolve();
    };
    
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`O arquivo de áudio ${file.name} está corrompido, vazio ou o codec não é suportado nativamente pelo navegador.`));
    };
    
    audio.src = url;
  });
}
