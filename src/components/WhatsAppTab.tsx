import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Send, Image as ImageIcon, MessageSquare, Users, 
  Plus, Trash2, Edit2, CheckCircle, XCircle, Clock, 
  UploadCloud, Search, Info, X, LayoutGrid
} from 'lucide-react';
import type { WhatsAppBanner, WhatsAppPostTemplate, WhatsAppContact, WhatsAppPost } from '../types';
import { 
  supabase, listWhatsAppBanners, uploadSingleWhatsAppBanner, deleteWhatsAppBanner, 
  updateWhatsAppBannerStatus, listWhatsAppTemplates, 
  createWhatsAppTemplate, updateWhatsAppTemplate, deleteWhatsAppTemplate, 
  listWhatsAppContacts, createWhatsAppContact, updateWhatsAppContact, 
  deleteWhatsAppContact, importWhatsAppContacts, listWhatsAppPosts, 
  createWhatsAppPost, cancelWhatsAppPost
} from '../lib/supabase';
import { formatBytes } from '../lib/utils';
import * as XLSX from 'xlsx';

type MainView = 'campaigns' | 'library';
type LibrarySection = 'contacts' | 'templates' | 'banners';
type ToastType = 'success' | 'error' | 'info';
interface Toast { id: string; message: string; type: ToastType; }

interface WhatsAppTabProps {
  companyId: string;
}

export function WhatsAppTab({ companyId }: WhatsAppTabProps) {
  const [activeView, setActiveView] = useState<MainView>('campaigns');
  const [librarySection, setLibrarySection] = useState<LibrarySection>('contacts');
  const [loading, setLoading] = useState(false);

  const [banners, setBanners] = useState<WhatsAppBanner[]>([]);
  const [templates, setTemplates] = useState<WhatsAppPostTemplate[]>([]);
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [posts, setPosts] = useState<WhatsAppPost[]>([]);
  
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (!supabase) return;
      const [resBanners, resTemplates, resContacts, resPosts] = await Promise.all([
        listWhatsAppBanners(companyId).then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
        listWhatsAppTemplates(companyId).then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
        listWhatsAppContacts(companyId).then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
        listWhatsAppPosts(companyId).then(data => ({ data, error: null })).catch(error => ({ data: null, error }))
      ]);

      if (resBanners.data) setBanners(resBanners.data as WhatsAppBanner[]);
      if (resTemplates.data) setTemplates(resTemplates.data as WhatsAppPostTemplate[]);
      if (resContacts.data) setContacts(resContacts.data as WhatsAppContact[]);
      if (resPosts.data) setPosts(resPosts.data);
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar dados do WhatsApp.', 'error');
    } finally {
      setLoading(false);
    }
  }, [companyId, showToast]);

  const reloadBanners = useCallback(async () => {
    try {
      const data = await listWhatsAppBanners(companyId);
      setBanners(data);
    } catch (err) {
      console.error(err);
    }
  }, [companyId]);

  const reloadTemplates = useCallback(async () => {
    try {
      const data = await listWhatsAppTemplates(companyId);
      setTemplates(data);
    } catch (err) {
      console.error(err);
    }
  }, [companyId]);

  const reloadContacts = useCallback(async () => {
    try {
      const data = await listWhatsAppContacts(companyId);
      setContacts(data);
    } catch (err) {
      console.error(err);
    }
  }, [companyId]);

  const reloadPosts = useCallback(async () => {
    try {
      const data = await listWhatsAppPosts(companyId);
      setPosts(data);
    } catch (err) {
      console.error(err);
    }
  }, [companyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="whatsapp-dashboard">
      <style>{`
        .whatsapp-dashboard { display: flex; flex-direction: column; gap: var(--space-4); }
        .dashboard-nav { display: flex; gap: var(--space-2); border-bottom: 1px solid var(--border-default); padding-bottom: 1px; }
        .nav-btn { display: flex; align-items: center; gap: var(--space-2); background: transparent; border: none; padding: var(--space-3) var(--space-4); color: var(--text-secondary); font-weight: 500; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
        .nav-btn:hover { color: var(--text-primary); }
        .nav-btn.active { color: var(--border-focus); border-bottom-color: var(--border-focus); }
        
        .toast-container { position: fixed; bottom: 24px; right: 24px; display: flex; flex-direction: column; gap: 8px; z-index: 1000; pointer-events: none; }
        .toast { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: auto; }
        .toast.success { background: #10b981; }
        .toast.error { background: #ef4444; }
        .toast.info { background: #3b82f6; }
        
        .skeleton-container { display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-4) 0; }
        .skeleton { background: var(--border-subtle); border-radius: var(--radius-sm); animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        
        .library-layout { display: flex; gap: var(--space-5); align-items: flex-start; }
        .library-sidebar { width: 240px; display: flex; flex-direction: column; gap: var(--space-1); flex-shrink: 0; }
        .sidebar-btn { display: flex; align-items: center; gap: var(--space-2); padding: 10px 12px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; transition: all 0.2s; font-weight: 500; }
        .sidebar-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
        .sidebar-btn.active { background: var(--bg-subtle); color: var(--text-primary); font-weight: 600; }
        .library-content { flex: 1; min-width: 0; }
        
        .fade-in { animation: fadeIn 0.3s ease; }
        .slide-down { animation: slideDown 0.3s ease; }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .search-wrapper { position: relative; width: 100%; margin-bottom: var(--space-4); }
        .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); }
        .search-input { width: 100%; padding-left: 40px; padding-right: 40px; }
        .search-clear { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-secondary); cursor: pointer; }

        @media (max-width: 768px) {
          .library-layout { flex-direction: column; }
          .library-sidebar { width: 100%; flex-direction: row; overflow-x: auto; padding-bottom: 8px; }
          .sidebar-btn { white-space: nowrap; }
        }
      `}</style>

      <header className="hero" style={{ paddingBottom: 0, borderBottom: 'none' }}>
        <div>
          <h1>Marketing via WhatsApp</h1>
          <p>Crie campanhas, envie mensagens e gerencie sua base de clientes.</p>
        </div>
      </header>

      <nav className="dashboard-nav" aria-label="Navegação do WhatsApp">
        <button 
          className={`nav-btn ${activeView === 'campaigns' ? 'active' : ''}`} 
          onClick={() => setActiveView('campaigns')}
          aria-selected={activeView === 'campaigns'}
        >
          <Send size={18} /> Campanhas & Envios
        </button>
        <button 
          className={`nav-btn ${activeView === 'library' ? 'active' : ''}`} 
          onClick={() => {
            setActiveView('library');
            if (activeView !== 'library') setLibrarySection('contacts');
          }}
          aria-selected={activeView === 'library'}
        >
          <LayoutGrid size={18} /> Base de Dados e Recursos
        </button>
      </nav>

      <div style={{ position: 'relative', minHeight: '400px' }}>
        {loading ? (
          <div className="skeleton-container">
            <div className="skeleton" style={{ height: '32px', width: '200px' }} />
            <div className="skeleton" style={{ height: '120px', width: '100%' }} />
            <div className="skeleton" style={{ height: '120px', width: '100%' }} />
          </div>
        ) : (
          <div className="fade-in">
            {activeView === 'campaigns' && (
              <CampaignsView 
                companyId={companyId} posts={posts} banners={banners} templates={templates} contacts={contacts}
                onReload={reloadPosts} showToast={showToast} goToLibrary={() => setActiveView('library')}
              />
            )}
            {activeView === 'library' && (
              <LibraryView 
                companyId={companyId} section={librarySection} setSection={setLibrarySection}
                banners={banners} templates={templates} contacts={contacts}
                reloadBanners={reloadBanners} reloadTemplates={reloadTemplates} reloadContacts={reloadContacts}
                showToast={showToast}
              />
            )}
          </div>
        )}
      </div>

      {/* Toasts */}
      <div className="toast-container" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' && <CheckCircle size={20} />}
            {t.type === 'error' && <XCircle size={20} />}
            {t.type === 'info' && <Info size={20} />}
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- CAMPAIGNS VIEW ---

function CampaignsView({ companyId, posts, banners, templates, contacts, onReload, showToast, goToLibrary }: any) {
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [selectedBanner, setSelectedBanner] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [messageText, setMessageText] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');

  const activeBanners = banners.filter((b: WhatsAppBanner) => b.is_active);

  const resetForm = () => {
    setShowForm(false);
    setSelectedBanner('');
    setSelectedTemplate('');
    setMessageText('');
    setSelectedContacts([]);
    setScheduledAt('');
  };

  const handleSelectAllContacts = () => {
    if (selectedContacts.length === contacts.length) setSelectedContacts([]);
    else setSelectedContacts(contacts.map((c: WhatsAppContact) => c.id));
  };

  const handleContactToggle = (contactId: string) => {
    setSelectedContacts(prev => prev.includes(contactId) ? prev.filter(id => id !== contactId) : [...prev, contactId]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedContacts.length === 0) return showToast('Selecione pelo menos um destinatário.', 'error');
    if (!selectedTemplate && !messageText.trim() && !selectedBanner) return showToast('Adicione uma mensagem ou banner.', 'error');

    setIsSaving(true);
    try {
      await createWhatsAppPost(companyId, {
        banner_id: selectedBanner || null,
        template_id: selectedTemplate || null,
        message_text: selectedTemplate ? null : messageText,
        recipient_ids: selectedContacts,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null
      });
      showToast('Campanha criada com sucesso!', 'success');
      onReload();
      resetForm();
    } catch (error) {
      console.error(error);
      showToast('Erro ao criar campanha.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async (postId: string) => {
    if (!confirm('Deseja cancelar esta postagem?')) return;
    setCancellingId(postId);
    try {
      await cancelWhatsAppPost(postId);
      showToast('Postagem cancelada.', 'info');
      onReload();
    } catch (error) {
      console.error(error);
      showToast('Erro ao cancelar.', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {!showForm ? (
        <div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)' }}>
          <div>
            <h3>Criar Nova Campanha</h3>
            <p>Envie mensagens promocionais ou informativas para seus clientes.</p>
          </div>
          <button className="primary" onClick={() => setShowForm(true)}>
            <Plus size={18}/> Nova Campanha
          </button>
        </div>
      ) : (
        <form className="panel slide-down" onSubmit={handleSubmit} style={{ border: '1px solid var(--border-focus)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <div>
              <h3>Configurar Nova Campanha</h3>
              <p>Preencha os detalhes do envio.</p>
            </div>
            <button type="button" onClick={resetForm} className="secondary" style={{ padding: '6px' }} aria-label="Fechar">
              <X size={18}/>
            </button>
          </div>

          <div className="form-grid">
            <label>
              Banner (Opcional)
              <select value={selectedBanner} onChange={e => setSelectedBanner(e.target.value)} disabled={isSaving}>
                <option value="">Nenhum (Apenas texto)</option>
                {activeBanners.map((b: WhatsAppBanner) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {banners.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Nenhum banner na biblioteca. <a href="#" onClick={(e) => { e.preventDefault(); goToLibrary(); }} style={{ color: 'var(--border-focus)' }}>Adicionar</a></span>}
            </label>

            <label>
              Template de Texto (Opcional)
              <select value={selectedTemplate} onChange={e => { setSelectedTemplate(e.target.value); if(e.target.value) setMessageText(''); }} disabled={isSaving}>
                <option value="">Mensagem Personalizada</option>
                {templates.map((t: WhatsAppPostTemplate) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>

          {!selectedTemplate && (
            <label style={{ marginTop: 'var(--space-4)' }}>
              Mensagem
              <textarea 
                rows={4} 
                placeholder="Digite a mensagem..." 
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                disabled={isSaving}
                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', fontFamily: 'inherit' }}
              />
            </label>
          )}

          {selectedTemplate && (
            <div style={{ marginTop: 'var(--space-4)', padding: '1rem', background: 'var(--bg-subtle)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}>
              <strong>Preview do Template:</strong>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                {templates.find((t: WhatsAppPostTemplate) => t.id === selectedTemplate)?.message_text}
              </div>
            </div>
          )}

          <label style={{ marginTop: 'var(--space-4)' }}>
            Destinatários ({selectedContacts.length} selecionados)
            <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-body)', marginTop: '8px' }}>
              {contacts.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Você não tem contatos. </span>
                  <a href="#" onClick={(e) => { e.preventDefault(); goToLibrary(); }} style={{ color: 'var(--border-focus)', fontSize: '0.9rem' }}>Adicionar na Biblioteca</a>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedContacts.length === contacts.length && contacts.length > 0} onChange={handleSelectAllContacts} disabled={isSaving} />
                      <strong>Selecionar Todos</strong>
                    </label>
                  </div>
                  {contacts.map((c: WhatsAppContact) => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.25rem 0', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input type="checkbox" value={c.id} checked={selectedContacts.includes(c.id)} onChange={() => handleContactToggle(c.id)} disabled={isSaving} />
                      {c.name} {c.segment && <span className="tag" style={{ fontSize: '0.7rem' }}>{c.segment}</span>}
                    </label>
                  ))}
                </>
              )}
            </div>
          </label>

          <label style={{ marginTop: 'var(--space-4)' }}>
            Data de Agendamento (Opcional)
            <input 
              type="datetime-local" 
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              disabled={isSaving}
              style={{ maxWidth: '300px' }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Deixe em branco para enviar imediatamente.</span>
          </label>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
            <button className="primary" type="submit" disabled={isSaving || (selectedContacts.length === 0)}>
              {isSaving ? 'Processando...' : (scheduledAt ? 'Agendar Campanha' : 'Enviar Agora')}
            </button>
            <button className="secondary" type="button" onClick={resetForm} disabled={isSaving}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
          <Clock size={20} />
          <h3 style={{ margin: 0 }}>Histórico de Campanhas</h3>
        </div>
        <p style={{ marginBottom: 'var(--space-4)' }}>Acompanhe os envios realizados e programados.</p>
        
        {posts.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem 1rem' }}>
            <Send size={48} className="text-muted" style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <h4>Nenhuma campanha encontrada</h4>
            <p>Suas postagens enviadas aparecerão aqui.</p>
          </div>
        ) : (
          <ul className="asset-list">
            {posts.map((post: WhatsAppPost) => (
              <li key={post.id} className="asset-row">
                <div className="asset-copy">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong>{post.scheduled_at ? `Agendado para ${new Date(post.scheduled_at).toLocaleString('pt-BR')}` : 'Envio Imediato'}</strong>
                    <span className={`tag ${post.status === 'sent' ? 'success' : post.status === 'failed' ? 'danger' : ''}`}>
                      {post.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Destinatários: {post.recipient_count}
                  </p>
                </div>
                {post.status === 'pending' && (
                  <div className="asset-actions">
                    <button type="button" className="danger" onClick={() => handleCancel(post.id)} disabled={cancellingId === post.id}>
                      {cancellingId === post.id ? '...' : 'Cancelar'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- LIBRARY VIEW ---

function LibraryView({ companyId, section, setSection, banners, templates, contacts, reloadBanners, reloadTemplates, reloadContacts, showToast }: any) {
  return (
    <div className="library-layout">
      <aside className="library-sidebar">
        <h4 style={{ padding: '0 12px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em' }}>Recursos</h4>
        <button className={`sidebar-btn ${section === 'contacts' ? 'active' : ''}`} onClick={() => setSection('contacts')}>
          <Users size={18}/> Clientes e Segmentos
        </button>
        <button className={`sidebar-btn ${section === 'templates' ? 'active' : ''}`} onClick={() => setSection('templates')}>
          <MessageSquare size={18}/> Textos Prontos
        </button>
        <button className={`sidebar-btn ${section === 'banners' ? 'active' : ''}`} onClick={() => setSection('banners')}>
          <ImageIcon size={18}/> Imagens e Banners
        </button>
      </aside>

      <main className="library-content fade-in">
         {section === 'contacts' && <ContactsSection companyId={companyId} contacts={contacts} onReload={reloadContacts} showToast={showToast} />}
         {section === 'templates' && <TemplatesSection companyId={companyId} templates={templates} onReload={reloadTemplates} showToast={showToast} />}
         {section === 'banners' && <BannersSection companyId={companyId} banners={banners} onReload={reloadBanners} showToast={showToast} />}
      </main>
    </div>
  );
}

// --- SECTIONS ---

function ContactsSection({ companyId, contacts, onReload, showToast }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentContact, setCurrentContact] = useState<Partial<WhatsAppContact> | null>(null);
  const [phonesInput, setPhonesInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentContact?.name?.trim() || !phonesInput.trim()) return showToast('Preencha o nome e o telefone.', 'error');
    
    const phone_numbers = phonesInput.split(',').map(p => p.replace(/\D/g, '')).filter(p => p.length > 0);
    if (phone_numbers.length === 0) return showToast('Número inválido.', 'error');

    setIsSaving(true);
    try {
      if (currentContact.id) await updateWhatsAppContact(currentContact.id, currentContact.name, phone_numbers, currentContact.segment || null);
      else await createWhatsAppContact(companyId, currentContact.name, phone_numbers, currentContact.segment || null);
      
      showToast('Contato salvo com sucesso!', 'success');
      onReload();
      setIsEditing(false);
      setCurrentContact(null);
      setPhonesInput('');
    } catch (error) {
      console.error(error);
      showToast('Erro ao salvar contato.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este contato?')) return;
    try {
      await deleteWhatsAppContact(id);
      showToast('Contato excluído.', 'info');
      onReload();
    } catch (error) {
      showToast('Erro ao excluir.', 'error');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      let jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
      
      if (jsonData.length === 0) {
        jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[];
        if (jsonData.length > 0) jsonData.shift();
      }
      
      const parsedContacts: any[] = [];
      for (const row of jsonData) {
        let name, phone, segment;
        if (Array.isArray(row)) { name = row[0]; phone = row[1]; segment = row[2]; }
        else if (typeof row === 'object' && row !== null) {
          const keys = Object.keys(row);
          name = row[keys.find(k => k.toLowerCase().includes('nome') || k.toLowerCase() === 'name') || keys[0]];
          phone = row[keys.find(k => k.toLowerCase().includes('telefone') || k.toLowerCase().includes('celular')) || keys[1]];
          segment = row[keys.find(k => k.toLowerCase().includes('segmento') || k.toLowerCase().includes('tag')) || keys[2]];
        }
        if (name && phone) {
          const cleanPhone = String(phone).replace(/\D/g, '');
          if (cleanPhone.length >= 8) parsedContacts.push({ name: String(name).trim(), phone: cleanPhone, segment: segment ? String(segment).trim() : undefined });
        }
      }

      if (parsedContacts.length === 0) return showToast('Nenhum contato válido encontrado no arquivo.', 'error');
      await importWhatsAppContacts(companyId, parsedContacts);
      showToast(`${parsedContacts.length} contatos importados!`, 'success');
      onReload();
    } catch (error) {
      showToast('Erro ao importar arquivo.', 'error');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filtered = contacts.filter((c: WhatsAppContact) => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone_numbers.some(p => p.includes(searchTerm)));

  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <h2>Clientes e Segmentos</h2>
          <p>Organize sua base de contatos para as campanhas.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <label className="upload-button">
            <input type="file" accept=".csv, .xlsx, .xls" disabled={isImporting || isEditing} onChange={handleImport} ref={fileInputRef} />
            <span className="button secondary" style={{ cursor: 'pointer' }}>{isImporting ? '...' : 'Importar Excel'}</span>
          </label>
          <button className="primary" onClick={() => { setIsEditing(true); setCurrentContact({ name: '', segment: '' }); setPhonesInput(''); }} disabled={isEditing}>
            <Plus size={18}/> Novo Contato
          </button>
        </div>
      </div>

      {isEditing && (
        <form className="form-grid compact slide-down" onSubmit={handleSave} style={{ marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
          <label>Nome <input type="text" placeholder="Ex: João Silva" value={currentContact?.name || ''} onChange={e => setCurrentContact({ ...currentContact, name: e.target.value })} disabled={isSaving}/></label>
          <label>Telefone <input type="text" placeholder="Ex: 5511999999999" value={phonesInput} onChange={e => setPhonesInput(e.target.value)} disabled={isSaving}/></label>
          <label>Segmento (Opcional) <input type="text" placeholder="Ex: VIP" value={currentContact?.segment || ''} onChange={e => setCurrentContact({ ...currentContact, segment: e.target.value })} disabled={isSaving}/></label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button type="submit" className="primary" disabled={isSaving}>Salvar</button>
            <button type="button" className="secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="search-wrapper">
        <Search size={18} className="search-icon" />
        <input type="text" className="search-input" placeholder="Buscar contatos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        {searchTerm && <button className="search-clear" onClick={() => setSearchTerm('')}><X size={16}/></button>}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Users size={48} className="text-muted" style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <h4>Nenhum contato</h4>
          <p>Adicione manualmente ou importe uma planilha.</p>
        </div>
      ) : (
        <ul className="asset-list">
          {filtered.map((c: WhatsAppContact) => (
            <li key={c.id} className="asset-row">
              <div className="asset-copy">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong>{c.name}</strong> 
                  {c.segment && <span className="tag success">{c.segment}</span>}
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{c.phone_numbers.join(', ')}</p>
              </div>
              <div className="asset-actions">
                <button type="button" className="secondary" onClick={() => { setCurrentContact(c); setPhonesInput(c.phone_numbers.join(', ')); setIsEditing(true); }}>
                  <Edit2 size={16}/>
                </button>
                <button type="button" className="danger" onClick={() => handleDelete(c.id)}>
                  <Trash2 size={16}/>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplatesSection({ companyId, templates, onReload, showToast }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<WhatsAppPostTemplate> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTemplate?.name?.trim() || !currentTemplate?.message_text?.trim()) return showToast('Preencha todos os campos.', 'error');
    setIsSaving(true);
    try {
      if (currentTemplate.id) await updateWhatsAppTemplate(currentTemplate.id, currentTemplate.name, currentTemplate.message_text);
      else await createWhatsAppTemplate(companyId, currentTemplate.name, currentTemplate.message_text);
      showToast('Template salvo!', 'success');
      onReload();
      setIsEditing(false);
    } catch (error) {
      showToast('Erro ao salvar.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este texto?')) return;
    try {
      await deleteWhatsAppTemplate(id);
      showToast('Excluído com sucesso.', 'info');
      onReload();
    } catch (error) {
      showToast('Erro ao excluir.', 'error');
    }
  };

  const insertVariable = (variable: string) => {
    if (currentTemplate) setCurrentTemplate({ ...currentTemplate, message_text: (currentTemplate.message_text || '') + variable });
  };

  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <h2>Textos Prontos</h2>
          <p>Crie modelos de mensagens para usar em suas campanhas.</p>
        </div>
        <button className="primary" onClick={() => { setIsEditing(true); setCurrentTemplate({ name: '', message_text: '' }); }} disabled={isEditing}>
          <Plus size={18}/> Novo Texto
        </button>
      </div>

      {isEditing && (
        <form className="form-grid compact slide-down" onSubmit={handleSave} style={{ marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
          <label style={{ gridColumn: '1 / -1' }}>Nome de Referência <input type="text" placeholder="Ex: Oferta de Natal" value={currentTemplate?.name || ''} onChange={e => setCurrentTemplate({ ...currentTemplate, name: e.target.value })} disabled={isSaving}/></label>
          <label style={{ gridColumn: '1 / -1' }}>
            Mensagem
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => insertVariable('{nome}')}>+ Nome</button>
              <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => insertVariable('{saudacao}')}>+ Saudação</button>
              <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => insertVariable('{empresa}')}>+ Empresa</button>
            </div>
            <textarea rows={5} value={currentTemplate?.message_text || ''} onChange={e => setCurrentTemplate({ ...currentTemplate, message_text: e.target.value })} disabled={isSaving} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', fontFamily: 'inherit' }}/>
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
            <button type="submit" className="primary" disabled={isSaving}>Salvar</button>
            <button type="button" className="secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancelar</button>
          </div>
        </form>
      )}

      {templates.length === 0 ? (
        <div className="empty-state">
          <MessageSquare size={48} className="text-muted" style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <h4>Nenhum texto salvo</h4>
          <p>Crie mensagens padronizadas para agilizar seus envios.</p>
        </div>
      ) : (
        <ul className="asset-list">
          {templates.map((tpl: WhatsAppPostTemplate) => (
            <li key={tpl.id} className="asset-row" style={{ alignItems: 'flex-start' }}>
              <div className="asset-copy" style={{ flex: 1 }}>
                <strong>{tpl.name}</strong>
                <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap', background: 'var(--bg-subtle)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  {tpl.message_text}
                </div>
              </div>
              <div className="asset-actions" style={{ flexDirection: 'column' }}>
                <button type="button" className="secondary" onClick={() => { setIsEditing(true); setCurrentTemplate(tpl); }}><Edit2 size={16}/></button>
                <button type="button" className="danger" onClick={() => handleDelete(tpl.id)}><Trash2 size={16}/></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BannersSection({ companyId, banners, onReload, showToast }: any) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      await uploadSingleWhatsAppBanner(companyId, file, file.name);
      showToast('Imagem adicionada com sucesso!', 'success');
      onReload();
    } catch (error) {
      showToast('Erro ao enviar imagem.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (banner: WhatsAppBanner) => {
    if (!confirm('Deseja excluir esta imagem?')) return;
    try {
      await deleteWhatsAppBanner(banner);
      showToast('Imagem excluída.', 'info');
      onReload();
    } catch (error) {
      showToast('Erro ao excluir.', 'error');
    }
  };

  const handleToggle = async (banner: WhatsAppBanner) => {
    try {
      await updateWhatsAppBannerStatus(banner.id, !banner.is_active);
      onReload();
    } catch (error) {
      showToast('Erro ao atualizar status.', 'error');
    }
  };

  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <h2>Imagens e Banners</h2>
          <p>Faça upload de fotos e artes para enviar nas mensagens.</p>
        </div>
        <label className="upload-button">
          <input type="file" accept="image/*" disabled={isUploading} onChange={handleFileChange} ref={fileInputRef} />
          <span className="button primary" style={{ cursor: 'pointer' }}>
            {isUploading ? 'Enviando...' : <><UploadCloud size={18}/> Novo Banner</>}
          </span>
        </label>
      </div>

      {banners.length === 0 ? (
        <div className="empty-state">
          <ImageIcon size={48} className="text-muted" style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <h4>Nenhuma imagem encontrada</h4>
          <p>Faça upload do seu primeiro banner promocional.</p>
        </div>
      ) : (
        <div className="image-grid">
          {banners.map((banner: WhatsAppBanner) => (
            <div key={banner.id} className="image-card" style={{ opacity: banner.is_active ? 1 : 0.6, transition: 'all 0.2s' }}>
              <img src={banner.file_url} alt={banner.name} className="image-card-thumb" />
              <div className="image-card-content">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '0.85rem' }}>{banner.name}</strong>
                  <span className={`tag ${banner.is_active ? 'success' : ''}`} style={{ fontSize: '0.65rem' }}>{banner.is_active ? 'ATIVO' : 'INATIVO'}</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatBytes(banner.file_size)}</span>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button type="button" className="secondary" style={{ flex: 1, padding: '4px' }} onClick={() => handleToggle(banner)}>
                    {banner.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={() => handleDelete(banner)}>
                    <Trash2 size={16}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
