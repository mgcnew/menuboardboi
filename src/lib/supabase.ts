import { createClient } from '@supabase/supabase-js';
import type { AudioAsset, Company, ImageAsset, MediaKind, Profile, CompanyUsage, UserRole, WhatsAppCredentials, WhatsAppBanner, WhatsAppPostTemplate, WhatsAppContact } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
      },
    })
  : null;

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para habilitar uploads e leitura dos dados.',
    );
  }

  return supabase;
}

export async function listCompanies() {
  const client = assertSupabase();
  const { data, error } = await client
    .from('companies')
    .select('id, name, access_code, image_duration_seconds, transition_type, transition_duration_seconds, image_fit_mode, ticker_text, ticker_active, created_at')
    .order('name');

  if (error) {
    throw error;
  }

  return data as Company[];
}

async function generateUniqueAccessCode(client: any): Promise<string> {
  while (true) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const { data } = await client
      .from('companies')
      .select('id')
      .eq('access_code', code)
      .single();
    
    if (!data) return code;
  }
}

export async function createCompany(name: string) {
  const client = assertSupabase();
  const access_code = await generateUniqueAccessCode(client);
  
  const { data, error } = await client
    .from('companies')
    .insert({ name: name.trim(), access_code })
    .select('id, name, access_code, image_duration_seconds, transition_type, transition_duration_seconds, image_fit_mode, created_at')
    .single();

  if (error) {
    throw error;
  }

  return data as Company;
}

export async function getCompanyByCode(code: string) {
  const client = assertSupabase();
  const { data, error } = await client
    .from('companies')
    .select('id, name, access_code, image_duration_seconds, transition_type, transition_duration_seconds, image_fit_mode, ticker_text, ticker_active, created_at')
    .eq('access_code', code)
    .single();

  if (error) {
    throw error;
  }

  return data as Company;
}

export async function updateCompanyDuration(companyId: string, seconds: number) {
  const client = assertSupabase();
  const { error } = await client
    .from('companies')
    .update({ image_duration_seconds: seconds })
    .eq('id', companyId);

  if (error) {
    throw error;
  }
}

export async function updateCompanyTransition(companyId: string, type: string, duration: number, fitMode: string) {
  const client = assertSupabase();
  const { error } = await client
    .from('companies')
    .update({ 
      transition_type: type,
      transition_duration_seconds: duration,
      image_fit_mode: fitMode
    })
    .eq('id', companyId);

  if (error) {
    throw error;
  }
}

export async function updateCompanyTicker(companyId: string, text: string, active: boolean) {
  const client = assertSupabase();
  const { error } = await client
    .from('companies')
    .update({ 
      ticker_text: text,
      ticker_active: active
    })
    .eq('id', companyId);

  if (error) {
    throw error;
  }
}

export async function pingHeartbeat(companyId: string, playerId: string | null, playerName: string, currentMediaName: string) {
  const client = assertSupabase();
  const payload = {
    company_id: companyId,
    player_name: playerName,
    last_ping_at: new Date().toISOString(),
    current_media_name: currentMediaName
  };
  
  if (playerId) {
    const { data, error } = await client.from('players').update(payload).eq('id', playerId).select('id').maybeSingle();
    if (!error && data) {
      return data.id;
    }
  }
  
  // Se não tinha playerId ou o update não retornou nada (talvez foi apagado), inserimos
  const { data, error } = await client.from('players').insert(payload).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function listPlayers(companyId: string) {
  const client = assertSupabase();
  const { data, error } = await client
    .from('players')
    .select('*')
    .eq('company_id', companyId)
    .order('last_ping_at', { ascending: false });

  if (error) throw error;
  return data as import('../types').Player[];
}

export async function listImages(companyId: string) {
  const client = assertSupabase();
  const { data, error } = await client
    .from('images')
    .select('id, company_id, file_url, file_path, order_index, active_days, created_at')
    .eq('company_id', companyId)
    .order('order_index');

  if (error) {
    throw error;
  }

  return data as ImageAsset[];
}

export async function updateImageDays(imageId: string, days: number[]) {
  const client = assertSupabase();
  const { error } = await client
    .from('images')
    .update({ active_days: days })
    .eq('id', imageId);

  if (error) {
    throw error;
  }
}

export async function listAudio(companyId: string, table: MediaKind) {
  const client = assertSupabase();
  const { data, error } = await client
    .from(table)
    .select('id, company_id, file_url, file_path, created_at')
    .eq('company_id', companyId)
    .order('created_at');

  if (error) {
    throw error;
  }

  return data as AudioAsset[];
}

async function uploadToBucket(bucket: MediaKind | 'images', companyId: string, file: File) {
  const client = assertSupabase();
  const safeName = file.name.replace(/\s+/g, '-').toLowerCase();
  const filePath = `${companyId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await client.storage.from(bucket).upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data } = client.storage.from(bucket).getPublicUrl(filePath);

  return {
    filePath,
    fileUrl: data.publicUrl,
  };
}

export async function checkStorageQuota(companyId: string, newBytes: number): Promise<boolean> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('vw_company_storage_usage')
    .select('used_bytes, storage_quota_bytes')
    .eq('company_id', companyId)
    .single();
    
  if (error || !data) {
    console.warn('Erro ao verificar quota ou view não encontrada:', error);
    return true; // Fallback permitindo caso a view não esteja criada
  }
  
  if (data.used_bytes + newBytes > data.storage_quota_bytes) {
    throw new Error(`Quota de armazenamento excedida. O limite é ${Math.round(data.storage_quota_bytes / 1024 / 1024)}MB.`);
  }
  
  return true;
}

export async function uploadImages(companyId: string, files: File[]) {
  const client = assertSupabase();
  const currentImages = await listImages(companyId);
  let nextOrder = currentImages.length;

  const totalSize = files.reduce((acc, file) => acc + file.size, 0);
  await checkStorageQuota(companyId, totalSize);

  for (const file of files) {
    const uploaded = await uploadToBucket('images', companyId, file);
    const { error } = await client.from('images').insert({
      company_id: companyId,
      file_url: uploaded.fileUrl,
      file_path: uploaded.filePath,
      order_index: nextOrder,
      active_days: [0, 1, 2, 3, 4, 5, 6],
    });

    if (error) {
      throw error;
    }

    nextOrder += 1;
  }
}

export async function uploadAudio(companyId: string, table: MediaKind, files: File[]) {
  const client = assertSupabase();

  const totalSize = files.reduce((acc, file) => acc + file.size, 0);
  await checkStorageQuota(companyId, totalSize);

  for (const file of files) {
    const uploaded = await uploadToBucket(table, companyId, file);
    const { error } = await client.from(table).insert({
      company_id: companyId,
      file_url: uploaded.fileUrl,
      file_path: uploaded.filePath,
    });

    if (error) {
      throw error;
    }
  }
}

export async function deleteImage(image: ImageAsset) {
  const client = assertSupabase();
  const { error: storageError } = await client.storage.from('images').remove([image.file_path]);

  if (storageError) {
    throw storageError;
  }

  const { error } = await client.from('images').delete().eq('id', image.id);

  if (error) {
    throw error;
  }
}

export async function deleteAudio(table: MediaKind, asset: AudioAsset) {
  const client = assertSupabase();
  const { error: storageError } = await client.storage.from(table).remove([asset.file_path]);

  if (storageError) {
    throw storageError;
  }

  const { error } = await client.from(table).delete().eq('id', asset.id);

  if (error) {
    throw error;
  }
}

export async function reorderImages(companyId: string, orderedImages: ImageAsset[]) {
  const client = assertSupabase();
  await Promise.all(
    orderedImages.map(async (image, index) => {
      const { error } = await client
        .from('images')
        .update({ order_index: index })
        .eq('id', image.id)
        .eq('company_id', companyId);

      if (error) {
        throw error;
      }
    }),
  );
}

// Multi-Tenancy e Autenticação
export async function getProfile(userId: string) {
  const client = assertSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    throw error;
  }

  return data as Profile;
}

export async function updateProfile(userId: string, updates: Partial<Pick<Profile, 'full_name' | 'avatar_url'>>) {
  const client = assertSupabase();
  const { error } = await client
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    throw error;
  }
}

export async function getCompanyUsage(companyId: string, year: number, month: number) {
  const client = assertSupabase();
  const { data, error } = await client
    .from('company_usage')
    .select('*')
    .eq('company_id', companyId)
    .eq('billing_cycle_year', year)
    .eq('billing_cycle_month', month)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data as CompanyUsage | null;
}

export async function listAllCompaniesForMasterAdmin() {
  const client = assertSupabase();
  const { data, error } = await client
    .from('companies')
    .select('*')
    .order('name');

  if (error) {
    throw error;
  }

  return data as Company[];
}

// Busca o perfil completo do usuário usando as tabelas enterprise_users, user_companies e roles
export async function getEnterpriseProfile(userId: string) {
  const client = assertSupabase();
  
  let profileData: Profile | null = null;
  let roleName: UserRole = 'client';
  let companyId: string | null = null;

  // 1. Tenta buscar da tabela profiles
  const { data: legacyProfile, error: legacyError } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (!legacyError && legacyProfile) {
    profileData = legacyProfile;
    roleName = legacyProfile.role as UserRole;
    companyId = legacyProfile.company_id;
  }

  // 2. Tenta buscar das tabelas de enterprise (caso existam no banco do usuário)
  try {
    const { data: euData, error: euError } = await client
      .from('enterprise_users')
      .select('id, auth_user_id, email')
      .eq('auth_user_id', userId)
      .single();

    if (!euError && euData) {
      const { data: ucData } = await client
        .from('user_companies')
        .select('id, company_id, role_id')
        .eq('user_id', euData.id)
        .maybeSingle();

      if (ucData) {
        companyId = ucData.company_id;
        const { data: roleData } = await client
          .from('roles')
          .select('name')
          .eq('id', ucData.role_id)
          .single();

        if (roleData) {
          roleName = roleData.name as UserRole;
        }
      }
    }
  } catch (e) {
    // Ignora erro caso as tabelas enterprise não existam
    console.warn('Aviso: Tabelas enterprise_users não encontradas, usando fallback.');
  }

  // Se não achou em nenhum lugar, retorna um perfil padrão temporário
  if (!profileData && roleName === 'client') {
    return {
      id: userId,
      auth_user_id: userId,
      company_id: null,
      role: 'client' as UserRole,
      full_name: null,
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  return {
    id: profileData?.id || userId,
    auth_user_id: userId,
    company_id: companyId,
    role: roleName,
    full_name: profileData?.full_name || null,
    avatar_url: profileData?.avatar_url || null,
    created_at: profileData?.created_at || new Date().toISOString(),
    updated_at: profileData?.updated_at || new Date().toISOString()
  };
}

// WhatsApp Credentials
export async function getWhatsAppCredentials(companyId: string): Promise<WhatsAppCredentials | null> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('whatsapp_credentials')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return data as WhatsAppCredentials | null;
}

export async function saveWhatsAppCredentials(
  companyId: string,
  credentials: Partial<WhatsAppCredentials>
): Promise<WhatsAppCredentials> {
  const client = assertSupabase();
  
  // Try to upsert
  const { data, error } = await client
    .from('whatsapp_credentials')
    .upsert({
      company_id: companyId,
      ...credentials,
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }
  return data as WhatsAppCredentials;
}

// WhatsApp Contacts
export async function listWhatsAppContacts(companyId: string): Promise<WhatsAppContact[]> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('whatsapp_contacts')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as WhatsAppContact[];
}

export async function createWhatsAppContact(
  companyId: string, 
  name: string, 
  phone_numbers: string[], 
  segment: string | null
): Promise<WhatsAppContact> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('whatsapp_contacts')
    .insert({ company_id: companyId, name, phone_numbers, segment })
    .select('*')
    .single();

  if (error) throw error;
  return data as WhatsAppContact;
}

export async function updateWhatsAppContact(
  contactId: string, 
  name: string, 
  phone_numbers: string[], 
  segment: string | null
): Promise<WhatsAppContact> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('whatsapp_contacts')
    .update({ name, phone_numbers, segment })
    .eq('id', contactId)
    .select('*')
    .single();

  if (error) throw error;
  return data as WhatsAppContact;
}

export async function deleteWhatsAppContact(contactId: string): Promise<void> {
  const client = assertSupabase();
  const { error } = await client.from('whatsapp_contacts').delete().eq('id', contactId);
  if (error) throw error;
}

export async function importWhatsAppContacts(companyId: string, contacts: {name: string, phone: string, segment?: string}[]): Promise<void> {
  const client = assertSupabase();
  
  // Transform flat structure to the array-based structure of the database
  // Grouping by name/segment to merge multiple phones into one contact could be done, 
  // but for simplicity, we'll insert one phone per contact.
  const inserts = contacts.map(c => ({
    company_id: companyId,
    name: c.name,
    phone_numbers: [c.phone],
    segment: c.segment || null
  }));

  const { error } = await client.from('whatsapp_contacts').insert(inserts);
  if (error) throw error;
}
export async function listWhatsAppTemplates(companyId: string): Promise<WhatsAppPostTemplate[]> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('whatsapp_post_templates')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as WhatsAppPostTemplate[];
}

export async function createWhatsAppTemplate(companyId: string, name: string, message_text: string): Promise<WhatsAppPostTemplate> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('whatsapp_post_templates')
    .insert({ company_id: companyId, name, message_text })
    .select('*')
    .single();

  if (error) throw error;
  return data as WhatsAppPostTemplate;
}

export async function updateWhatsAppTemplate(templateId: string, name: string, message_text: string): Promise<WhatsAppPostTemplate> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('whatsapp_post_templates')
    .update({ name, message_text })
    .eq('id', templateId)
    .select('*')
    .single();

  if (error) throw error;
  return data as WhatsAppPostTemplate;
}

export async function deleteWhatsAppTemplate(templateId: string): Promise<void> {
  const client = assertSupabase();
  const { error } = await client.from('whatsapp_post_templates').delete().eq('id', templateId);
  if (error) throw error;
}
export async function listWhatsAppBanners(companyId: string): Promise<WhatsAppBanner[]> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('whatsapp_banners')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as WhatsAppBanner[];
}

export async function uploadWhatsAppBanners(companyId: string, files: File[]): Promise<void> {
  for (const file of files) {
    await uploadSingleWhatsAppBanner(companyId, file, file.name);
  }
}

export async function uploadSingleWhatsAppBanner(companyId: string, file: File, name: string): Promise<WhatsAppBanner> {
  const client = assertSupabase();

  const fileExt = file.name.split('.').pop();
  const filePath = `${companyId}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
  
  const { error: uploadError } = await client.storage
    .from('whatsapp_banners')
    .upload(filePath, file, { cacheControl: '3600', upsert: false });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = client.storage
    .from('whatsapp_banners')
    .getPublicUrl(filePath);

  const { data, error: insertError } = await client.from('whatsapp_banners').insert({
    company_id: companyId,
    name: name,
    file_url: publicUrl,
    file_size: file.size,
    is_active: true
  }).select('*').single();

  if (insertError) throw insertError;
  return data as WhatsAppBanner;
}

export async function deleteWhatsAppBanner(banner: WhatsAppBanner): Promise<void> {
  const client = assertSupabase();
  
  // Extract path from public URL
  const urlParts = banner.file_url.split('/whatsapp_banners/');
  if (urlParts.length > 1) {
    const filePath = urlParts[1];
    const { error: storageError } = await client.storage
      .from('whatsapp_banners')
      .remove([filePath]);
    if (storageError) console.error('Error removing file from storage:', storageError);
  }

  const { error } = await client.from('whatsapp_banners').delete().eq('id', banner.id);
  if (error) throw error;
}

export async function updateWhatsAppBannerStatus(bannerId: string, is_active: boolean): Promise<void> {
  const client = assertSupabase();
  const { error } = await client
    .from('whatsapp_banners')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', bannerId);
  
  if (error) throw error;
}

export async function updateWhatsAppBanner(bannerId: string, name: string): Promise<WhatsAppBanner> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('whatsapp_banners')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', bannerId)
    .select('*')
    .single();
  
  if (error) throw error;
  return data as WhatsAppBanner;
}
