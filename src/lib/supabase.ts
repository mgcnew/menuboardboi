import { createClient } from '@supabase/supabase-js';
import type { AudioAsset, Company, ImageAsset, MediaKind } from '../types';

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
    .select('id, name, image_duration_seconds, created_at')
    .order('name');

  if (error) {
    throw error;
  }

  return data as Company[];
}

export async function createCompany(name: string) {
  const client = assertSupabase();
  const { data, error } = await client
    .from('companies')
    .insert({ name: name.trim() })
    .select('id, name, image_duration_seconds, created_at')
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
    .select('id, company_id, file_url, file_path, order_index, created_at')
    .eq('company_id', companyId)
    .order('order_index');

  if (error) {
    throw error;
  }

  return data as ImageAsset[];
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

export async function uploadImages(companyId: string, files: File[]) {
  const client = assertSupabase();
  const currentImages = await listImages(companyId);
  let nextOrder = currentImages.length;

  for (const file of files) {
    const uploaded = await uploadToBucket('images', companyId, file);
    const { error } = await client.from('images').insert({
      company_id: companyId,
      file_url: uploaded.fileUrl,
      file_path: uploaded.filePath,
      order_index: nextOrder,
    });

    if (error) {
      throw error;
    }

    nextOrder += 1;
  }
}

export async function uploadAudio(companyId: string, table: MediaKind, files: File[]) {
  const client = assertSupabase();

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
