import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Users, MessageSquare, Image as ImageIcon,
  Clock, CheckCircle, AlertCircle, XCircle,
  Send, RefreshCw, ChevronDown, ChevronUp, RotateCcw
} from 'lucide-react';
import type {
  WhatsAppBanner, WhatsAppPostTemplate, WhatsAppContact, WhatsAppPost
} from '../types';
import {
  listWhatsAppBanners, listWhatsAppTemplates,
  listWhatsAppContacts, listWhatsAppPosts,
  cancelWhatsAppPost, createWhatsAppPost
} from '../lib/supabase';
import { CampaignWizard } from './whatsapp/CampaignWizard';
import { LibraryView } from './whatsapp/WhatsAppLibrary';

// ── Toast helper ──
type ToastType = 'success' | 'error' | 'info';

interface WhatsAppTabProps {
  companyId: string;
}

type MainView = 'dashboard' | 'library';
type LibrarySection = 'contacts' | 'templates' | 'banners';

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pending:    { icon: Clock,       color: '#d97706', label: 'Pendente' },
  processing: { icon: RefreshCw,  color: '#2563eb', label: 'Processando' },
  sent:       { icon: CheckCircle, color: '#059669', label: 'Enviado' },
  failed:     { icon: AlertCircle, color: '#dc2626', label: 'Falhou' },
  cancelled:  { icon: XCircle,     color: '#6b7280', label: 'Cancelado' },
};

export function WhatsAppTab({ companyId }: WhatsAppTabProps) {
  // Data state
  const [banners, setBanners] = useState<WhatsAppBanner[]>([]);
  const [templates, setTemplates] = useState<WhatsAppPostTemplate[]>([]);
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [posts, setPosts] = useState<WhatsAppPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // UI state
  const [view, setView] = useState<MainView>('dashboard');
  const [librarySection, setLibrarySection] = useState<LibrarySection>('contacts');
  const [showWizard, setShowWizard] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedPost, setExpandedPost] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const showToast = useCallback((msg: string, type: ToastType) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Data loaders
  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [b, t, c, p] = await Promise.all([
        listWhatsAppBanners(companyId),
        listWhatsAppTemplates(companyId),
        listWhatsAppContacts(companyId),
        listWhatsAppPosts(companyId),
      ]);
      setBanners(b); setTemplates(t); setContacts(c); setPosts(p);
    } catch (e) {
      console.error('Erro ao carregar dados WhatsApp:', e);
      showToast('Erro ao carregar dados.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [companyId, showToast]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const reloadBanners = useCallback(async () => { setBanners(await listWhatsAppBanners(companyId)); }, [companyId]);
  const reloadTemplates = useCallback(async () => { setTemplates(await listWhatsAppTemplates(companyId)); }, [companyId]);
  const reloadContacts = useCallback(async () => { setContacts(await listWhatsAppContacts(companyId)); }, [companyId]);
  const reloadPosts = useCallback(async () => { setPosts(await listWhatsAppPosts(companyId)); }, [companyId]);

  // KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = posts.filter(p => {
      const d = new Date(p.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const sent = thisMonth.filter(p => p.status === 'sent').length;
    const failed = thisMonth.filter(p => p.status === 'failed').length;
    const total = sent + failed;
    const rate = total > 0 ? Math.round((sent / total) * 100) : 0;
    const nextScheduled = posts.find(p => p.status === 'pending' && p.scheduled_at && new Date(p.scheduled_at) > now);
    return { contacts: contacts.length, campaignsThisMonth: thisMonth.length, successRate: rate, nextScheduled };
  }, [contacts, posts]);

  // Filtered posts
  const filteredPosts = useMemo(() => {
    if (statusFilter === 'all') return posts;
    return posts.filter(p => p.status === statusFilter);
  }, [posts, statusFilter]);

  // Handlers
  const handleCancel = async (postId: string) => {
    if (!confirm('Cancelar esta campanha?')) return;
    try {
      await cancelWhatsAppPost(postId);
      showToast('Campanha cancelada.', 'info');
      await reloadPosts();
    } catch { showToast('Erro ao cancelar.', 'error'); }
  };

  const handleRetry = async (post: WhatsAppPost) => {
    try {
      await createWhatsAppPost(companyId, {
        banner_id: post.banner_id,
        template_id: post.template_id,
        message_text: post.message_text,
        recipient_ids: post.recipient_ids,
      });
      showToast('Campanha reenviada!', 'success');
      await reloadPosts();
    } catch { showToast('Erro ao reenviar.', 'error'); }
  };

  const goToLibrary = useCallback(() => setView('library'), []);

  if (isLoading) {
    return <div className="panel" style={{ textAlign: 'center', padding: '3rem' }}>
      <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
      <p>Carregando módulo WhatsApp...</p>
    </div>;
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '80px', right: '20px', zIndex: 999,
          padding: '12px 20px', borderRadius: 'var(--radius-md)',
          background: toast.type === 'error' ? '#fef2f2' : toast.type === 'success' ? '#f0fdf4' : '#eff6ff',
          border: `1px solid ${toast.type === 'error' ? '#fca5a5' : toast.type === 'success' ? '#86efac' : '#93c5fd'}`,
          color: toast.type === 'error' ? '#991b1b' : toast.type === 'success' ? '#166534' : '#1e40af',
          fontSize: '0.88rem', fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          animation: 'slideUp 0.2s ease'
        }}>
          {toast.msg}
        </div>
      )}

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button
          className={view === 'dashboard' ? 'primary' : 'secondary'}
          onClick={() => setView('dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Send size={16} /> Campanhas
        </button>
        <button
          className={view === 'library' ? 'primary' : 'secondary'}
          onClick={() => setView('library')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Users size={16} /> Biblioteca
        </button>
      </div>

      {/* ── DASHBOARD VIEW ── */}
      {view === 'dashboard' && (
        <>
          {/* KPI Grid */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon blue"><Users size={20} /></div>
              <div><div className="kpi-value">{kpis.contacts}</div><div className="kpi-label">Contatos</div></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon amber"><Send size={20} /></div>
              <div><div className="kpi-value">{kpis.campaignsThisMonth}</div><div className="kpi-label">Campanhas (mês)</div></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon green"><CheckCircle size={20} /></div>
              <div><div className="kpi-value">{kpis.successRate}%</div><div className="kpi-label">Taxa de Sucesso</div></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon rose"><Clock size={20} /></div>
              <div>
                <div className="kpi-value" style={{ fontSize: '1rem' }}>
                  {kpis.nextScheduled ? new Date(kpis.nextScheduled.scheduled_at!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
                <div className="kpi-label">Próximo Agend.</div>
              </div>
            </div>
          </div>

          {/* New campaign button */}
          {!showWizard && (
            <button className="primary" onClick={() => setShowWizard(true)} style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={18} /> Nova Campanha
            </button>
          )}

          {/* Campaign Wizard */}
          {showWizard && (
            <CampaignWizard
              companyId={companyId}
              banners={banners}
              templates={templates}
              contacts={contacts}
              onClose={() => setShowWizard(false)}
              onSuccess={() => void reloadPosts()}
              showToast={showToast}
              goToLibrary={goToLibrary}
            />
          )}

          {/* History */}
          <div className="panel" style={{ marginTop: showWizard ? 'var(--space-4)' : 0 }}>
            <div className="section-header" style={{ marginBottom: 'var(--space-3)' }}>
              <h3>Histórico de Campanhas</h3>
              <button className="secondary" onClick={() => void reloadPosts()} style={{ padding: '6px', fontSize: '0.85rem' }}>
                <RefreshCw size={16} />
              </button>
            </div>

            {/* Status filters */}
            <div className="status-filters">
              {['all', 'pending', 'sent', 'failed', 'cancelled'].map(s => (
                <button
                  key={s}
                  className={`status-pill ${statusFilter === s ? 'active' : ''}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? 'Todos' : STATUS_CONFIG[s]?.label || s}
                  {s !== 'all' && ` (${posts.filter(p => p.status === s).length})`}
                </button>
              ))}
            </div>

            {filteredPosts.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <Send size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                <p style={{ color: 'var(--text-secondary)' }}>Nenhuma campanha{statusFilter !== 'all' ? ' com esse filtro' : ''}.</p>
              </div>
            ) : (
              <ul className="asset-list">
                {filteredPosts.map(post => {
                  const cfg = STATUS_CONFIG[post.status] || STATUS_CONFIG.pending;
                  const StatusIcon = cfg.icon;
                  const isExpanded = expandedPost === post.id;
                  const banner = banners.find(b => b.id === post.banner_id);
                  const template = templates.find(t => t.id === post.template_id);

                  return (
                    <li key={post.id} className="asset-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)', cursor: 'pointer' }}
                      onClick={() => setExpandedPost(isExpanded ? null : post.id)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%' }}>
                        <StatusIcon size={20} style={{ color: cfg.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.9rem' }}>
                              {post.message_text
                                ? post.message_text.slice(0, 50) + (post.message_text.length > 50 ? '...' : '')
                                : template?.name || 'Campanha sem texto'}
                            </strong>
                            <span className="tag" style={{ fontSize: '0.65rem', background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {post.recipient_count} destinatário{post.recipient_count !== 1 ? 's' : ''} · {new Date(post.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            {post.scheduled_at && ` · Agendado: ${new Date(post.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                          {post.status === 'pending' && (
                            <button className="danger" onClick={() => void handleCancel(post.id)} style={{ padding: '4px 8px', fontSize: '0.78rem' }}>Cancelar</button>
                          )}
                          {post.status === 'failed' && (
                            <button className="primary" onClick={() => void handleRetry(post)} style={{ padding: '4px 8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <RotateCcw size={14} /> Reenviar
                            </button>
                          )}
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="post-detail" onClick={e => e.stopPropagation()}>
                          {banner && (
                            <div style={{ marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Banner:</span> {banner.name}
                              <img src={banner.file_url} alt="" style={{ width: '100%', maxHeight: '120px', objectFit: 'contain', marginTop: '4px', borderRadius: '4px', background: '#000' }} />
                            </div>
                          )}
                          {(post.message_text || template) && (
                            <div style={{ marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Mensagem:</span>
                              <div className="wa-bubble-preview" style={{ margin: '4px 0', maxWidth: '320px' }}>
                                <div className="wa-bubble" style={{ fontSize: '0.82rem' }}>
                                  {post.message_text || template?.message_text}
                                </div>
                              </div>
                            </div>
                          )}
                          {(post as any).last_error && (
                            <div className="post-error">
                              <strong>Erro:</strong> {(post as any).last_error}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ── LIBRARY VIEW ── */}
      {view === 'library' && (
        <LibraryView
          companyId={companyId}
          section={librarySection}
          setSection={setLibrarySection}
          banners={banners}
          templates={templates}
          contacts={contacts}
          reloadBanners={() => void reloadBanners()}
          reloadTemplates={() => void reloadTemplates()}
          reloadContacts={() => void reloadContacts()}
          showToast={showToast}
        />
      )}
    </div>
  );
}
