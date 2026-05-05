import { useState, useCallback, useEffect } from 'react';
import type { WhatsAppBanner, WhatsAppPostTemplate, WhatsAppContact, WhatsAppPost } from '../types';
import { supabase } from '../lib/supabase';
import { formatBytes } from '../lib/utils';

type SubTab = 'banners' | 'templates' | 'contacts' | 'posts' | 'settings';

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
      // Mock data para UI inicial ou busca do Supabase (quando implementado RLS total)
      if (!supabase) return;

      const [resBanners, resTemplates, resContacts, resPosts] = await Promise.all([
        supabase.from('whatsapp_banners').select('*').eq('company_id', companyId),
        supabase.from('whatsapp_post_templates').select('*').eq('company_id', companyId),
        supabase.from('whatsapp_contacts').select('*').eq('company_id', companyId),
        supabase.from('whatsapp_posts').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
      ]);

      if (resBanners.data) setBanners(resBanners.data);
      if (resTemplates.data) setTemplates(resTemplates.data);
      if (resContacts.data) setContacts(resContacts.data);
      if (resPosts.data) setPosts(resPosts.data);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
        <button className={`tab-button ${activeSubTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveSubTab('settings')}>Configuração da API</button>
      </div>

      {loading && <p>Carregando dados do WhatsApp...</p>}

      {!loading && (
        <div className="whatsapp-content">
          {activeSubTab === 'banners' && <BannersSection banners={banners} />}
          {activeSubTab === 'templates' && <TemplatesSection templates={templates} />}
          {activeSubTab === 'contacts' && <ContactsSection contacts={contacts} />}
          {activeSubTab === 'posts' && <PostsSection posts={posts} banners={banners} templates={templates} contacts={contacts} />}
          {activeSubTab === 'settings' && <SettingsSection companyId={companyId} />}
        </div>
      )}
    </div>
  );
}

// --- Subcomponentes das Seções ---

function BannersSection({ banners }: { banners: WhatsAppBanner[] }) {
  return (
    <article className="panel">
      <header className="section-header">
        <div>
          <h3>Banners de Propaganda</h3>
          <p>Imagens que serão enviadas nas campanhas do WhatsApp.</p>
        </div>
        <button className="primary">Upload de Banner</button>
      </header>
      
      <div className="image-grid" style={{ marginTop: 'var(--space-4)' }}>
        {banners.length === 0 ? (
          <p className="empty-state">Nenhum banner cadastrado.</p>
        ) : (
          banners.map(banner => (
            <div key={banner.id} className="image-card">
              <img src={banner.file_url} alt={banner.name} className="image-card-thumb" />
              <div className="image-card-content">
                <strong>{banner.name}</strong>
                <span>{formatBytes(banner.file_size)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function TemplatesSection({ templates }: { templates: WhatsAppPostTemplate[] }) {
  return (
    <article className="panel">
      <header className="section-header">
        <div>
          <h3>Templates de Mensagens</h3>
          <p>Textos pré-definidos para agilizar a criação de campanhas.</p>
        </div>
        <button className="primary">+ Novo Template</button>
      </header>

      <ul className="asset-list" style={{ marginTop: 'var(--space-4)' }}>
        {templates.length === 0 ? (
          <p className="empty-state">Nenhum template cadastrado.</p>
        ) : (
          templates.map(tpl => (
            <li key={tpl.id} className="asset-row">
              <div className="asset-copy">
                <strong>{tpl.name}</strong>
                <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>{tpl.message_text}</p>
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

function SettingsSection({ companyId: _companyId }: { companyId: string }) {
  // TODO: Usar companyId para carregar credenciais específicas da empresa
  return (
    <article className="panel warning">
      <header className="section-header">
        <div>
          <h3>Integração com W-API (w-api.io)</h3>
          <p>Credenciais e status de conexão da API do WhatsApp.</p>
        </div>
      </header>
      
      <div className="form-grid" style={{ marginTop: 'var(--space-4)' }}>
        <p style={{ color: 'var(--text-danger)', fontSize: '0.9rem', marginBottom: 'var(--space-3)' }}>
          A integração real com a API de envios não está implementada nesta fase. Preencha os campos abaixo para preparar a conexão futura.
        </p>

        <label>
          API Key (W-API)
          <input type="password" placeholder="Insira sua chave de API secreta" />
        </label>

        <label>
          Instance ID
          <input type="text" placeholder="ID da sua instância na W-API" />
        </label>

        <label>
          Número Conectado (Read-only)
          <input type="text" disabled placeholder="+55 (00) 00000-0000" />
        </label>

        <div style={{ marginTop: 'var(--space-2)' }}>
          <button className="primary" type="button" disabled>Salvar Credenciais</button>
        </div>
      </div>
    </article>
  );
}