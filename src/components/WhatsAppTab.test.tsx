import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WhatsAppTab } from './WhatsAppTab';
import * as supabaseLib from '../lib/supabase';

// Mock Supabase functions
vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [] }))
          })),
        })),
      })),
    },
    listWhatsAppBanners: vi.fn().mockResolvedValue([]),
    uploadWhatsAppBanners: vi.fn(),
    uploadSingleWhatsAppBanner: vi.fn(),
    deleteWhatsAppBanner: vi.fn(),
    updateWhatsAppBannerStatus: vi.fn(),
    updateWhatsAppBanner: vi.fn(),
    listWhatsAppTemplates: vi.fn().mockResolvedValue([]),
    createWhatsAppTemplate: vi.fn(),
    updateWhatsAppTemplate: vi.fn(),
  deleteWhatsAppTemplate: vi.fn(),
  listWhatsAppContacts: vi.fn().mockResolvedValue([]),
  createWhatsAppContact: vi.fn(),
  updateWhatsAppContact: vi.fn(),
  deleteWhatsAppContact: vi.fn(),
  importWhatsAppContacts: vi.fn(),
  };
});

describe('WhatsAppTab - Contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles contact search and creation', async () => {
    const mockContacts = [
      { id: '1', company_id: 'test-company', name: 'João', phone_numbers: ['5511999999999'], segment: 'VIP', created_at: '' },
    ];
    
    vi.mocked(supabaseLib.listWhatsAppContacts).mockResolvedValue(mockContacts);

    render(<WhatsAppTab companyId="test-company" />);

    // Switch to Contacts tab
    await waitFor(() => {
      expect(screen.queryByText('Contatos')).not.toBeNull();
    });
    fireEvent.click(screen.getByText('Contatos'));

    await waitFor(() => {
      expect(screen.queryByText('João')).not.toBeNull();
    });

    // Test Search
    const searchInput = screen.getByPlaceholderText('Buscar contatos por nome, telefone ou segmento...');
    fireEvent.change(searchInput, { target: { value: 'Inexistente' } });
    expect(screen.queryByText('João')).toBeNull();

    fireEvent.change(searchInput, { target: { value: 'VIP' } });
    expect(screen.queryByText('João')).not.toBeNull();

    // Test New Contact
    fireEvent.click(screen.getByText('+ Novo Contato'));
    
    const nameInput = screen.getByPlaceholderText('Ex: João da Silva');
    const phoneInput = screen.getByPlaceholderText('Ex: 5511999999999, 5511888888888');
    
    fireEvent.change(nameInput, { target: { value: 'Maria' } });
    fireEvent.change(phoneInput, { target: { value: '5511888888888' } });

    fireEvent.click(screen.getByText('Salvar Contato'));

    expect(supabaseLib.createWhatsAppContact).toHaveBeenCalledWith('test-company', 'Maria', ['5511888888888'], null);
  });
});

describe('WhatsAppTab - Banners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<WhatsAppTab companyId="test-company" />);
    expect(screen.queryByText('Carregando dados do WhatsApp...')).not.toBeNull();
  });

  it('loads and displays banners', async () => {
    const mockBanners = [
      { id: '1', company_id: 'test-company', name: 'Promo 1.jpg', file_url: 'http://test/1.jpg', file_size: 1024, is_active: true, created_at: '', updated_at: '' },
    ];
    
    vi.mocked(supabaseLib.listWhatsAppBanners).mockResolvedValue(mockBanners);

    render(<WhatsAppTab companyId="test-company" />);

    await waitFor(() => {
      expect(screen.queryByText('Carregando dados do WhatsApp...')).toBeNull();
    });

    expect(screen.queryByText('Promo 1.jpg')).not.toBeNull();
    expect(screen.queryByText('ATIVO')).not.toBeNull();
  });

  it('handles banner status toggle', async () => {
    const mockBanners = [
      { id: '1', company_id: 'test-company', name: 'Promo 1.jpg', file_url: 'http://test/1.jpg', file_size: 1024, is_active: true, created_at: '', updated_at: '' },
    ];
    
    vi.mocked(supabaseLib.listWhatsAppBanners).mockResolvedValue(mockBanners);
    vi.mocked(supabaseLib.updateWhatsAppBannerStatus).mockResolvedValue();

    render(<WhatsAppTab companyId="test-company" />);

    await waitFor(() => {
      expect(screen.queryByText('Desativar')).not.toBeNull();
    });

    fireEvent.click(screen.getByText('Desativar'));

    expect(supabaseLib.updateWhatsAppBannerStatus).toHaveBeenCalledWith('1', false);
  });
});

describe('WhatsAppTab - Templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles template search and variables', async () => {
    const mockTemplates = [
      { id: '1', company_id: 'test-company', name: 'Oferta', message_text: 'Olá {nome}', created_at: '' },
    ];
    
    vi.mocked(supabaseLib.listWhatsAppTemplates).mockResolvedValue(mockTemplates);

    render(<WhatsAppTab companyId="test-company" />);

    // Switch to Templates tab
    await waitFor(() => {
      expect(screen.queryByText('Templates')).not.toBeNull();
    });
    fireEvent.click(screen.getByText('Templates'));

    await waitFor(() => {
      expect(screen.queryByText('Oferta')).not.toBeNull();
    });

    // Test Search
    const searchInput = screen.getByPlaceholderText('Buscar templates por nome ou conteúdo...');
    fireEvent.change(searchInput, { target: { value: 'Inexistente' } });
    expect(screen.queryByText('Oferta')).toBeNull();

    fireEvent.change(searchInput, { target: { value: 'Oferta' } });
    expect(screen.queryByText('Oferta')).not.toBeNull();

    // Test New Template and Variables
    fireEvent.click(screen.getByText('+ Novo Template'));
    
    const varButton = screen.getByText('+ Nome');
    fireEvent.click(varButton);
    
    const textarea = screen.getByPlaceholderText('Olá {nome}! Temos uma oferta especial...') as HTMLTextAreaElement;
    expect(textarea.value).toContain('{nome}');
  });

  it('can open template form and save new template', async () => {
    vi.mocked(supabaseLib.listWhatsAppTemplates).mockResolvedValue([]);
    vi.mocked(supabaseLib.createWhatsAppTemplate).mockResolvedValue({ id: '2', company_id: 'test-company', name: 'New', message_text: 'Test', created_at: '' });

    render(<WhatsAppTab companyId="test-company" />);

    // Switch to Templates tab
    await waitFor(() => {
      fireEvent.click(screen.getByText('Templates'));
    });

    await waitFor(() => {
      expect(screen.queryByText('+ Novo Template')).not.toBeNull();
    });

    fireEvent.click(screen.getByText('+ Novo Template'));

    // Fill form
    const nameInput = screen.getByPlaceholderText('Ex: Promoção de Fim de Ano');
    const textInput = screen.getByPlaceholderText('Olá {nome}! Temos uma oferta especial...');

    fireEvent.change(nameInput, { target: { value: 'New' } });
    fireEvent.change(textInput, { target: { value: 'Test' } });

    fireEvent.click(screen.getByText('Salvar Template'));

    expect(supabaseLib.createWhatsAppTemplate).toHaveBeenCalledWith('test-company', 'New', 'Test');
  });
});

