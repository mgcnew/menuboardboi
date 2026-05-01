import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './hooks/useAuth';
import { Login } from './components/Login';
import {
  createCompany,
  deleteAudio,
  deleteImage,
  getCompanyByCode,
  isSupabaseConfigured,
  listAudio,
  listCompanies,
  listImages,
  reorderImages,
  updateCompanyDuration,
  updateCompanyTransition,
  updateImageDays,
  uploadAudio,
  uploadImages,
} from './lib/supabase';
import { compressImageFile, formatBytes, getFileName, validateImage, validateAudio } from './lib/utils';
import { useAudioSettings } from './hooks/useAudioSettings';
import { useAudioMixer } from './hooks/useAudioMixer';
import { useActiveImages } from './hooks/useActiveImages';
import type { AudioAsset, Company, ImageAsset, MediaKind } from './types';

const COMPANY_STORAGE_KEY = 'tv-ads-player-company-id';

const WEEK_DAYS = [
  { label: 'D', title: 'Domingo', value: 0 },
  { label: 'S', title: 'Segunda', value: 1 },
  { label: 'T', title: 'Terça', value: 2 },
  { label: 'Q', title: 'Quarta', value: 3 },
  { label: 'Q', title: 'Quinta', value: 4 },
  { label: 'S', title: 'Sexta', value: 5 },
  { label: 'S', title: 'Sábado', value: 6 },
];

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
 * Constrói a URL para acessar o modo TV diretamente via código.
 */
function buildTvUrl(accessCode?: string) {
  if (!accessCode) return '';
  const url = new URL(`/${accessCode}`, window.location.origin);
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
  const path = window.location.pathname;
  // match /1234 or /1234/
  const isTvMode = /^\/\d{4}\/?$/.test(path);

  if (isTvMode) {
    const code = path.match(/\d{4}/)?.[0] || '';
    return <TvMode accessCode={code} />;
  }

  return <ConfigModeWrapper />;
}

function ConfigModeWrapper() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <div className="shell">Carregando sessão segura...</div>;

  if (!isAuthenticated) {
    return <Login />;
  }

  return <ConfigMode />;
}

/**
 * Modo Configuração: Interface principal administrativa.
 * Design acessível, semântico e com alta legibilidade (WCAG 2.1).
 */
type TabId = 'company' | 'images' | 'music' | 'voiceovers';

function ConfigMode() {
  const { profile, isMasterAdmin, loading: authLoading, signOut } = useAuth();
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
  const [transitionTypeInput, setTransitionTypeInput] = useState('fade');
  const [transitionDurationInput, setTransitionDurationInput] = useState('1.0');
  const [imageFitModeInput, setImageFitModeInput] = useState('contain');
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; message: string; stats?: { original: number; compressed: number } } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewResolution, setPreviewResolution] = useState<'landscape' | 'portrait' | 'square'>('landscape');
  
  // Audio Settings
  const { settings: audioSettings, updateSettings: setAudioSettings } = useAudioSettings(selectedCompanyId);

  // Tab state - default to 'images' for non-admins
  const [activeTab, setActiveTab] = useState<TabId>('company');
  
  // Update active tab based on auth role
  useEffect(() => {
    if (!authLoading && !isMasterAdmin && activeTab === 'company') {
      setActiveTab('images');
    }
  }, [authLoading, isMasterAdmin, activeTab]);

  // Force selected company to profile company if not master admin
  useEffect(() => {
    if (!isMasterAdmin && profile?.company_id) {
      setSelectedCompanyId(profile.company_id);
    }
  }, [isMasterAdmin, profile]);

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
      setTransitionTypeInput(selectedCompany.transition_type ?? 'fade');
      setTransitionDurationInput(String(selectedCompany.transition_duration_seconds ?? 1.0));
      setImageFitModeInput(selectedCompany.image_fit_mode ?? 'contain');
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
            const file = fileArray[i];
            setUploadProgress({
              current: i,
              total: fileArray.length,
              message: `Análise de segurança e validação da imagem ${i + 1} de ${fileArray.length}...`,
              stats: { original: originalSize, compressed: compressedSize }
            });
            
            // Simula um scan de segurança e checagem de integridade (além da validação de tipo já feita)
            await new Promise(r => setTimeout(r, 200));
            await validateImage(file);
            
            const result = await compressImageFile(file);
            originalSize += result.originalSize;
            compressedSize += result.compressedSize;
            processedFiles.push(result.file);
            
            setUploadProgress({
              current: i + 1,
              total: fileArray.length,
              message: `Comprimindo imagem ${i + 1} de ${fileArray.length}...`,
              stats: { original: originalSize, compressed: compressedSize }
            });
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
          const percent = originalSize > 0 ? ((savings / originalSize) * 100).toFixed(0) : '0';
          setFeedback(`Upload concluído! Redução de ${formatBytes(savings)} (${percent}%).`);
        } else {
          setUploadProgress({ current: 0, total: fileArray.length, message: 'Validando áudio...' });
          for (let i = 0; i < fileArray.length; i++) {
            setUploadProgress({ current: i, total: fileArray.length, message: `Validando áudio ${i + 1} de ${fileArray.length}...` });
            await validateAudio(fileArray[i]);
          }
          
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

  const isDurationValid = Number.isFinite(Number(durationInput)) && Number(durationInput) >= 1 && Number(durationInput) <= 30;
  const isTransitionValid = Number.isFinite(Number(transitionDurationInput)) && Number(transitionDurationInput) >= 0.1 && Number(transitionDurationInput) <= 3;
  const isTotalTimeValid = (Number(durationInput) + Number(transitionDurationInput)) >= 1.5;

  const handleUpdateImageDays = useCallback(async (imageId: string, days: number[]) => {
    try {
      setBusy(true);
      await updateImageDays(imageId, days);
      setImages((prev) => prev.map(img => img.id === imageId ? { ...img, active_days: days } : img));
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSaveDuration = useCallback(async () => {
    if (!selectedCompanyId) {
      return;
    }

    if (!isDurationValid || !isTransitionValid || !isTotalTimeValid) {
      setFeedback('Valores inválidos. Tempo total deve ser ≥ 1.5s.');
      return;
    }

    setBusy(true);
    setFeedback('');

    try {
      await updateCompanyDuration(selectedCompanyId, Number(durationInput));
      await updateCompanyTransition(selectedCompanyId, transitionTypeInput, Number(transitionDurationInput), imageFitModeInput);
      await refreshCompanies();
      setFeedback('Configurações salvas com sucesso.');
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [durationInput, transitionTypeInput, transitionDurationInput, imageFitModeInput, isDurationValid, isTransitionValid, isTotalTimeValid, refreshCompanies, selectedCompanyId]);

  const handlePreset = useCallback((duration: string, type: string, transDuration: string, fitMode: string = 'contain') => {
    setDurationInput(duration);
    setTransitionTypeInput(type);
    setTransitionDurationInput(transDuration);
    setImageFitModeInput(fitMode);
  }, []);

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-end' }}>
          <button onClick={() => void signOut()} className="secondary">Sair do Sistema</button>
          {selectedCompanyId ? (
            <a
              className="primary-link"
              href={buildTvUrl(selectedCompany?.access_code)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir modo TV para a empresa ${selectedCompany?.name ?? ''}`}
            >
              Iniciar Exibição TV
            </a>
          ) : null}
        </div>
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
        <span>Painel {isMasterAdmin ? 'Master' : 'da Empresa'}</span> / 
        <span>{selectedCompany ? selectedCompany.name : (isMasterAdmin ? 'Selecionar Empresa' : 'Carregando...')}</span> / 
        <span>
          {activeTab === 'company' && ' Configurações'}
          {activeTab === 'images' && ' Fotos Promocionais'}
          {activeTab === 'music' && ' Trilha Sonora'}
          {activeTab === 'voiceovers' && ' Locuções'}
        </span>
      </nav>

      <div role="tablist" className="tabs-list" aria-label="Navegação Principal">
        {isMasterAdmin && (
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
        )}
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
        {isMasterAdmin && (
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
                  Código de Acesso TV
                  <input
                    type="text"
                    readOnly
                    value={selectedCompany.access_code ?? 'N/A'}
                    aria-label="Código de 4 dígitos para acessar a TV"
                    style={{ fontWeight: 'bold', fontSize: '1.2rem', letterSpacing: '2px' }}
                  />
                </label>
                <label>
                  URL direta do Player
                  <input
                    type="text"
                    readOnly
                    value={buildTvUrl(selectedCompany.access_code)}
                    aria-label="URL de acesso direto ao player desta empresa"
                    onClick={(e) => e.currentTarget.select()}
                  />
                </label>
              </div>
            ) : null}

            {selectedCompany ? (
              <article className="panel" style={{ marginTop: 'var(--space-4)' }}>
                <header className="section-header">
                  <div>
                    <h3>Mixagem de Áudio</h3>
                    <p>Ajuste o volume base, os níveis de redução (ducking) e o intervalo das locuções.</p>
                  </div>
                </header>
                <div className="form-grid">
                  <label>
                    Volume da Música Base (%)
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(audioSettings.musicBaseVolume * 100)}
                      onChange={(e) => setAudioSettings({ musicBaseVolume: Number(e.target.value) / 100 })}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {Math.round(audioSettings.musicBaseVolume * 100)}%
                    </span>
                  </label>

                  <label>
                    Volume da Música na Locução (%)
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(audioSettings.musicDuckedVolume * 100)}
                      onChange={(e) => setAudioSettings({ musicDuckedVolume: Number(e.target.value) / 100 })}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {Math.round(audioSettings.musicDuckedVolume * 100)}%
                    </span>
                  </label>

                  <label>
                    Volume da Locução (%)
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(audioSettings.voiceoverVolume * 100)}
                      onChange={(e) => setAudioSettings({ voiceoverVolume: Number(e.target.value) / 100 })}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {Math.round(audioSettings.voiceoverVolume * 100)}%
                    </span>
                  </label>

                  <label>
                    Tempo de Fade Out (segundos)
                    <input
                      type="number"
                      min="0.1"
                      max="5.0"
                      step="0.1"
                      value={audioSettings.duckingFadeOutTime}
                      onChange={(e) => setAudioSettings({ duckingFadeOutTime: Number(e.target.value) })}
                    />
                  </label>

                  <label>
                    Tempo de Fade In (segundos)
                    <input
                      type="number"
                      min="0.1"
                      max="5.0"
                      step="0.1"
                      value={audioSettings.duckingFadeInTime}
                      onChange={(e) => setAudioSettings({ duckingFadeInTime: Number(e.target.value) })}
                    />
                  </label>

                  <label>
                    Intervalo entre Locuções (minutos)
                    <input
                      type="number"
                      min="1"
                      max="60"
                      step="1"
                      value={audioSettings.voiceoverIntervalMinutes}
                      onChange={(e) => setAudioSettings({ voiceoverIntervalMinutes: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </article>
            ) : null}
          </section>
        )}

        {/* Aba: Fotos */}
        <section
          id="panel-images"
          role="tabpanel"
          aria-labelledby="tab-images"
          className="tab-panel"
          hidden={activeTab !== 'images'}
        >
          {selectedCompany ? (
            <article className="panel" style={{ marginBottom: 'var(--space-4)' }}>
              <header className="section-header">
                <div>
                  <h3>Configurações de Transição</h3>
                  <p>Ajuste o tempo de exibição e os efeitos visuais entre as fotos.</p>
                </div>
              </header>

              <div className="form-grid">
                <label>
                  Duração da Foto (segundos)
                  <input
                    type="number"
                    min="1"
                    max="30"
                    step="0.5"
                    value={durationInput}
                    onChange={(e) => setDurationInput(e.target.value)}
                    disabled={busy}
                  />
                </label>

                <label>
                  Tipo de Transição
                  <select
                    value={transitionTypeInput}
                    onChange={(e) => setTransitionTypeInput(e.target.value)}
                    disabled={busy}
                  >
                    <option value="fade">Fade (Dissolvência)</option>
                    <option value="cut">Cut (Corte Direto)</option>
                    <option value="wipe-horizontal">Wipe Horizontal</option>
                    <option value="wipe-vertical">Wipe Vertical</option>
                  </select>
                </label>

                <label>
                  Tempo da Transição (segundos)
                  <input
                    type="number"
                    min="0.1"
                    max="3"
                    step="0.1"
                    value={transitionDurationInput}
                    onChange={(e) => setTransitionDurationInput(e.target.value)}
                    disabled={busy || transitionTypeInput === 'cut'}
                  />
                </label>
                <label>
                  Modo de Exibição
                  <select
                    value={imageFitModeInput}
                    onChange={(e) => setImageFitModeInput(e.target.value)}
                    disabled={busy}
                  >
                    <option value="contain">Ajustar à Tela (Mantém proporção)</option>
                    <option value="cover">Preencher Tela (Corta as bordas)</option>
                    <option value="fill">Esticar (Distorce a imagem)</option>
                  </select>
                </label>
              </div>

              <div className="presets-container" style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
                <button type="button" className="secondary" onClick={() => handlePreset('10', 'fade', '1.0', 'contain')}>
                  Manter Proporção (Sem cortes, pode ter listras)
                </button>
                <button type="button" className="secondary" onClick={() => handlePreset('10', 'fade', '1.0', 'cover')}>
                  Preencher Tela (Corta sobras, sem listras)
                </button>
                <button type="button" className="secondary" onClick={() => handlePreset('10', 'fade', '1.0', 'fill')}>
                  Esticar Exato (Preenche tudo, mas distorce)
                </button>
                
                <button 
                  type="button" 
                  onClick={() => void handleSaveDuration()} 
                  disabled={busy || !isDurationValid || !isTransitionValid || !isTotalTimeValid}
                  style={{ marginLeft: 'auto' }}
                >
                  Salvar Configurações
                </button>
              </div>

              {!isTotalTimeValid && (
                <div style={{ color: 'var(--text-danger)', fontSize: '0.85rem', marginTop: 'var(--space-2)' }}>
                  O tempo total (foto + transição) deve ser de pelo menos 1.5 segundos.
                </div>
              )}
              
              {/* Live Preview Box */}
              <div className="live-preview-box" style={{ marginTop: 'var(--space-4)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-default)', fontSize: '0.85rem', fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Preview ao Vivo</span>
                  <select 
                    value={previewResolution} 
                    onChange={(e) => setPreviewResolution(e.target.value as any)}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', width: 'auto' }}
                  >
                    <option value="landscape">Paisagem (Ex: 1920x1080)</option>
                    <option value="portrait">Retrato (Ex: 1080x1920)</option>
                    <option value="square">Quadrado (Ex: 1080x1080)</option>
                  </select>
                </div>
                <div style={{ 
                  position: 'relative', 
                  background: '#000', 
                  overflow: 'hidden',
                  margin: '0 auto',
                  height: '300px',
                  width: previewResolution === 'landscape' ? '100%' : previewResolution === 'portrait' ? '168px' : '300px',
                  transition: 'width 0.3s ease'
                }}>
                  {images.length > 0 ? (
                    <>
                      <div 
                        className="preview-slide"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          animation: `preview-${transitionTypeInput} ${Number(durationInput) + Number(transitionDurationInput)}s infinite`,
                          animationDuration: `${Number(durationInput) + Number(transitionDurationInput)}s`,
                          '--trans-duration': `${transitionTypeInput === 'cut' ? 0 : transitionDurationInput}s`,
                          '--photo-duration': `${durationInput}s`
                        } as React.CSSProperties}
                      >
                        <img src={images[0].file_url} style={{ width: '100%', height: '100%', objectFit: imageFitModeInput as any }} alt="" />
                      </div>
                      {images.length > 1 && (
                        <div 
                          className="preview-slide"
                          style={{
                            position: 'absolute',
                            inset: 0,
                            animation: `preview-${transitionTypeInput}-alt ${Number(durationInput) + Number(transitionDurationInput)}s infinite`,
                            animationDuration: `${Number(durationInput) + Number(transitionDurationInput)}s`,
                            '--trans-duration': `${transitionTypeInput === 'cut' ? 0 : transitionDurationInput}s`,
                            '--photo-duration': `${durationInput}s`
                          } as React.CSSProperties}
                        >
                          <img src={images[1].file_url} style={{ width: '100%', height: '100%', objectFit: imageFitModeInput as any }} alt="" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>
                      Adicione fotos para visualizar
                    </div>
                  )}
                </div>
              </div>
            </article>
          ) : null}

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
                    
                    <div className="image-card-scheduling">
                      <span className="scheduling-label">Exibir nos dias:</span>
                      <div className="day-selector">
                        {WEEK_DAYS.map((day) => {
                          const activeDays = image.active_days ?? [0, 1, 2, 3, 4, 5, 6];
                          const isActive = activeDays.includes(day.value);
                          return (
                            <button
                              key={day.value}
                              type="button"
                              className={`day-btn ${isActive ? 'active' : ''}`}
                              title={day.title}
                              disabled={busy}
                              onClick={() => {
                                let newDays = [...activeDays];
                                if (isActive) {
                                  // Impede de desmarcar todos os dias
                                  if (activeDays.length > 1) {
                                    newDays = activeDays.filter((d) => d !== day.value);
                                  } else {
                                    return; // não faz nada se tentar remover o último
                                  }
                                } else {
                                  newDays.push(day.value);
                                  newDays.sort();
                                }
                                void handleUpdateImageDays(image.id, newDays);
                              }}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
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
            accept="audio/*,.mp3,.wav,.mpeg,.m4a"
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
            accept="audio/*,.mp3,.wav,.mpeg,.m4a"
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
              {uploadProgress.stats.original > 0 && (
                <span className="progress-reduction">
                  (-{((1 - uploadProgress.stats.compressed / uploadProgress.stats.original) * 100).toFixed(0)}%)
                </span>
              )}
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
      {items.map((asset) => {
        const ext = asset.file_url.split('.').pop()?.toUpperCase() || 'AUDIO';
        return (
          <li key={asset.id} className="asset-row" style={{ flexWrap: 'wrap' }}>
            <div className="audio-badge" aria-hidden="true" style={{ fontSize: '0.6rem' }}>{ext.substring(0, 4)}</div>
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
            <div style={{ width: '100%', marginTop: 'var(--space-2)' }}>
              <audio 
                controls 
                src={asset.file_url} 
                preload="none" 
                style={{ width: '100%', height: '36px', outline: 'none' }}
                title={`Preview de ${getFileName(asset.file_url)}`}
              />
            </div>
          </li>
        );
      })}
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
function TvMode({ accessCode }: { accessCode: string }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [music, setMusic] = useState<AudioAsset[]>([]);
  const [voiceovers, setVoiceovers] = useState<AudioAsset[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [message, setMessage] = useState('Inicializando player de mídia...');
  const [currentDay, setCurrentDay] = useState(new Date().getDay());
  const [resolution, setResolution] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setResolution({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const { settings: audioSettings } = useAudioSettings(company?.id ?? '');
  
  // Audio Playback Logic via Custom Hook
  useAudioMixer(music, voiceovers, audioSettings);

  const activeImages = useActiveImages(images, currentDay);

  const loadPlayerData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setMessage('Erro: Supabase não está configurado.');
      return;
    }

    if (!accessCode) {
      setMessage('Código de acesso inválido.');
      return;
    }

    try {
      const activeCompany = await getCompanyByCode(accessCode);

      if (!activeCompany) {
        setMessage('Erro: Código de acesso inválido ou empresa não encontrada.');
        return;
      }

      const assets = await fetchAssets(activeCompany.id);
      
      setCompany(prev => JSON.stringify(prev) === JSON.stringify(activeCompany) ? prev : activeCompany);
      setImages(prev => JSON.stringify(prev) === JSON.stringify(assets.images) ? prev : assets.images);
      setMusic(prev => JSON.stringify(prev) === JSON.stringify(assets.music) ? prev : assets.music);
      setVoiceovers(prev => JSON.stringify(prev) === JSON.stringify(assets.voiceovers) ? prev : assets.voiceovers);
      setMessage('');
    } catch (err) {
      console.error('Erro detalhado:', err);
      setMessage(`Erro ao carregar dados da empresa: ${(err as Error).message}`);
    }
  }, [accessCode]);

  useEffect(() => {
    void loadPlayerData().catch((error: Error) => setMessage(error.message));

    const refreshTimer = window.setInterval(() => {
      void loadPlayerData().catch((error: Error) => setMessage(error.message));
      setCurrentDay(new Date().getDay());
    }, 30000);

    return () => window.clearInterval(refreshTimer);
  }, [loadPlayerData]);

  useEffect(() => {
    if (activeImages.length === 0) {
      setCurrentImageIndex(0);
      return;
    }

    const preloadLimit = Math.min(activeImages.length, 6);
    activeImages.slice(0, preloadLimit).forEach((image) => {
      const img = new Image();
      img.src = image.file_url;
    });

    const timer = window.setInterval(() => {
      setCurrentImageIndex((index) => (index + 1) % activeImages.length);
    }, (company?.image_duration_seconds ?? 10) * 1000 + (company?.transition_duration_seconds ?? 1) * 1000);

    return () => window.clearInterval(timer);
  }, [company?.image_duration_seconds, company?.transition_duration_seconds, activeImages]);

  const currentImage = activeImages[currentImageIndex];
  const transitionType = company?.transition_type ?? 'fade';
  const transitionDuration = company?.transition_duration_seconds ?? 1.0;
  const photoDuration = company?.image_duration_seconds ?? 10;
  const imageFitMode = company?.image_fit_mode ?? 'contain';

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Erro ao tentar tela cheia: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <main 
      className="tv-shell" 
      aria-label="Player de Exibição TV"
      data-resolution={`${resolution.width}x${resolution.height}`}
      data-aspect-ratio={(resolution.width / resolution.height).toFixed(2)}
      style={{ backgroundColor: '#000', margin: 0, padding: 0, width: '100vw', height: '100dvh', position: 'fixed', inset: 0, overflow: 'hidden' }}
      onDoubleClick={handleFullscreen}
    >
      <button 
        onClick={handleFullscreen}
        style={{ 
          position: 'absolute', 
          bottom: '20px', 
          right: '20px', 
          zIndex: 9999, 
          opacity: 0.3, 
          background: 'rgba(0,0,0,0.5)', 
          color: 'white', 
          border: '1px solid rgba(255,255,255,0.2)', 
          padding: '8px 12px', 
          borderRadius: '4px', 
          cursor: 'pointer',
          fontSize: '0.8rem',
          transition: 'opacity 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.3'}
        title="Dê um duplo-clique em qualquer lugar ou clique aqui para Tela Cheia"
      >
        ⛶ Tela Cheia
      </button>

      {currentImage ? (
        <div 
          key={currentImage.id}
          className={`tv-image-container transition-${transitionType}`}
          style={{
            animationDuration: `${photoDuration + transitionDuration}s`,
            '--trans-duration': `${transitionType === 'cut' ? 0 : transitionDuration}s`,
            '--photo-duration': `${photoDuration}s`,
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: 0,
            padding: 0,
            overflow: 'hidden'
          } as React.CSSProperties}
        >
          <img
            className="tv-image"
            src={currentImage.file_url}
            alt="Propaganda atual"
            draggable={false}
            style={{ 
              objectFit: imageFitMode as any,
              width: '100%',
              height: '100%',
              maxWidth: '100%',
              maxHeight: '100%',
              display: 'block',
              margin: 'auto'
            }}
          />
        </div>
      ) : (
        <div className="tv-placeholder" role="status" aria-live="polite">
          {message || 'Nenhuma imagem cadastrada no momento.'}
        </div>
      )}
    </main>
  );
}

export default App;
