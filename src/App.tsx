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
import { buildAlternatingAudioQueue, getFileName } from './lib/utils';
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

      try {
        const fileArray = Array.from(files);

        if (kind === 'images') {
          await uploadImages(selectedCompanyId, fileArray);
        } else {
          await uploadAudio(selectedCompanyId, kind, fileArray);
        }

        await refreshAssets();
        setFeedback('Upload concluído.');
      } catch (error) {
        setFeedback((error as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [refreshAssets, selectedCompanyId],
  );

  const handleDeleteImage = useCallback(
    async (image: ImageAsset) => {
      setBusy(true);
      setFeedback('');

      try {
        await deleteImage(image);
        await refreshAssets();
        setFeedback('Imagem removida.');
      } catch (error) {
        setFeedback((error as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [refreshAssets],
  );

  const handleDeleteAudio = useCallback(
    async (table: MediaKind, asset: AudioAsset) => {
      setBusy(true);
      setFeedback('');

      try {
        await deleteAudio(table, asset);
        await refreshAssets();
        setFeedback('Áudio removido.');
      } catch (error) {
        setFeedback((error as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [refreshAssets],
  );

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

  const handleSaveDuration = useCallback(async () => {
    if (!selectedCompanyId) {
      return;
    }

    const seconds = Number(durationInput);

    if (!Number.isFinite(seconds) || seconds < 3) {
      setFeedback('Use um intervalo de pelo menos 3 segundos.');
      return;
    }

    setBusy(true);
    setFeedback('');

    try {
      await updateCompanyDuration(selectedCompanyId, Math.floor(seconds));
      await refreshCompanies();
      setFeedback('Duração das imagens atualizada.');
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [durationInput, refreshCompanies, selectedCompanyId]);

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <span className="eyebrow">Painel Administrativo</span>
          <h1>TV Ads Player</h1>
          <p>
            Gerencie o conteúdo de mídia e controle as configurações de exibição para cada empresa de forma centralizada.
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

      <main>
        <section className="panel" aria-labelledby="company-settings-title">
          <header className="section-header">
            <div>
              <h2 id="company-settings-title">Configurações da Empresa</h2>
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
                  />
                  <button type="button" onClick={() => void handleSaveDuration()} disabled={busy}>
                    Salvar
                  </button>
                </div>
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

        <section className="content-grid" aria-label="Gerenciamento de Mídia">
          <MediaSection
            title="Imagens Promocionais"
            description="Arquivos de imagem exibidos em sequência. Ordene conforme desejado."
            accept="image/*"
            multiple
            onUpload={(files) => void handleUpload(files, 'images')}
            disabled={!selectedCompanyId || busy}
          >
            <ul className="asset-list" aria-label="Lista de Imagens">
              {images.map((image, index) => (
                <li key={image.id} className="asset-row">
                  <img className="thumb" src={image.file_url} alt={`Preview da imagem ${index + 1}`} loading="lazy" />
                  <div className="asset-copy">
                    <strong>{getFileName(image.file_url)}</strong>
                    <span>Ordem de exibição: {index + 1}</span>
                  </div>
                  <div className="asset-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void handleMoveImage(index, -1)}
                      disabled={busy || index === 0}
                      aria-label="Mover para cima"
                    >
                      ↑ Subir
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void handleMoveImage(index, 1)}
                      disabled={busy || index === images.length - 1}
                      aria-label="Mover para baixo"
                    >
                      ↓ Descer
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void handleDeleteImage(image)}
                      disabled={busy}
                      aria-label="Excluir imagem"
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
              {images.length === 0 ? <EmptyState text="Nenhuma imagem enviada para esta empresa." /> : null}
            </ul>
          </MediaSection>

          <MediaSection
            title="Trilha Sonora"
            description="Músicas que compõem o ciclo principal de áudio."
            accept="audio/*"
            onUpload={(files) => void handleUpload(files, 'music')}
            disabled={!selectedCompanyId || busy}
          >
            <AssetList
              items={music}
              emptyText="Nenhuma música enviada."
              onDelete={(asset) => void handleDeleteAudio('music', asset)}
              busy={busy}
            />
          </MediaSection>

          <MediaSection
            title="Locuções e Avisos"
            description="Áudios secundários intercalados com a trilha sonora."
            accept="audio/*"
            onUpload={(files) => void handleUpload(files, 'voiceovers')}
            disabled={!selectedCompanyId || busy}
          >
            <AssetList
              items={voiceovers}
              emptyText="Nenhuma locução enviada."
              onDelete={(asset) => void handleDeleteAudio('voiceovers', asset)}
              busy={busy}
            />
          </MediaSection>
        </section>
      </main>

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
  onUpload,
  children,
}: MediaSectionProps) {
  return (
    <article className="panel">
      <header className="section-header">
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
          <span aria-hidden="true">+ Adicionar</span>
        </label>
      </header>
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
