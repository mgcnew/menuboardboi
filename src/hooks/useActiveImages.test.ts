import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useActiveImages } from './useActiveImages';
import { ImageAsset } from '../types';

describe('useActiveImages', () => {
  const mockImages: ImageAsset[] = [
    { id: '1', company_id: '1', file_url: '1.jpg', file_path: '1.jpg', order_index: 0, created_at: '', active_days: [0, 1, 2, 3, 4, 5, 6] },
    { id: '2', company_id: '1', file_url: '2.jpg', file_path: '2.jpg', order_index: 1, created_at: '', active_days: [1, 3, 5] }, // Seg, Qua, Sex
    { id: '3', company_id: '1', file_url: '3.jpg', file_path: '3.jpg', order_index: 2, created_at: '', active_days: [0, 6] },    // Finais de semana
    { id: '4', company_id: '1', file_url: '4.jpg', file_path: '4.jpg', order_index: 3, created_at: '' }, // Sem active_days (retrocompatibilidade)
  ];

  it('deve exibir imagens de segunda-feira (dia 1)', () => {
    const { result } = renderHook(() => useActiveImages(mockImages, 1));
    expect(result.current).toHaveLength(3);
    expect(result.current.map(img => img.id)).toEqual(['1', '2', '4']);
  });

  it('deve exibir imagens de domingo (dia 0)', () => {
    const { result } = renderHook(() => useActiveImages(mockImages, 0));
    expect(result.current).toHaveLength(3);
    expect(result.current.map(img => img.id)).toEqual(['1', '3', '4']);
  });

  it('deve exibir imagens de terça-feira (dia 2)', () => {
    const { result } = renderHook(() => useActiveImages(mockImages, 2));
    expect(result.current).toHaveLength(2);
    expect(result.current.map(img => img.id)).toEqual(['1', '4']);
  });

  it('deve retornar array vazio se não houver imagens', () => {
    const { result } = renderHook(() => useActiveImages([], 1));
    expect(result.current).toHaveLength(0);
  });
});