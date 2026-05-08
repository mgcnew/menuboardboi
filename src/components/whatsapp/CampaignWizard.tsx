import { useState, useMemo } from 'react';
import {
  Send, Image as ImageIcon, MessageSquare, Eye, X, Check,
  ArrowLeft, ArrowRight, Radio, Users, ChevronDown
} from 'lucide-react';
import type { WhatsAppBanner, WhatsAppPostTemplate, WhatsAppContact } from '../../types';
import { createWhatsAppPost } from '../../lib/supabase';

type CampaignType = 'status' | 'direct';
type WizardStep = 1 | 2 | 3;

interface CampaignWizardProps {
  companyId: string;
  banners: WhatsAppBanner[];
  templates: WhatsAppPostTemplate[];
  contacts: WhatsAppContact[];
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  goToLibrary: () => void;
}

const CHAR_LIMIT = 4096;

export function CampaignWizard({
  companyId, banners, templates, contacts,
  onClose, onSuccess, showToast, goToLibrary
}: CampaignWizardProps) {
  const [campaignType, setCampaignType] = useState<CampaignType | null>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [isSaving, setIsSaving] = useState(false);

  // Step 1 state
  const [selectedBanner, setSelectedBanner] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [messageText, setMessageText] = useState('');

  // Step 2 state
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('');

  // Step 3 state
  const [scheduledAt, setScheduledAt] = useState('');

  const activeBanners = banners.filter(b => b.is_active);
  const selectedBannerObj = banners.find(b => b.id === selectedBanner);
  const selectedTemplateObj = templates.find(t => t.id === selectedTemplate);
  const finalText = selectedTemplate ? (selectedTemplateObj?.message_text || '') : messageText;

  const segments = useMemo(() => {
    const s = new Set(contacts.map(c => c.segment).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchSearch = !contactSearch ||
        c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        c.phone_numbers.some(p => p.includes(contactSearch));
      const matchSegment = !segmentFilter || c.segment === segmentFilter;
      return matchSearch && matchSegment;
    });
  }, [contacts, contactSearch, segmentFilter]);

  const canAdvanceStep1 = campaignType && (selectedBanner || selectedTemplate || messageText.trim());
  const canAdvanceStep2 = selectedContacts.length > 0;

  const handleContactToggle = (id: string) => {
    setSelectedContacts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    const ids = filteredContacts.map(c => c.id);
    const allSelected = ids.every(id => selectedContacts.includes(id));
    if (allSelected) {
      setSelectedContacts(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedContacts(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const handleSelectSegment = (seg: string) => {
    const ids = contacts.filter(c => c.segment === seg).map(c => c.id);
    const allIn = ids.every(id => selectedContacts.includes(id));
    if (allIn) {
      setSelectedContacts(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedContacts(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const handleSubmit = async () => {
    if (selectedContacts.length === 0) return showToast('Selecione destinatários.', 'error');
    if (!selectedTemplate && !messageText.trim() && !selectedBanner) return showToast('Adicione conteúdo.', 'error');
    if (scheduledAt) {
      const d = new Date(scheduledAt);
      if (isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        return showToast('Escolha um horário futuro.', 'error');
      }
    }
    setIsSaving(true);
    try {
      await createWhatsAppPost(companyId, {
        banner_id: selectedBanner || null,
        template_id: selectedTemplate || null,
        message_text: selectedTemplate ? null : messageText,
        recipient_ids: selectedContacts,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null
      });
      showToast(scheduledAt ? 'Campanha agendada!' : 'Campanha enviada!', 'success');
      onSuccess();
      onClose();
    } catch {
      showToast('Erro ao criar campanha.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const charCount = finalText.length;
  const charClass = charCount > CHAR_LIMIT ? 'danger' : charCount > CHAR_LIMIT * 0.9 ? 'warning' : '';

  return (
    <div className="panel slide-down" style={{ border: '1px solid var(--border-focus)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
        <div>
          <h3>Nova Campanha</h3>
          <p>Configure e envie sua campanha de marketing.</p>
        </div>
        <button type="button" onClick={onClose} className="secondary" style={{ padding: '6px' }} aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      {/* Campaign Type Selector (before wizard starts) */}
      {!campaignType ? (
        <div>
          <h4 style={{ marginBottom: 'var(--space-3)' }}>Que tipo de campanha você quer criar?</h4>
          <div className="campaign-type-selector">
            <button
              type="button"
              className="campaign-type-card"
              onClick={() => setCampaignType('status')}
            >
              <div className="type-icon"><Radio size={24} /></div>
              <span className="type-title">Postar no Status</span>
              <span className="type-desc">Publique imagens e textos no seu status do WhatsApp para todos os contatos verem.</span>
            </button>
            <button
              type="button"
              className="campaign-type-card"
              onClick={() => setCampaignType('direct')}
            >
              <div className="type-icon"><Send size={24} /></div>
              <span className="type-title">Enviar Mensagem</span>
              <span className="type-desc">Envie mensagens diretas com banners e textos para contatos selecionados.</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Wizard Stepper */}
          <div className="wizard-stepper">
            <div className={`wizard-step ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}>
              <span className="wizard-step-number">{step > 1 ? <Check size={14} /> : '1'}</span>
              <span>Conteúdo</span>
            </div>
            <div className={`wizard-step-line ${step > 1 ? 'completed' : ''}`} />
            <div className={`wizard-step ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`}>
              <span className="wizard-step-number">{step > 2 ? <Check size={14} /> : '2'}</span>
              <span>Destinatários</span>
            </div>
            <div className={`wizard-step-line ${step > 2 ? 'completed' : ''}`} />
            <div className={`wizard-step ${step === 3 ? 'active' : ''}`}>
              <span className="wizard-step-number">3</span>
              <span>Revisão</span>
            </div>
          </div>

          {/* Step 1: Content */}
          {step === 1 && (
            <div className="fade-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-2)' }}>
                <span className="tag">{campaignType === 'status' ? 'Status' : 'Mensagem Direta'}</span>
                <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '0.78rem' }}
                  onClick={() => { setCampaignType(null); setStep(1); }}>Trocar tipo</button>
              </div>

              <div className="form-grid" style={{ marginTop: 'var(--space-3)' }}>
                <label>
                  Banner (Opcional)
                  <select value={selectedBanner} onChange={e => setSelectedBanner(e.target.value)}>
                    <option value="">Nenhum (Apenas texto)</option>
                    {activeBanners.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  {banners.length === 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Nenhum banner. <a href="#" onClick={e => { e.preventDefault(); goToLibrary(); }} style={{ color: 'var(--border-focus)' }}>Adicionar</a>
                    </span>
                  )}
                </label>
                <label>
                  Template de Texto (Opcional)
                  <select value={selectedTemplate} onChange={e => { setSelectedTemplate(e.target.value); if (e.target.value) setMessageText(''); }}>
                    <option value="">Mensagem Personalizada</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              </div>

              {/* Banner Preview */}
              {selectedBannerObj && (
                <div className="banner-preview-card">
                  <img src={selectedBannerObj.file_url} alt={selectedBannerObj.name} />
                </div>
              )}

              {/* Text Area or Template Preview */}
              {!selectedTemplate ? (
                <label style={{ marginTop: 'var(--space-4)' }}>
                  Mensagem
                  <textarea
                    rows={4}
                    placeholder="Digite a mensagem..."
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', fontFamily: 'inherit' }}
                  />
                  <div className={`char-counter ${charClass}`}>{charCount}/{CHAR_LIMIT}</div>
                </label>
              ) : (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Preview do Template:</strong>
                  <div className="wa-bubble-preview">
                    <div className="wa-bubble">
                      {selectedBannerObj && <img src={selectedBannerObj.file_url} alt="" className="wa-bubble-image" />}
                      {selectedTemplateObj?.message_text}
                      <span className="wa-bubble-time">agora</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Inline preview if custom text */}
              {!selectedTemplate && (messageText.trim() || selectedBannerObj) && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Eye size={14} /> Preview</span>
                  <div className="wa-bubble-preview">
                    <div className="wa-bubble">
                      {selectedBannerObj && <img src={selectedBannerObj.file_url} alt="" className="wa-bubble-image" />}
                      {messageText || '(sem texto)'}
                      <span className="wa-bubble-time">agora</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Recipients */}
          {step === 2 && (
            <div className="fade-in">
              <p style={{ marginBottom: 'var(--space-3)', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Selecione os contatos que receberão esta campanha.
              </p>

              {/* Selected chips */}
              {selectedContacts.length > 0 && (
                <div className="chips-container">
                  {selectedContacts.slice(0, 10).map(id => {
                    const c = contacts.find(x => x.id === id);
                    return c ? (
                      <span key={id} className="chip">
                        {c.name}
                        <button type="button" className="chip-remove" onClick={() => handleContactToggle(id)}>
                          <X size={10} />
                        </button>
                      </span>
                    ) : null;
                  })}
                  {selectedContacts.length > 10 && (
                    <span className="chip" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
                      +{selectedContacts.length - 10} mais
                    </span>
                  )}
                </div>
              )}

              {/* Filter bar */}
              <div className="filter-bar">
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Buscar contatos..."
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    style={{ width: '100%', paddingLeft: '12px' }}
                  />
                </div>
                {segments.length > 0 && (
                  <select value={segmentFilter} onChange={e => setSegmentFilter(e.target.value)}>
                    <option value="">Todos segmentos</option>
                    {segments.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>

              {/* Segment quick select */}
              {segments.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>Selecionar por segmento:</span>
                  {segments.map(seg => {
                    const ids = contacts.filter(c => c.segment === seg).map(c => c.id);
                    const allIn = ids.every(id => selectedContacts.includes(id));
                    return (
                      <button key={seg} type="button" className={`status-pill ${allIn ? 'active' : ''}`} onClick={() => handleSelectSegment(seg)}>
                        {seg} ({ids.length})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Contact list */}
              <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', maxHeight: '280px', overflowY: 'auto', background: 'var(--bg-body)' }}>
                {contacts.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Sem contatos. </span>
                    <a href="#" onClick={e => { e.preventDefault(); goToLibrary(); }} style={{ color: 'var(--border-focus)', fontSize: '0.9rem' }}>Adicionar na Biblioteca</a>
                  </div>
                ) : (
                  <>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-body)', zIndex: 1 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={filteredContacts.length > 0 && filteredContacts.every(c => selectedContacts.includes(c.id))}
                          onChange={handleSelectAll}
                        />
                        <strong>Selecionar Todos ({filteredContacts.length})</strong>
                      </label>
                    </div>
                    {filteredContacts.map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.88rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={() => handleContactToggle(c.id)} />
                        <span style={{ flex: 1 }}>{c.name}</span>
                        {c.segment && <span className="tag" style={{ fontSize: '0.68rem' }}>{c.segment}</span>}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.phone_numbers[0]}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                {selectedContacts.length} contato{selectedContacts.length !== 1 ? 's' : ''} selecionado{selectedContacts.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="fade-in">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                {/* Left: summary */}
                <div>
                  <h4 style={{ marginBottom: 'var(--space-3)' }}>Resumo da Campanha</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <div>
                      <span className="eyebrow">Tipo</span>
                      <p style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{campaignType === 'status' ? '📡 Postar no Status' : '💬 Mensagem Direta'}</p>
                    </div>
                    <div>
                      <span className="eyebrow">Banner</span>
                      <p style={{ color: 'var(--text-primary)' }}>{selectedBannerObj?.name || 'Nenhum'}</p>
                    </div>
                    <div>
                      <span className="eyebrow">Texto</span>
                      <p style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>{finalText ? `${finalText.slice(0, 100)}${finalText.length > 100 ? '...' : ''}` : 'Nenhum'}</p>
                    </div>
                    <div>
                      <span className="eyebrow">Destinatários</span>
                      <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedContacts.length} contato{selectedContacts.length !== 1 ? 's' : ''}</p>
                    </div>

                    <label style={{ marginTop: 'var(--space-2)' }}>
                      Agendar para (opcional)
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={e => setScheduledAt(e.target.value)}
                        style={{ maxWidth: '280px' }}
                      />
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Em branco = enviar imediatamente</span>
                    </label>
                  </div>
                </div>

                {/* Right: preview */}
                <div>
                  <h4 style={{ marginBottom: 'var(--space-3)' }}>Preview</h4>
                  <div style={{ background: '#e5ddd5', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', minHeight: '200px' }}>
                    <div className="wa-bubble-preview" style={{ margin: 0, maxWidth: '100%' }}>
                      <div className="wa-bubble">
                        {selectedBannerObj && <img src={selectedBannerObj.file_url} alt="" className="wa-bubble-image" />}
                        {finalText || '(sem texto)'}
                        <span className="wa-bubble-time">{scheduledAt ? new Date(scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'agora'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Wizard Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
            <button type="button" className="secondary" onClick={() => step === 1 ? setCampaignType(null) : setStep((step - 1) as WizardStep)}>
              <ArrowLeft size={16} /> {step === 1 ? 'Trocar tipo' : 'Voltar'}
            </button>
            {step < 3 ? (
              <button
                type="button"
                className="primary"
                disabled={step === 1 ? !canAdvanceStep1 : !canAdvanceStep2}
                onClick={() => setStep((step + 1) as WizardStep)}
              >
                Próximo <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={isSaving}
                onClick={() => void handleSubmit()}
              >
                {isSaving ? 'Processando...' : (scheduledAt ? '📅 Agendar Campanha' : '🚀 Enviar Agora')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
