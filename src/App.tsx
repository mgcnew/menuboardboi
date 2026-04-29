import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  createCompany,
  deleteAudio,
  deleteImage,
  isSupabaseConfigured,
  listAudio,
  listCompanies,
  listImages,
  reorderImages,
  updateCompanyDuration,
  uploadAudio,
  uploadImages,
} from './lib/supabase';
import { compressImage, formatBytes, buildAlternatingAudioQueue, getFileName } from './lib/utils';
import type { AudioAsset, Company, ImageAsset, MediaKind } from './types';

const COMPANY_STORAGE_KEY = 'tv-ads-player-company-id';

type LoadableAssets = {
  images: ImageAsset[];
  music: AudioAsset[];
  voiceovers: AudioAsset[];
};

/**
 * Lê o ID da empresa ativa da URL ou do LocalStorage.
 */
function readCompanyIdFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('company') ?? localStorage.getItem(COMPANY_STORAGE_KEY) ?? '';
}

/**
 * Constrói a URL para acessar o modo TV diretamente.
 */
function buildTvUrl(companyId: string) {
  const url = new URL('/tv', window.location.origin);
  url.searchParams.set('company', companyId);
  return url.toString();
}

/**
 * Reordena um item de um array movendo de um índice para outro.
 */
function moveItem(items: ImageAsset[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);

  if (!moved) {
    return items;
  }

  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Busca todos os assets (imagens, musicas, locucoes) de uma empresa.
 */
async function fetchAssets(companyId: string): Promise<LoadableAssets> {
  const [images, music, voiceovers] = await Promise.all([
    listImages(companyId),
    listAudio(companyId, 'music'),
    listAudio(companyId, 'voiceovers'),
  ]);

  return { images, music, voiceovers };
}

/**
 * Componente principal. Roteia para Modo TV ou Modo Configuração com base na URL.
 */
function App() {
  const isTvMode = window.location.pathname.startsWith('/tv');

  if (isTvMode) {
    return <TvMode />;
  }

  return <ConfigMode />;
}

/**
 * Modo Configuração: Interface principal administrativa.
 * Design acessível, semântico e com alta legibilidade (WCAG 2.1).
 */
type TabId = 'company' | 'images' | 'music' | 'voiceovers';

function ConfigMode() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(readCompanyIdFromUrl);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [music, setMusic] = useState<AudioAsset[]>([]);
  const [voiceovers, setVoiceovers] = useState<AudioAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [durationInput, setDurationInput] = useState('10');
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; message: string; stats?: { original: number; compressed: number } } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('company');
  
  // Delete confirmation state
  const [itemToDelete, setItemToDelete] = useState<{ kind: 'images' | MediaKind; asset: ImageAsset | AudioAsset } | null>(null);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  const refreshCompanies = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const data = await listCompanies();
    setCompanies(data);

    if (!selectedCompanyId && data[0]) {
      setSelectedCompanyId(data[0].id);
    }

    setLoading(false);
  }, [selectedCompanyId]);

  const refreshAssets = useCallback(async () => {
    if (!selectedCompanyId || !isSupabaseConfigured) {
      setImages([]);
      setMusic([]);
      setVoiceovers([]);
      return;
    }

    const assets = await fetchAssets(selectedCompanyId);
    setImages(assets.images);
    setMusic(assets.music);
    setVoiceovers(assets.voiceovers);
  }, [selectedCompanyId]);

  useEffect(() => {
    void refreshCompanies().catch((error: Error) => {
      setFeedback(error.message);
      setLoading(false);
    });
  }, [refreshCompanies]);

  useEffect(() => {
    if (selectedCompanyId) {
      localStorage.setItem(COMPANY_STORAGE_KEY, selectedCompanyId);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if (selectedCompany) {
      setDurationInput(String(selectedCompany.image_duration_seconds));
    }
  }, [selectedCompany]);

  useEffect(() => {
    void refreshAssets().catch((error: Error) => setFeedback(error.message));
  }, [refreshAssets]);

  // Limpa o feedback após 3 segundos
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handleCreateCompany = useCallback(async () => {
    if (!newCompanyName.trim()) {
      setFeedback('Informe o nome da empresa.');
      return;
    }

    setBusy(true);
    setFeedback('');

    try {
      const company = await createCompany(newCompanyName);
      setNewCompanyName('');
      await refreshCompanies();
      setSelectedCompanyId(company.id);
      setFeedback('Empresa criada com sucesso.');
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [newCompanyName, refreshCompanies]);

  const handleUpload = useCallback(
    async (files: FileList | null, kind: 'images' | MediaKind) => {
      if (!selectedCompanyId) {
        setFeedback('Selecione uma empresa antes de enviar arquivos.');
        return;
      }

      if (!files || files.length === 0) {
        return;
      }

      setBusy(true);
      setFeedback('');
      setUploadProgress({ current: 0, total: files.length, message: 'Iniciando upload...' });

      try {
        let fileArray = Array.from(files);
        let originalSize = 0;
        let compressedSize = 0;

        if (kind === 'images') {
          const processedFiles: File[] = [];
          for (let i = 0; i < fileArray.length; i++) {
            setUploadProgress({
              current: i,
              total: fileArray.length,
              message: `Comprimindo imagem ${i + 1} de ${fileArray.length}...`
            });
            const file = fileArray[i];
            originalSize += file.size;
            const compressed = await compressImage(file, 0.8);
            compressedSize += compressed.size;
            processedFiles.push(compressed);
          }
          fileArray = processedFiles;
          
          setUploadProgress({
            current: fileArray.length,
            total: fileArray.length,
            message: 'Fazendo upload...',
            stats: { original: originalSize, compressed: compressedSize }
          });
          
          await uploadImages(selectedCompanyId, fileArray);
          
          const savings = originalSize - compressedSize;
          const percent = ((savings / originalSize) * 100).toFixed(0);
          setFeedback(`Upload concluído! Redução de ${formatBytes(savings)} (${percent}%).`);
        } else {
          setUploadProgress({ current: 0, total: fileArray.length, message: 'Fazendo upload de áudio...' });
          await uploadAudio(selectedCompanyId, kind, fileArray);
          setFeedback('Upload de áudio concluído com sucesso.');
        }

        await refreshAssets();
      } catch (error) {
        setFeedback((error as Error).message);
      } finally {
        setBusy(false);
        setUploadProgress(null);
      }
    },
    [refreshAssets, selectedCompanyId],
  );

  const confirmDelete = useCallback(async () => {
    if (!itemToDelete) return;
    
    setBusy(true);
    setFeedback('');

    try {
      if (itemToDelete.kind === 'images') {
        await deleteImage(itemToDelete.asset as ImageAsset);
      } else {
        await deleteAudio(itemToDelete.kind, itemToDelete.asset as AudioAsset);
      }
      await refreshAssets();
      setFeedback('Item removido com sucesso.');
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
      setItemToDelete(null);
    }
  }, [itemToDelete, refreshAssets]);

  const handleMoveImage = useCallback(
    async (fromIndex: number, direction: -1 | 1) => {
      const toIndex = fromIndex + direction;

      if (toIndex < 0 || toIndex >= images.length || !selectedCompanyId) {
        return;
      }

      const reordered = moveItem(images, fromIndex, toIndex);
      setImages(reordered);
      setBusy(true);
      setFeedback('');

      try {
        await reorderImages(selectedCompanyId, reordered);
        await refreshAssets();
      } catch (error) {
        setFeedback((error as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [images, refreshAssets, selectedCompanyId],
  );

  const isDurationValid = Number.isFinite(Number(durationInput)) && Number(durationInput) >= 3;

  const handleSaveDuration = useCallback(async () => {
    if (!selectedCompanyId) {
      return;
    }

    if (!isDurationValid) {
      setFeedback('Use um intervalo de pelo menos 3 segundos.');
      return;
    }

    setBusy(true);
    setFeedback('');

    try {
      await updateCompanyDuration(selectedCompanyId, Math.floor(Number(durationInput)));
      await refreshCompanies();
      setFeedback('Configurações salvas com sucesso.');
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [durationInput, isDurationValid, refreshCompanies, selectedCompanyId]);

  const previewImageIndex = previewImage ? images.findIndex((img) => img.file_url === previewImage) : -1;

  const handleNextPreview = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (previewImageIndex >= 0 && previewImageIndex < images.length - 1) {
      setPreviewImage(images[previewImageIndex + 1].file_url);
    }
  }, [images, previewImageIndex]);

  const handlePrevPreview = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (previewImageIndex > 0) {
      setPreviewImage(images[previewImageIndex - 1].file_url);
    }
  }, [images, previewImageIndex]);

  useEffect(() => {
    if (!previewImage) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewImage(null);
      if (e.key === 'ArrowRight') handleNextPreview();
      if (e.key === 'ArrowLeft') handlePrevPreview();
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleNextPreview, handlePrevPreview, previewImage]);

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <span className="eyebrow">Painel Administrativo</span>
          <h1>TV Ads Player</h1>
          <p>
            Gerencie o conteúdo de mídia e controle as configurações de exibição de forma centralizada.
          </p>
        </div>
        {selectedCompanyId ? (
          <a
            className="primary-link"
            href={buildTvUrl(selectedCompanyId)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir modo TV para a empresa ${selectedCompany?.name ?? ''}`}
          >
            Iniciar Exibição TV
          </a>
        ) : null}
      </header>

      {!isSupabaseConfigured ? (
        <section className="panel warning" aria-live="polite">
          <h2>Supabase não configurado</h2>
          <p>
            As credenciais do banco de dados não foram detectadas. Por favor, preencha o arquivo <code>.env</code>.
          </p>
        </section>
      ) : null}

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>Painel</span> / <span>{selectedCompany ? selectedCompany.name : 'Selecionar Empresa'}</span> / 
        <span>
          {activeTab === 'company' && ' Configurações'}
          {activeTab === 'images' && ' Fotos Promocionais'}
          {activeTab === 'music' && ' Trilha Sonora'}
          {activeTab === 'voiceovers' && ' Locuções'}
        </span>
      </nav>

      <div role="tablist" className="tabs-list" aria-label="Navegação Principal">
        <button
          role="tab"
          className="tab-button"
          aria-selected={activeTab === 'company'}
          aria-controls="panel-company"
          id="tab-company"
          onClick={() => setActiveTab('company')}
        >
          Empresa
        </button>
        <button
          role="tab"
          className="tab-button"
          aria-selected={activeTab === 'images'}
          aria-controls="panel-images"
          id="tab-images"
          onClick={() => setActiveTab('images')}
          disabled={!selectedCompanyId}
        >
          Fotos
        </button>
        <button
          role="tab"
          className="tab-button"
          aria-selected={activeTab === 'music'}
          aria-controls="panel-music"
          id="tab-music"
          onClick={() => setActiveTab('music')}
          disabled={!selectedCompanyId}
        >
          Músicas
        </button>
        <button
          role="tab"
          className="tab-button"
          aria-selected={activeTab === 'voiceovers'}
          aria-controls="panel-voiceovers"
          id="tab-voiceovers"
          onClick={() => setActiveTab('voiceovers')}
          disabled={!selectedCompanyId}
        >
          Locuções
        </button>
      </div>

      <main>
        {/* Aba: Configurações da Empresa */}
        <section
          id="panel-company"
          role="tabpanel"
          aria-labelledby="tab-company"
          className="tab-panel panel"
          hidden={activeTab !== 'company'}
        >
          <header className="section-header">
            <div>
              <h2>Configurações da Empresa</h2>
              <p>Gerencie o tenant ativo e configurações globais de exibição.</p>
            </div>
            {loading ? <span className="tag" aria-live="polite">Carregando...</span> : null}
          </header>

          <div className="form-grid">
            <label>
              Empresa ativa
              <select
                value={selectedCompanyId}
                onChange={(event) => setSelectedCompanyId(event.target.value)}
                disabled={busy || companies.length === 0}
                aria-label="Selecionar empresa ativa"
              >
                <option value="">Selecione uma empresa</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Criar nova empresa
              <div className="inline-group">
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(event) => setNewCompanyName(event.target.value)}
                  placeholder="Ex: Unidade Centro"
                  disabled={busy}
                  aria-label="Nome da nova empresa"
                />
                <button
                  type="button"
                  onClick={() => void handleCreateCompany()}
                  disabled={busy || !newCompanyName.trim()}
                >
                  Adicionar
                </button>
              </div>
            </label>
          </div>

          {selectedCompany ? (
            <div className="form-grid compact">
              <label>
                Duração de cada imagem (segundos)
                <div className="inline-group">
                  <input
                    type="number"
                    min="3"
                    value={durationInput}
                    onChange={(event) => setDurationInput(event.target.value)}
                    disabled={busy}
                    aria-label="Segundos de exibição por imagem"
                    aria-invalid={!isDurationValid}
                  />
                  <button type="button" onClick={() => void handleSaveDuration()} disabled={busy || !isDurationValid}>
                    Salvar
                  </button>
                </div>
                {!isDurationValid && (
                  <span style={{ color: 'var(--text-danger)', fontSize: '0.8rem' }}>Mínimo de 3 segundos.</span>
                )}
              </label>
              <label>
                URL direta do Player
                <input
                  type="text"
                  readOnly
                  value={buildTvUrl(selectedCompany.id)}
                  aria-label="URL de acesso direto ao player desta empresa"
                  onClick={(e) => e.currentTarget.select()}
                />
              </label>
            </div>
          ) : null}
        </section>

        {/* Aba: Fotos */}
        <section
          id="panel-images"
          role="tabpanel"
          aria-labelledby="tab-images"
          className="tab-panel"
          hidden={activeTab !== 'images'}
        >
          <MediaSection
            title="Fotos Promocionais"
            description="Arquivos de imagem exibidos em sequência. Ordene conforme desejado."
            accept="image/*"
            multiple
            onUpload={(files) => void handleUpload(files, 'images')}
            disabled={!selectedCompanyId || busy}
            isUploading={busy}
            uploadProgress={uploadProgress}
          >
            <ul className="image-grid" aria-label="Lista de Imagens">
              {images.map((image, index) => (
                <li key={image.id} className="image-card">
                  <img 
                    className="image-card-thumb" 
                    src={image.file_url} 
                    alt={`Preview da imagem ${index + 1}`} 
                    loading="lazy" 
                    onClick={() => setPreviewImage(image.file_url)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setPreviewImage(image.file_url)}
                    aria-label="Abrir preview em tela cheia"
                  />
                  <div className="image-card-content">
                    <div className="image-card-info">
                      <strong>{getFileName(image.file_url)}</strong>
                      <span>Ordem de exibição: {index + 1}</span>
                    </div>
                    <div className="image-card-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void handleMoveImage(index, -1)}
                        disabled={busy || index === 0}
                        aria-label="Mover para cima"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void handleMoveImage(index, 1)}
                        disabled={busy || index === images.length - 1}
                        aria-label="Mover para baixo"
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => setItemToDelete({ kind: 'images', asset: image })}
                        disabled={busy}
                        aria-label="Excluir imagem"
                      >
                        X
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {images.length === 0 ? <EmptyState text="Nenhuma imagem enviada para esta empresa." /> : null}
          </MediaSection>
        </section>

        {/* Aba: Músicas */}
        <section
          id="panel-music"
          role="tabpanel"
          aria-labelledby="tab-music"
          className="tab-panel"
          hidden={activeTab !== 'music'}
        >
          <MediaSection
            title="Trilha Sonora"
            description="Músicas que compõem o ciclo principal de áudio."
            accept="audio/*"
            onUpload={(files) => void handleUpload(files, 'music')}
            disabled={!selectedCompanyId || busy}
            isUploading={busy}
          >
            <AssetList
              items={music}
              emptyText="Nenhuma música enviada."
              onDelete={(asset) => setItemToDelete({ kind: 'music', asset })}
              busy={busy}
            />
          </MediaSection>
        </section>

        {/* Aba: Locuções */}
        <section
          id="panel-voiceovers"
          role="tabpanel"
          aria-labelledby="tab-voiceovers"
          className="tab-panel"
          hidden={activeTab !== 'voiceovers'}
        >
          <MediaSection
            title="Locuções e Avisos"
            description="Áudios secundários intercalados com a trilha sonora."
            accept="audio/*"
            onUpload={(files) => void handleUpload(files, 'voiceovers')}
            disabled={!selectedCompanyId || busy}
            isUploading={busy}
          >
            <AssetList
              items={voiceovers}
              emptyText="Nenhuma locução enviada."
              onDelete={(asset) => setItemToDelete({ kind: 'voiceovers', asset })}
              busy={busy}
            />
          </MediaSection>
        </section>
      </main>

      {/* Modal de Confirmação de Exclusão */}
      {itemToDelete ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-content">
            <div className="modal-header">
              <h3 id="modal-title">Confirmar exclusão</h3>
              <p>Tem certeza de que deseja remover este item? Esta ação não pode ser desfeita.</p>
              <p style={{ marginTop: '0.5rem', fontWeight: 500, wordBreak: 'break-all' }}>
                {getFileName(itemToDelete.asset.file_url)}
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setItemToDelete(null)} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="danger" onClick={() => void confirmDelete()} disabled={busy}>
                {busy ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Lightbox Preview */}
      {previewImage && (
        <div className="lightbox-overlay" onClick={() => setPreviewImage(null)} role="dialog" aria-label="Visualização de Imagem" aria-modal="true">
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setPreviewImage(null)} aria-label="Fechar visualização">×</button>
            
            {previewImageIndex > 0 && (
              <button className="lightbox-nav prev" onClick={handlePrevPreview} aria-label="Imagem anterior">
                ‹
              </button>
            )}
            
            <img src={previewImage} alt="Visualização em tela cheia" className="lightbox-image" />
            
            {previewImageIndex < images.length - 1 && (
              <button className="lightbox-nav next" onClick={handleNextPreview} aria-label="Próxima imagem">
                ›
              </button>
            )}
            
            <div className="lightbox-counter">
              {previewImageIndex + 1} de {images.length}
            </div>
          </div>
        </div>
      )}

      {feedback ? (
        <div className="feedback" role="alert" aria-live="assertive">
          {feedback}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Propriedades para a seção de gerenciamento de um tipo de mídia.
 */
type MediaSectionProps = {
  title: string;
  description: string;
  accept: string;
  multiple?: boolean;
  disabled: boolean;
  isUploading?: boolean;
  uploadProgress?: { current: number; total: number; message: string; stats?: { original: number; compressed: number } } | null;
  onUpload: (files: FileList | null) => void;
  children: ReactNode;
};

/**
 * Container semântico para upload e listagem de mídia.
 */
function MediaSection({
  title,
  description,
  accept,
  multiple = false,
  disabled,
  isUploading,
  uploadProgress,
  onUpload,
  children,
}: MediaSectionProps) {
  return (
    <article className="panel">
      <header className="section-header" style={{ marginBottom: uploadProgress ? 'var(--space-2)' : 'var(--space-4)' }}>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <label className="upload-button" aria-label={`Fazer upload para ${title}`}>
          <input
            type="file"
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            onChange={(event) => {
              onUpload(event.target.files);
              event.target.value = '';
            }}
          />
          <span aria-hidden="true">{isUploading ? 'Processando...' : '+ Adicionar'}</span>
        </label>
      </header>
      
      {uploadProgress && isUploading && (
        <div className="progress-container">
          <div className="progress-text">
            <span>{uploadProgress.message}</span>
            <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${Math.max(5, (uploadProgress.current / uploadProgress.total) * 100)}%` }} 
            />
          </div>
          {uploadProgress.stats && (
            <div className="progress-stats">
              <span>Original: {formatBytes(uploadProgress.stats.original)}</span>
              <span>→</span>
              <span>Comprimido: {formatBytes(uploadProgress.stats.compressed)}</span>
            </div>
          )}
        </div>
      )}
      
      {children}
    </article>
  );
}

/**
 * Propriedades para a lista genérica de áudios.
 */
type AssetListProps = {
  items: AudioAsset[];
  emptyText: string;
  busy: boolean;
  onDelete: (asset: AudioAsset) => void;
};

/**
 * Renderiza uma lista padronizada de itens de áudio (músicas ou locuções).
 */
function AssetList({ items, emptyText, busy, onDelete }: AssetListProps) {
  return (
    <ul className="asset-list" aria-label="Lista de Áudios">
      {items.map((asset) => (
        <li key={asset.id} className="asset-row">
          <div className="audio-badge" aria-hidden="true">WAV/MP3</div>
          <div className="asset-copy">
            <strong>{getFileName(asset.file_url)}</strong>
            <span>Cadastrado em {new Date(asset.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
          <div className="asset-actions">
            <button
              type="button"
              className="danger"
              onClick={() => onDelete(asset)}
              disabled={busy}
              aria-label="Excluir áudio"
            >
              Excluir
            </button>
          </div>
        </li>
      ))}
      {items.length === 0 ? <EmptyState text={emptyText} /> : null}
    </ul>
  );
}

/**
 * Estado vazio para listas sem itens.
 */
function EmptyState({ text }: { text: string }) {
  return <li className="empty-state" role="status">{text}</li>;
}

/**
 * Modo TV: Interface de exibição limpa (fullscreen) com reprodução automática.
 */
function TvMode() {
  const [company, setCompany] = useState<Company | null>(null);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [music, setMusic] = useState<AudioAsset[]>([]);
  const [voiceovers, setVoiceovers] = useState<AudioAsset[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [message, setMessage] = useState('Inicializando player de mídia...');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<AudioAsset[]>([]);
  const companyId = readCompanyIdFromUrl();

  const loadPlayerData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setMessage('Erro: Supabase não está configurado.');
      return;
    }

    if (!companyId) {
      setMessage('Nenhuma empresa selecionada. Informe ?company=<id> na URL.');
      return;
    }

    const companyList = await listCompanies();
    const activeCompany = companyList.find((item) => item.id === companyId) ?? null;

    if (!activeCompany) {
      setMessage('Erro: A empresa solicitada não foi encontrada no sistema.');
      return;
    }

    const assets = await fetchAssets(companyId);
    setCompany(activeCompany);
    setImages(assets.images);
    setMusic(assets.music);
    setVoiceovers(assets.voiceovers);
    setMessage('');
  }, [companyId]);

  const playNextAudio = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (music.length === 0 && voiceovers.length === 0) {
      return;
    }

    if (queueRef.current.length === 0) {
      queueRef.current = buildAlternatingAudioQueue(music, voiceovers);
    }

    const nextAudio = queueRef.current.shift();

    if (!nextAudio) {
      return;
    }

    audio.src = nextAudio.file_url;
    audio.load();

    try {
      await audio.play();
    } catch {
      setMessage('A reprodução automática de áudio foi bloqueada pelo navegador.');
    }
  }, [music, voiceovers]);

  useEffect(() => {
    void loadPlayerData().catch((error: Error) => setMessage(error.message));

    const refreshTimer = window.setInterval(() => {
      void loadPlayerData().catch((error: Error) => setMessage(error.message));
    }, 30000);

    return () => window.clearInterval(refreshTimer);
  }, [loadPlayerData]);

  useEffect(() => {
    if (images.length === 0) {
      setCurrentImageIndex(0);
      return;
    }

    const preloadLimit = Math.min(images.length, 6);
    images.slice(0, preloadLimit).forEach((image) => {
      const img = new Image();
      img.src = image.file_url;
    });

    const timer = window.setInterval(() => {
      setCurrentImageIndex((index) => (index + 1) % images.length);
    }, (company?.image_duration_seconds ?? 10) * 1000);

    return () => window.clearInterval(timer);
  }, [company?.image_duration_seconds, images]);

  useEffect(() => {
    queueRef.current = [];

    if (music.length === 0 && voiceovers.length === 0) {
      return;
    }

    void playNextAudio();
  }, [music, playNextAudio, voiceovers]);

  const currentImage = images[currentImageIndex];

  return (
    <main className="tv-shell" aria-label="Player de Exibição TV">
      {currentImage ? (
        <img
          key={currentImage.id}
          className="tv-image"
          src={currentImage.file_url}
          alt="Propaganda atual"
          draggable={false}
        />
      ) : (
        <div className="tv-placeholder" role="status" aria-live="polite">
          {message || 'Nenhuma imagem cadastrada no momento.'}
        </div>
      )}

      <audio
        ref={audioRef}
        autoPlay
        preload="auto"
        onEnded={() => void playNextAudio()}
        onError={() => void playNextAudio()}
        aria-hidden="true"
      />
    </main>
  );
}

export default App;
