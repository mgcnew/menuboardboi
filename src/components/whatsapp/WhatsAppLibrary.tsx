import { useState, useRef, useMemo, useCallback } from 'react';
import {
  Users, MessageSquare, Image as ImageIcon, Plus, Trash2, Edit2,
  UploadCloud, Search, X, Copy, Eye, Send
} from 'lucide-react';
import type { WhatsAppBanner, WhatsAppPostTemplate, WhatsAppContact } from '../../types';
import {
  uploadSingleWhatsAppBanner, deleteWhatsAppBanner, updateWhatsAppBannerStatus,
  createWhatsAppTemplate, updateWhatsAppTemplate, deleteWhatsAppTemplate,
  createWhatsAppContact, updateWhatsAppContact, deleteWhatsAppContact, importWhatsAppContacts
} from '../../lib/supabase';
import { formatBytes } from '../../lib/utils';
import * as XLSX from 'xlsx';

type LibrarySection = 'contacts' | 'templates' | 'banners';
type ToastFn = (msg: string, type: 'success' | 'error' | 'info') => void;

interface LibraryViewProps {
  companyId: string;
  section: LibrarySection;
  setSection: (s: LibrarySection) => void;
  banners: WhatsAppBanner[];
  templates: WhatsAppPostTemplate[];
  contacts: WhatsAppContact[];
  reloadBanners: () => void;
  reloadTemplates: () => void;
  reloadContacts: () => void;
  showToast: ToastFn;
  onQuickSend?: (bannerId: string) => void;
}

export function LibraryView({ companyId, section, setSection, banners, templates, contacts, reloadBanners, reloadTemplates, reloadContacts, showToast, onQuickSend }: LibraryViewProps) {
  return (
    <div className="library-layout">
      <aside className="library-sidebar">
        <h4 style={{ padding: '0 12px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em' }}>Recursos</h4>
        <button className={`sidebar-btn ${section === 'contacts' ? 'active' : ''}`} onClick={() => setSection('contacts')}>
          <Users size={18} /> Clientes ({contacts.length})
        </button>
        <button className={`sidebar-btn ${section === 'templates' ? 'active' : ''}`} onClick={() => setSection('templates')}>
          <MessageSquare size={18} /> Textos ({templates.length})
        </button>
        <button className={`sidebar-btn ${section === 'banners' ? 'active' : ''}`} onClick={() => setSection('banners')}>
          <ImageIcon size={18} /> Banners ({banners.length})
        </button>
      </aside>
      <main className="library-content fade-in">
        {section === 'contacts' && <ContactsSection companyId={companyId} contacts={contacts} onReload={reloadContacts} showToast={showToast} />}
        {section === 'templates' && <TemplatesSection companyId={companyId} templates={templates} onReload={reloadTemplates} showToast={showToast} />}
        {section === 'banners' && <BannersSection companyId={companyId} banners={banners} onReload={reloadBanners} showToast={showToast} onQuickSend={onQuickSend} />}
      </main>
    </div>
  );
}

// ── CONTACTS ──

function ContactsSection({ companyId, contacts, onReload, showToast }: { companyId: string; contacts: WhatsAppContact[]; onReload: () => void; showToast: ToastFn }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentContact, setCurrentContact] = useState<Partial<WhatsAppContact> | null>(null);
  const [phonesInput, setPhonesInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const segments = useMemo(() => {
    const s = new Set(contacts.map(c => c.segment).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [contacts]);

  const filtered = useMemo(() => contacts.filter(c => {
    const matchSearch = !searchTerm || c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone_numbers.some(p => p.includes(searchTerm));
    const matchSeg = !segmentFilter || c.segment === segmentFilter;
    return matchSearch && matchSeg;
  }), [contacts, searchTerm, segmentFilter]);

  const isPhoneValid = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    return clean.length >= 10 && clean.length <= 13;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentContact?.name?.trim() || !phonesInput.trim()) return showToast('Preencha o nome e o telefone.', 'error');
    const phone_numbers = phonesInput.split(',').map(p => p.replace(/\D/g, '')).filter(p => p.length > 0);
    if (phone_numbers.length === 0) return showToast('Número inválido.', 'error');
    setIsSaving(true);
    try {
      if (currentContact.id) await updateWhatsAppContact(currentContact.id, currentContact.name, phone_numbers, currentContact.segment || null);
      else await createWhatsAppContact(companyId, currentContact.name, phone_numbers, currentContact.segment || null);
      showToast('Contato salvo!', 'success');
      onReload();
      setIsEditing(false);
      setCurrentContact(null);
      setPhonesInput('');
    } catch {
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
    } catch {
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
      const parsed: any[] = [];
      for (const row of jsonData) {
        let name: any, phone: any, segment: any;
        if (Array.isArray(row)) { name = row[0]; phone = row[1]; segment = row[2]; }
        else if (typeof row === 'object' && row !== null) {
          const keys = Object.keys(row);
          name = row[keys.find(k => k.toLowerCase().includes('nome') || k.toLowerCase() === 'name') || keys[0]];
          phone = row[keys.find(k => k.toLowerCase().includes('telefone') || k.toLowerCase().includes('celular')) || keys[1]];
          segment = row[keys.find(k => k.toLowerCase().includes('segmento') || k.toLowerCase().includes('tag')) || keys[2]];
        }
        if (name && phone) {
          const cleanPhone = String(phone).replace(/\D/g, '');
          if (cleanPhone.length >= 8) parsed.push({ name: String(name).trim(), phone: cleanPhone, segment: segment ? String(segment).trim() : undefined });
        }
      }
      if (parsed.length === 0) return showToast('Nenhum contato válido.', 'error');
      await importWhatsAppContacts(companyId, parsed);
      showToast(`${parsed.length} contatos importados!`, 'success');
      onReload();
    } catch {
      showToast('Erro ao importar.', 'error');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportCSV = useCallback(() => {
    const rows = [['Nome', 'Telefone', 'Segmento']];
    contacts.forEach(c => rows.push([c.name, c.phone_numbers.join('; '), c.segment || '']));
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'contatos_whatsapp.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado!', 'success');
  }, [contacts, showToast]);

  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <h2>Clientes e Segmentos</h2>
          <p>{contacts.length} contatos · {segments.length} segmento{segments.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button type="button" className="secondary" onClick={handleExportCSV} disabled={contacts.length === 0} style={{ fontSize: '0.85rem' }}>Exportar CSV</button>
          <label className="upload-button">
            <input type="file" accept=".csv, .xlsx, .xls" disabled={isImporting || isEditing} onChange={handleImport} ref={fileInputRef} />
            <span className="button secondary" style={{ cursor: 'pointer' }}>{isImporting ? '...' : 'Importar Excel'}</span>
          </label>
          <button className="primary" onClick={() => { setIsEditing(true); setCurrentContact({ name: '', segment: '' }); setPhonesInput(''); }} disabled={isEditing}>
            <Plus size={18} /> Novo
          </button>
        </div>
      </div>

      {isEditing && (
        <form className="form-grid compact slide-down" onSubmit={handleSave} style={{ marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
          <label>Nome <input type="text" placeholder="Ex: João Silva" value={currentContact?.name || ''} onChange={e => setCurrentContact({ ...currentContact, name: e.target.value })} disabled={isSaving} /></label>
          <label>
            Telefone
            <input type="text" placeholder="Ex: 5511999999999" value={phonesInput} onChange={e => setPhonesInput(e.target.value)} disabled={isSaving}
              style={{ borderColor: phonesInput && !isPhoneValid(phonesInput) ? '#dc2626' : undefined }} />
            {phonesInput && !isPhoneValid(phonesInput) && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>Formato inválido (use DDI+DDD+número)</span>}
          </label>
          <label>Segmento <input type="text" placeholder="Ex: VIP" value={currentContact?.segment || ''} onChange={e => setCurrentContact({ ...currentContact, segment: e.target.value })} disabled={isSaving} /></label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button type="submit" className="primary" disabled={isSaving}>Salvar</button>
            <button type="button" className="secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="filter-bar">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input type="text" placeholder="Buscar contatos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: '100%', paddingLeft: '40px' }} />
          {searchTerm && <button type="button" style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }} onClick={() => setSearchTerm('')}><X size={16} /></button>}
        </div>
        {segments.length > 0 && (
          <select value={segmentFilter} onChange={e => setSegmentFilter(e.target.value)}>
            <option value="">Todos</option>
            {segments.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><Users size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} /><h4>Nenhum contato</h4><p>Adicione manualmente ou importe uma planilha.</p></div>
      ) : (
        <ul className="asset-list">
          {filtered.map(c => (
            <li key={c.id} className="asset-row">
              <div className="asset-copy">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong>{c.name}</strong>
                  {c.segment && <span className="tag success">{c.segment}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>{c.phone_numbers.join(', ')}</p>
                  {c.phone_numbers[0] && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: isPhoneValid(c.phone_numbers[0]) ? '#10b981' : '#ef4444', flexShrink: 0 }} title={isPhoneValid(c.phone_numbers[0]) ? 'Número válido' : 'Formato suspeito'} />
                  )}
                </div>
              </div>
              <div className="asset-actions">
                <button type="button" className="secondary" onClick={() => { setCurrentContact(c); setPhonesInput(c.phone_numbers.join(', ')); setIsEditing(true); }}><Edit2 size={16} /></button>
                <button type="button" className="danger" onClick={() => handleDelete(c.id)}><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── TEMPLATES ──

function TemplatesSection({ companyId, templates, onReload, showToast }: { companyId: string; templates: WhatsAppPostTemplate[]; onReload: () => void; showToast: ToastFn }) {
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Partial<WhatsAppPostTemplate> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current?.name?.trim() || !current?.message_text?.trim()) return showToast('Preencha todos os campos.', 'error');
    setIsSaving(true);
    try {
      if (current.id) await updateWhatsAppTemplate(current.id, current.name, current.message_text);
      else await createWhatsAppTemplate(companyId, current.name, current.message_text);
      showToast('Template salvo!', 'success');
      onReload();
      setIsEditing(false);
    } catch {
      showToast('Erro ao salvar.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este texto?')) return;
    try { await deleteWhatsAppTemplate(id); showToast('Excluído.', 'info'); onReload(); }
    catch { showToast('Erro.', 'error'); }
  };

  const handleDuplicate = async (tpl: WhatsAppPostTemplate) => {
    try {
      await createWhatsAppTemplate(companyId, `${tpl.name} (cópia)`, tpl.message_text);
      showToast('Template duplicado!', 'success');
      onReload();
    } catch {
      showToast('Erro ao duplicar.', 'error');
    }
  };

  const insertVariable = (v: string) => {
    if (current) setCurrent({ ...current, message_text: (current.message_text || '') + v });
  };

  const charCount = current?.message_text?.length || 0;
  const charClass = charCount > 4096 ? 'danger' : charCount > 3686 ? 'warning' : '';

  return (
    <div className="panel">
      <div className="section-header">
        <div><h2>Textos Prontos</h2><p>Modelos de mensagens para campanhas.</p></div>
        <button className="primary" onClick={() => { setIsEditing(true); setCurrent({ name: '', message_text: '', category: '' }); }} disabled={isEditing}><Plus size={18} /> Novo</button>
      </div>

      {isEditing && (
        <form className="form-grid compact slide-down" onSubmit={handleSave} style={{ marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
          <label>Nome <input type="text" placeholder="Ex: Oferta de Natal" value={current?.name || ''} onChange={e => setCurrent({ ...current, name: e.target.value })} disabled={isSaving} /></label>
          <label>Categoria <input type="text" placeholder="Ex: Promoção, Feriado" value={current?.category || ''} onChange={e => setCurrent({ ...current, category: e.target.value })} disabled={isSaving} /></label>
          <label style={{ gridColumn: '1 / -1' }}>
            Mensagem
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => insertVariable('{nome}')}>+ Nome</button>
              <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => insertVariable('{saudacao}')}>+ Saudação</button>
              <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => insertVariable('{empresa}')}>+ Empresa</button>
            </div>
            <textarea rows={5} value={current?.message_text || ''} onChange={e => setCurrent({ ...current, message_text: e.target.value })} disabled={isSaving}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', fontFamily: 'inherit' }} />
            <div className={`char-counter ${charClass}`}>{charCount}/4096</div>
          </label>
          {current?.message_text && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Eye size={14} /> Preview</span>
              <div className="wa-bubble-preview">
                <div className="wa-bubble">
                  {current.message_text}
                  <span className="wa-bubble-time">agora</span>
                </div>
              </div>
            </div>
          )}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
            <button type="submit" className="primary" disabled={isSaving}>Salvar</button>
            <button type="button" className="secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancelar</button>
          </div>
        </form>
      )}

      {templates.length === 0 ? (
        <div className="empty-state"><MessageSquare size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} /><h4>Nenhum texto</h4><p>Crie modelos para agilizar envios.</p></div>
      ) : (
        <ul className="asset-list">
          {templates.map(tpl => (
            <li key={tpl.id} className="asset-row" style={{ alignItems: 'flex-start' }}>
              <div className="asset-copy" style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>{tpl.name}</strong>
                  {tpl.category && <span className="tag">{tpl.category}</span>}
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap', background: 'var(--bg-subtle)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  {tpl.message_text}
                </div>
              </div>
              <div className="asset-actions" style={{ flexDirection: 'column' }}>
                <button type="button" className="secondary" onClick={() => { setIsEditing(true); setCurrent(tpl); }}><Edit2 size={16} /></button>
                <button type="button" className="secondary" onClick={() => handleDuplicate(tpl)} title="Duplicar"><Copy size={16} /></button>
                <button type="button" className="danger" onClick={() => handleDelete(tpl.id)}><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── BANNERS ──

function BannersSection({ companyId, banners, onReload, showToast, onQuickSend }: { companyId: string; banners: WhatsAppBanner[]; onReload: () => void; showToast: ToastFn; onQuickSend?: (bannerId: string) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      await uploadSingleWhatsAppBanner(companyId, file, file.name);
      showToast('Imagem adicionada!', 'success');
      onReload();
    } catch {
      showToast('Erro ao enviar.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) await uploadFile(file);
    else showToast('Apenas imagens são aceitas.', 'error');
  };

  const handleDelete = async (banner: WhatsAppBanner) => {
    if (!confirm('Excluir esta imagem?')) return;
    try { await deleteWhatsAppBanner(banner); showToast('Excluída.', 'info'); onReload(); }
    catch { showToast('Erro.', 'error'); }
  };

  const handleToggle = async (banner: WhatsAppBanner) => {
    try { await updateWhatsAppBannerStatus(banner.id, !banner.is_active); onReload(); }
    catch { showToast('Erro ao atualizar.', 'error'); }
  };

  return (
    <div className="panel">
      <div className="section-header">
        <div><h2>Imagens e Banners</h2><p>Fotos e artes para usar nas mensagens.</p></div>
        <label className="upload-button">
          <input type="file" accept="image/*" disabled={isUploading} onChange={handleFileChange} ref={fileInputRef} />
          <span className="button primary" style={{ cursor: 'pointer' }}>{isUploading ? 'Enviando...' : <><UploadCloud size={18} /> Novo Banner</>}</span>
        </label>
      </div>

      {/* Drop zone */}
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{ marginBottom: 'var(--space-4)' }}
      >
        <UploadCloud size={32} className="drop-zone-icon" />
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {isDragging ? 'Solte a imagem aqui' : 'Arraste uma imagem ou clique para enviar'}
        </p>
      </div>

      {banners.length === 0 ? (
        <div className="empty-state"><ImageIcon size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} /><h4>Nenhuma imagem</h4><p>Faça upload do seu primeiro banner.</p></div>
      ) : (
        <div className="image-grid">
          {banners.map(banner => (
            <div key={banner.id} className="image-card" style={{ opacity: banner.is_active ? 1 : 0.6, transition: 'all 0.2s' }}>
              <img src={banner.file_url} alt={banner.name} className="image-card-thumb" onClick={() => setLightboxUrl(banner.file_url)} />
              <div className="image-card-content">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '0.85rem' }}>{banner.name}</strong>
                  <span className={`tag ${banner.is_active ? 'success' : ''}`} style={{ fontSize: '0.65rem' }}>{banner.is_active ? 'ATIVO' : 'INATIVO'}</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatBytes(banner.file_size)}</span>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button type="button" className="secondary" style={{ flex: 1, padding: '4px', fontSize: '0.78rem' }} onClick={() => handleToggle(banner)}>
                    {banner.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                  {onQuickSend && (
                    <button type="button" className="primary" title="Enviar Campanha Rápida" style={{ padding: '4px 8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => onQuickSend(banner.id)}>
                      <Send size={14} /> Enviar
                    </button>
                  )}
                  <button type="button" className="secondary" title="Copiar URL do banner" style={{ padding: '4px 8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => { navigator.clipboard.writeText(banner.file_url); showToast('URL copiada!', 'success'); }}>
                    <Copy size={14} />
                  </button>
                  <button type="button" className="danger" style={{ padding: '4px 8px' }} onClick={() => handleDelete(banner)}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={lightboxUrl} alt="Preview" className="lightbox-image" />
            <button className="lightbox-close" onClick={() => setLightboxUrl(null)}><X size={20} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
