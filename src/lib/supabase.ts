import { createClient } from '@supabase/supabase-js';
import type { AudioAsset, Company, ImageAsset, MediaKind, Profile, CompanyUsage, UserRole } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
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
    .select('id, name, access_code, image_duration_seconds, transition_type, transition_duration_seconds, created_at')
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
    .select('id, name, access_code, image_duration_seconds, transition_type, transition_duration_seconds, created_at')
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
    .select('id, name, access_code, image_duration_seconds, transition_type, transition_duration_seconds, created_at')
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

export async function updateCompanyTransition(companyId: string, type: string, duration: number) {
  const client = assertSupabase();
  const { error } = await client
    .from('companies')
    .update({ 
      transition_type: type,
      transition_duration_seconds: duration
    })
    .eq('id', companyId);

  if (error) {
    throw error;
  }
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
  
  // 1. Busca enterprise_users
  const { data: euData, error: euError } = await client
    .from('enterprise_users')
    .select('id, auth_user_id, email')
    .eq('auth_user_id', userId)
    .single();

  if (euError) {
    try {
      // Fallback para o perfil antigo (se existir)
      return await getProfile(userId);
    } catch {
      throw euError;
    }
  }

  // 2. Busca user_companies
  const { data: ucData } = await client
    .from('user_companies')
    .select('id, company_id, role_id')
    .eq('user_id', euData.id)
    .maybeSingle();

  let roleName: UserRole = 'client';
  let companyId: string | null = null;

  if (ucData) {
    companyId = ucData.company_id;
    // 3. Busca a role
    const { data: roleData } = await client
      .from('roles')
      .select('name')
      .eq('id', ucData.role_id)
      .single();

    if (roleData) {
      roleName = roleData.name as UserRole;
    }
  }

  return {
    id: euData.id,
    auth_user_id: euData.auth_user_id,
    company_id: companyId,
    role: roleName,
    full_name: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
