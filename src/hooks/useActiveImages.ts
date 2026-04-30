import { useMemo } from 'react';
import type { ImageAsset } from '../types';

/**
 * Filtra a lista de imagens para retornar apenas as que estão configuradas
 * para serem exibidas no dia da semana atual.
 *
 * @param images Lista de imagens (assets)
 * @param currentDay Dia atual (0 = Domingo, 1 = Segunda, etc.)
 */
export function useActiveImages(images: ImageAsset[], currentDay: number) {
  return useMemo(() => {
    return images.filter(img => {
      // Se não tiver active_days definido, assume todos os dias (retrocompatibilidade)
      if (!img.active_days) {
        return true;
      }
      return img.active_days.includes(currentDay);
    });
  }, [images, currentDay]);
}