export const blobUrlCache = new Map<string, string>();
const fetchingMap = new Map<string, Promise<string>>();

/**
 * Baixa e armazena o áudio na Cache API do navegador e na memória (Blob URL).
 * Isso garante que o arquivo seja baixado do Supabase apenas UMA VEZ
 * por versão, economizando drasticamente a banda (Egress) do Supabase.
 */
export async function getCachedAudioUrl(url: string): Promise<string> {
  // Se já temos o blob URL em memória nesta sessão, reutiliza (evita IO)
  if (blobUrlCache.has(url)) {
    return blobUrlCache.get(url)!;
  }

  // Se já estamos baixando esta URL, aguarda a promise para não duplicar requests
  if (fetchingMap.has(url)) {
    return fetchingMap.get(url)!;
  }

  const promise = (async () => {
    try {
      // Tenta usar a Cache API do navegador (persistência em disco, ideal para TVs)
      if ('caches' in window) {
        const cache = await caches.open('menuboard-audio-cache-v1');
        const cachedResponse = await cache.match(url);
        
        if (cachedResponse) {
          console.log(`[Audio Cache] Servindo do cache em disco: ${url.substring(0, 50)}...`);
          const blob = await cachedResponse.blob();
          const blobUrl = URL.createObjectURL(blob);
          blobUrlCache.set(url, blobUrl);
          return blobUrl;
        }

        console.log(`[Audio Cache] Baixando e cacheando: ${url.substring(0, 50)}...`);
        const response = await fetch(url);
        if (response.ok) {
          // Armazena uma cópia no cache de disco
          await cache.put(url, response.clone());
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          blobUrlCache.set(url, blobUrl);
          return blobUrl;
        }
      } else {
        // Fallback para blob em memória (sem Cache API)
        const response = await fetch(url);
        if (response.ok) {
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          blobUrlCache.set(url, blobUrl);
          return blobUrl;
        }
      }
    } catch (error) {
      console.warn('[Audio Cache] Erro ao tentar cachear áudio, usando URL original da rede:', error);
    }
    
    // Fallback: retorna a URL original da rede se algo der errado com o fetch/blob
    return url;
  })();

  fetchingMap.set(url, promise);
  
  try {
    const finalUrl = await promise;
    return finalUrl;
  } finally {
    fetchingMap.delete(url);
  }
}

/**
 * Função opcional para limpar o cache se necessário.
 */
export async function clearAudioCache() {
  blobUrlCache.forEach(url => URL.revokeObjectURL(url));
  blobUrlCache.clear();
  if ('caches' in window) {
    await caches.delete('menuboard-audio-cache-v1');
  }
}
