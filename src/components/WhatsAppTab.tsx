import { useState, useCallback, useEffect, useRef } from 'react';
import type { WhatsAppBanner, WhatsAppPostTemplate, WhatsAppContact, WhatsAppPost } from '../types';
import { 
  supabase, 
  listWhatsAppBanners,
  uploadSingleWhatsAppBanner, 
  deleteWhatsAppBanner, 
  updateWhatsAppBannerStatus,
  updateWhatsAppBanner,
  listWhatsAppTemplates,
  createWhatsAppTemplate,
  updateWhatsAppTemplate,
  deleteWhatsAppTemplate
} from '../lib/supabase';
import { formatBytes } from '../lib/utils';

type SubTab = 'banners' | 'templates' | 'contacts' | 'posts';

interface WhatsAppTabProps {
  companyId: string;
}

export function WhatsAppTab({ companyId }: WhatsAppTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('banners');
  const [loading, setLoading] = useState(false);

  // Estados locais para UI Mockada/Preparada
  const [banners, setBanners] = useState<WhatsAppBanner[]>([]);
  const [templates, setTemplates] = useState<WhatsAppPostTemplate[]>([]);
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [posts, setPosts] = useState<WhatsAppPost[]>([]);

  // TODO: Buscar dados reais via Supabase (a API do backend)
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (!supabase) return;

      const [resBanners, resTemplates, resContacts, resPosts] = await Promise.all([
        listWhatsAppBanners(companyId).then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
        listWhatsAppTemplates(companyId).then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
        supabase.from('whatsapp_contacts').select('*').eq('company_id', companyId),
        supabase.from('whatsapp_posts').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
      ]);

      if (resBanners.data) setBanners(resBanners.data as WhatsAppBanner[]);
      if (resTemplates.data) setTemplates(resTemplates.data as WhatsAppPostTemplate[]);
      if (resContacts.data) setContacts(resContacts.data);
      if (resPosts.data) setPosts(resPosts.data);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const reloadBanners = useCallback(async () => {
    try {
      const data = await listWhatsAppBanners(companyId);
      setBanners(data);
    } catch (err) {
      console.error('Failed to reload banners', err);
    }
  }, [companyId]);

  const reloadTemplates = useCallback(async () => {
    try {
      const data = await listWhatsAppTemplates(companyId);
      setTemplates(data);
    } catch (err) {
      console.error('Failed to reload templates', err);
    }
  }, [companyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="whatsapp-tab-container">
      <header className="section-header" style={{ marginBottom: 'var(--space-4)' }}>
        <div>
          <h3>Marketing via WhatsApp</h3>
          <p>Gerencie campanhas, contatos e automações de mensagens para seus clientes.</p>
        </div>
      </header>

      <div className="sub-tabs-list" style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-2)' }}>
        <button className={`tab-button ${activeSubTab === 'banners' ? 'active' : ''}`} onClick={() => setActiveSubTab('banners')}>Banners</button>
        <button className={`tab-button ${activeSubTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveSubTab('templates')}>Templates</button>
        <button className={`tab-button ${activeSubTab === 'contacts' ? 'active' : ''}`} onClick={() => setActiveSubTab('contacts')}>Contatos</button>
        <button className={`tab-button ${activeSubTab === 'posts' ? 'active' : ''}`} onClick={() => setActiveSubTab('posts')}>Postagens</button>
      </div>

      {loading && <p>Carregando dados do WhatsApp...</p>}

      {!loading && (
        <div className="whatsapp-content">
          {activeSubTab === 'banners' && <BannersSection companyId={companyId} banners={banners} onReload={reloadBanners} />}
          {activeSubTab === 'templates' && <TemplatesSection companyId={companyId} templates={templates} onReload={reloadTemplates} />}
          {activeSubTab === 'contacts' && <ContactsSection contacts={contacts} />}
          {activeSubTab === 'posts' && <PostsSection posts={posts} banners={banners} templates={templates} contacts={contacts} />}
        </div>
      )}
    </div>
  );
}

// --- Subcomponentes das Seções ---

function BannersSection({ companyId, banners, onReload }: { companyId: string, banners: WhatsAppBanner[], onReload: () => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<WhatsAppBanner | null>(null);
  const [bannerName, setBannerName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setShowForm(false);
    setEditingBanner(null);
    setBannerName('');
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!bannerName) setBannerName(file.name);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerName.trim()) {
      alert('Por favor, informe um nome para o banner.');
      return;
    }

    setIsUploading(true);
    try {
      if (editingBanner) {
        await updateWhatsAppBanner(editingBanner.id, bannerName);
      } else {
        if (!selectedFile) {
          alert('Por favor, selecione uma imagem.');
          setIsUploading(false);
          return;
        }
        await uploadSingleWhatsAppBanner(companyId, selectedFile, bannerName);
      }
      onReload();
      resetForm();
    } catch (error) {
      console.error('Error saving banner:', error);
      alert('Erro ao salvar o banner. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleEdit = (banner: WhatsAppBanner) => {
    setEditingBanner(banner);
    setBannerName(banner.name);
    setPreviewUrl(banner.file_url);
    setSelectedFile(null);
    setShowForm(true);
  };

  const handleDelete = async (banner: WhatsAppBanner) => {
    if (!confirm(`Tem certeza que deseja excluir o banner "${banner.name}"?`)) return;
    
    setDeletingId(banner.id);
    try {
      await deleteWhatsAppBanner(banner);
      onReload();
    } catch (error) {
      console.error('Error deleting banner:', error);
      alert('Erro ao excluir banner.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStatus = async (banner: WhatsAppBanner) => {
    setTogglingId(banner.id);
    try {
      await updateWhatsAppBannerStatus(banner.id, !banner.is_active);
      onReload();
    } catch (error) {
      console.error('Error updating banner status:', error);
      alert('Erro ao atualizar status do banner.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <article className="panel">
      <header className="section-header">
        <div>
          <h3>Banners de Propaganda</h3>
          <p>Imagens que serão enviadas nas campanhas do WhatsApp.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {isUploading && <span className="tag" aria-live="polite">Salvando...</span>}
          <button 
            className="primary" 
            onClick={() => { resetForm(); setShowForm(true); }}
            disabled={showForm || isUploading}
          >
            + Novo Banner
          </button>
        </div>
      </header>

      {showForm && (
        <form className="form-grid" onSubmit={handleSubmit} style={{ background: 'var(--bg-subtle)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginTop: 'var(--space-4)', border: '1px solid var(--border-default)' }}>
          <h4>{editingBanner ? 'Editar Banner' : 'Novo Banner'}</h4>
          
          {!editingBanner && (
            <label>
              Imagem do Banner
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange}
                disabled={isUploading}
                ref={fileInputRef}
              />
            </label>
          )}

          {previewUrl && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Preview:</p>
              <img src={previewUrl} alt="Preview" style={{ maxWidth: '200px', maxHeight: '200px', borderRadius: 'var(--radius-sm)' }} />
            </div>
          )}

          <label>
            Nome do Banner
            <input 
              type="text" 
              placeholder="Ex: Promoção de Natal" 
              value={bannerName}
              onChange={e => setBannerName(e.target.value)}
              disabled={isUploading}
            />
          </label>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <button type="submit" className="primary" disabled={isUploading}>
              {isUploading ? 'Salvando...' : 'Salvar Banner'}
            </button>
            <button type="button" className="secondary" onClick={resetForm} disabled={isUploading}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      
      <div className="image-grid" style={{ marginTop: 'var(--space-4)' }}>
        {banners.length === 0 ? (
          <p className="empty-state">Nenhum banner cadastrado.</p>
        ) : (
          banners.map(banner => (
            <div key={banner.id} className="image-card" style={{ opacity: banner.is_active ? 1 : 0.6 }}>
              <img src={banner.file_url} alt={banner.name} className="image-card-thumb" />
              <div className="image-card-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <strong>{banner.name}</strong>
                  <span className={`tag ${banner.is_active ? 'success' : 'default'}`} style={{ fontSize: '0.6rem' }}>
                    {banner.is_active ? 'ATIVO' : 'INATIVO'}
                  </span>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatBytes(banner.file_size)}</span>
                
                <div className="image-card-actions" style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button 
                    type="button" 
                    className="secondary" 
                    style={{ flex: 1, fontSize: '0.8rem', padding: '4px' }}
                    onClick={() => handleEdit(banner)}
                    disabled={showForm}
                  >
                    Editar
                  </button>
                  <button 
                    type="button" 
                    className="secondary" 
                    style={{ flex: 1, fontSize: '0.8rem', padding: '4px' }}
                    onClick={() => handleToggleStatus(banner)}
                    disabled={togglingId === banner.id}
                  >
                    {togglingId === banner.id ? '...' : banner.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button 
                    type="button" 
                    className="danger" 
                    style={{ flex: 1, fontSize: '0.8rem', padding: '4px' }}
                    onClick={() => handleDelete(banner)}
                    disabled={deletingId === banner.id}
                  >
                    {deletingId === banner.id ? '...' : 'Excluir'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function TemplatesSection({ companyId, templates, onReload }: { companyId: string, templates: WhatsAppPostTemplate[], onReload: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<WhatsAppPostTemplate> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const insertVariable = (variable: string) => {
    if (currentTemplate) {
      setCurrentTemplate({
        ...currentTemplate,
        message_text: (currentTemplate.message_text || '') + variable
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTemplate?.name?.trim() || !currentTemplate?.message_text?.trim()) {
      alert('Preencha o nome e a mensagem do template.');
      return;
    }

    setIsSaving(true);
    try {
      if (currentTemplate.id) {
        await updateWhatsAppTemplate(currentTemplate.id, currentTemplate.name, currentTemplate.message_text);
      } else {
        await createWhatsAppTemplate(companyId, currentTemplate.name, currentTemplate.message_text);
      }
      onReload();
      setIsEditing(false);
      setCurrentTemplate(null);
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Erro ao salvar template.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;
    setDeletingId(templateId);
    try {
      await deleteWhatsAppTemplate(templateId);
      onReload();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Erro ao excluir template.');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.message_text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <article className="panel">
      <header className="section-header">
        <div>
          <h3>Templates de Mensagens</h3>
          <p>Textos pré-definidos para agilizar a criação de campanhas. Use variáveis dinâmicas para personalizar.</p>
        </div>
        <button 
          className="primary" 
          onClick={() => { setIsEditing(true); setCurrentTemplate({ name: '', message_text: '' }); }}
          disabled={isEditing}
        >
          + Novo Template
        </button>
      </header>

      {isEditing && (
        <form className="form-grid" onSubmit={handleSave} style={{ background: 'var(--bg-subtle)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginTop: 'var(--space-4)', border: '1px solid var(--border-default)' }}>
          <h4>{currentTemplate?.id ? 'Editar Template' : 'Novo Template'}</h4>
          
          <label>
            Nome do Template
            <input 
              type="text" 
              placeholder="Ex: Promoção de Fim de Ano" 
              value={currentTemplate?.name || ''}
              onChange={e => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
              disabled={isSaving}
            />
          </label>

          <label>
            Texto da Mensagem
            <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => insertVariable('{nome}')}>+ Nome</button>
              <button type="button" className="secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => insertVariable('{saudacao}')}>+ Saudação (Bom dia/tarde)</button>
              <button type="button" className="secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => insertVariable('{empresa}')}>+ Nome da Empresa</button>
            </div>
            <textarea 
              rows={6} 
              placeholder="Olá {nome}! Temos uma oferta especial..." 
              value={currentTemplate?.message_text || ''}
              onChange={e => setCurrentTemplate({ ...currentTemplate, message_text: e.target.value })}
              disabled={isSaving}
              style={{ fontFamily: 'inherit' }}
            />
          </label>
          
          <div style={{ padding: '1rem', background: 'var(--bg-body)', border: '1px dashed var(--border-default)', borderRadius: '4px', fontSize: '0.9rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Preview (Simulação):</strong>
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {currentTemplate?.message_text 
                ? currentTemplate.message_text
                    .replace(/\{nome\}/g, 'João da Silva')
                    .replace(/\{saudacao\}/g, 'Boa tarde')
                    .replace(/\{empresa\}/g, 'Sua Empresa') 
                : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhuma mensagem informada.</span>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <button type="submit" className="primary" disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar Template'}
            </button>
            <button type="button" className="secondary" onClick={() => { setIsEditing(false); setCurrentTemplate(null); }} disabled={isSaving}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div style={{ marginTop: 'var(--space-4)', position: 'relative' }}>
        <input 
          type="text" 
          placeholder="Buscar templates por nome ou conteúdo..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ width: '100%', marginBottom: 'var(--space-4)', paddingRight: '2rem' }}
        />
        {searchTerm && (
          <button 
            type="button"
            onClick={() => setSearchTerm('')}
            style={{ position: 'absolute', right: '0.5rem', top: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        )}
      </div>

      <ul className="asset-list">
        {filteredTemplates.length === 0 ? (
          <p className="empty-state">
            {searchTerm ? 'Nenhum template encontrado para sua busca.' : 'Nenhum template cadastrado.'}
          </p>
        ) : (
          filteredTemplates.map(tpl => (
            <li key={tpl.id} className="asset-row" style={{ alignItems: 'flex-start' }}>
              <div className="asset-copy" style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{tpl.name}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(tpl.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div style={{ 
                  fontSize: '0.85rem', 
                  marginTop: '0.5rem', 
                  whiteSpace: 'pre-wrap',
                  background: 'var(--bg-subtle)',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  {tpl.message_text}
                </div>
              </div>
              <div className="asset-actions" style={{ marginLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button 
                  type="button" 
                  className="secondary" 
                  onClick={() => { setIsEditing(true); setCurrentTemplate(tpl); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={isEditing}
                >
                  Editar
                </button>
                <button 
                  type="button" 
                  className="danger" 
                  onClick={() => handleDelete(tpl.id)}
                  disabled={deletingId === tpl.id || isEditing}
                >
                  {deletingId === tpl.id ? '...' : 'Excluir'}
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </article>
  );
}

function ContactsSection({ contacts }: { contacts: WhatsAppContact[] }) {
  return (
    <article className="panel">
      <header className="section-header">
        <div>
          <h3>Contatos e Segmentos</h3>
          <p>Gerencie listas de transmissão e números de telefone.</p>
        </div>
        <button className="primary">+ Novo Contato/Lista</button>
      </header>

      <ul className="asset-list" style={{ marginTop: 'var(--space-4)' }}>
        {contacts.length === 0 ? (
          <p className="empty-state">Nenhum contato cadastrado.</p>
        ) : (
          contacts.map(c => (
            <li key={c.id} className="asset-row">
              <div className="asset-copy">
                <strong>{c.name} {c.segment && <span className="tag">{c.segment}</span>}</strong>
                <p style={{ fontSize: '0.8rem' }}>{c.phone_numbers.length} número(s) cadastrado(s)</p>
              </div>
            </li>
          ))
        )}
      </ul>
    </article>
  );
}

function PostsSection({ posts, banners, templates, contacts }: { posts: WhatsAppPost[], banners: WhatsAppBanner[], templates: WhatsAppPostTemplate[], contacts: WhatsAppContact[] }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <article className="panel">
      <header className="section-header">
        <div>
          <h3>Histórico e Agendamentos</h3>
          <p>Postagens enviadas e programadas para envio.</p>
        </div>
        <button className="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar Agendamento' : '+ Nova Postagem'}
        </button>
      </header>

      {showForm && (
        <form className="form-grid" style={{ background: 'var(--bg-subtle)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', border: '1px solid var(--border-default)' }} onSubmit={e => e.preventDefault()}>
          <h4>Criar Nova Postagem</h4>
          
          <label>
            Banner (Opcional)
            <select>
              <option value="">Nenhum (Apenas texto)</option>
              {banners.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>

          <label>
            Template (Opcional)
            <select>
              <option value="">Personalizado</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          <label>
            Mensagem Personalizada
            <textarea rows={4} placeholder="Digite a mensagem que acompanhará o envio..." />
          </label>

          <label>
            Destinatários
            <select multiple size={3}>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.segment || 'Geral'})</option>)}
            </select>
          </label>

          <label>
            Data de Agendamento (Deixe em branco para enviar agora)
            <input type="datetime-local" />
          </label>

          <div style={{ marginTop: 'var(--space-2)' }}>
            <button className="primary" type="button">Agendar / Enviar Postagem</button>
          </div>
        </form>
      )}

      <ul className="asset-list" style={{ marginTop: 'var(--space-4)' }}>
        {posts.length === 0 ? (
          <p className="empty-state">Nenhuma postagem agendada ou enviada.</p>
        ) : (
          posts.map(p => (
            <li key={p.id} className="asset-row">
              <div className="asset-copy">
                <strong>Postagem para {p.recipient_count} contatos</strong>
                <p style={{ fontSize: '0.8rem' }}>
                  Status: <span className={`tag ${p.status === 'sent' ? 'success' : p.status === 'failed' ? 'danger' : ''}`}>{p.status.toUpperCase()}</span>
                </p>
                {p.scheduled_at && <span style={{ fontSize: '0.75rem' }}>Agendado para: {new Date(p.scheduled_at).toLocaleString('pt-BR')}</span>}
              </div>
            </li>
          ))
        )}
      </ul>
    </article>
  );
}

