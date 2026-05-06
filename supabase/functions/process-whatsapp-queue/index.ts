import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type WhatsAppPost = {
  id: string;
  company_id: string;
  banner_id: string | null;
  template_id: string | null;
  message_text: string | null;
  recipient_ids: string[];
  scheduled_at: string | null;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
};

type WhatsAppCredentials = {
  company_id: string;
  provider: string;
  api_key: string;
  instance_id: string | null;
  is_active: boolean;
};

type WhatsAppContact = {
  id: string;
  name: string;
  phone_numbers: string[];
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const WAPI_BASE_URL = (Deno.env.get('WAPI_BASE_URL') ?? 'https://api.w-api.app/v1').replace(/\/+$/, '');
const WAPI_TEXT_PATH = Deno.env.get('WAPI_TEXT_PATH') ?? '/instance/{{instanceId}}/message/send-text';
const WAPI_IMAGE_PATH = Deno.env.get('WAPI_IMAGE_PATH') ?? '/instance/{{instanceId}}/message/send-image';
const WAPI_TIMEOUT_MS = Number(Deno.env.get('WAPI_TIMEOUT_MS') ?? '15000');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function buildEndpoint(pathTemplate: string, instanceId: string): string {
  const path = pathTemplate.replace('{{instanceId}}', encodeURIComponent(instanceId));
  return `${WAPI_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

async function callWapi(url: string, apiKey: string, payload: unknown): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WAPI_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        apikey: apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function reservePost(postId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('whatsapp_posts')
    .update({ status: 'processing', updated_at: new Date().toISOString(), last_error: null })
    .eq('id', postId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function failPost(postId: string, message: string): Promise<void> {
  await supabase
    .from('whatsapp_posts')
    .update({
      status: 'failed',
      last_error: message.slice(0, 1000),
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId);
}

async function markSent(postId: string): Promise<void> {
  await supabase
    .from('whatsapp_posts')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', postId);
}

async function processPost(post: WhatsAppPost): Promise<{ sent: number; failed: number }> {
  const { data: credentials, error: credentialsError } = await supabase
    .from('whatsapp_credentials')
    .select('company_id, provider, api_key, instance_id, is_active')
    .eq('company_id', post.company_id)
    .maybeSingle();
  if (credentialsError) throw credentialsError;
  const creds = credentials as WhatsAppCredentials | null;

  if (!creds?.is_active || !creds.api_key || !creds.instance_id) {
    await failPost(post.id, 'Credenciais WhatsApp inválidas/inativas para esta empresa.');
    return { sent: 0, failed: post.recipient_ids.length };
  }

  const { data: contacts, error: contactsError } = await supabase
    .from('whatsapp_contacts')
    .select('id, name, phone_numbers')
    .in('id', post.recipient_ids);
  if (contactsError) throw contactsError;
  const contactsMap = new Map((contacts as WhatsAppContact[]).map((c) => [c.id, c]));

  let imageUrl: string | null = null;
  if (post.banner_id) {
    const { data: banner, error: bannerError } = await supabase
      .from('whatsapp_banners')
      .select('file_url')
      .eq('id', post.banner_id)
      .maybeSingle();
    if (bannerError) throw bannerError;
    imageUrl = (banner as { file_url: string } | null)?.file_url ?? null;
  }

  let templateText = '';
  if (post.template_id) {
    const { data: tpl, error: tplError } = await supabase
      .from('whatsapp_post_templates')
      .select('message_text')
      .eq('id', post.template_id)
      .maybeSingle();
    if (tplError) throw tplError;
    templateText = (tpl as { message_text: string } | null)?.message_text ?? '';
  }

  const baseText = (post.message_text ?? templateText ?? '').trim();
  const sentErrors: string[] = [];
  let sent = 0;
  let failed = 0;

  for (const recipientId of post.recipient_ids) {
    const contact = contactsMap.get(recipientId);
    const rawPhone = contact?.phone_numbers?.[0] ?? '';
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      failed += 1;
      sentErrors.push(`Contato ${recipientId}: sem telefone válido`);
      continue;
    }

    const text = baseText || ' ';
    const endpoint = imageUrl
      ? buildEndpoint(WAPI_IMAGE_PATH, creds.instance_id)
      : buildEndpoint(WAPI_TEXT_PATH, creds.instance_id);
    const payload = imageUrl
      ? { phone, image: imageUrl, caption: text }
      : { phone, message: text };

    const response = await callWapi(endpoint, creds.api_key, payload);
    if (response.ok) {
      sent += 1;
    } else {
      failed += 1;
      const body = await response.text();
      sentErrors.push(`${phone}: HTTP ${response.status} ${body}`.slice(0, 220));
    }
  }

  if (sent > 0 && failed === 0) {
    await markSent(post.id);
  } else if (sent > 0 && failed > 0) {
    await supabase
      .from('whatsapp_posts')
      .update({
        status: 'failed',
        sent_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: `Parcial: ${failed} falharam. ${sentErrors.join(' | ')}`.slice(0, 1000),
      })
      .eq('id', post.id);
  } else {
    await failPost(post.id, sentErrors.join(' | ') || 'Falha no envio');
  }

  return { sent, failed };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('authorization') ?? '';
    const expected = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    if (!SUPABASE_SERVICE_ROLE_KEY || authHeader !== expected) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.max(1, Math.min(Number(body.batchSize ?? 25), 100));

    const nowIso = new Date().toISOString();
    const { data: posts, error } = await supabase
      .from('whatsapp_posts')
      .select('id, company_id, banner_id, template_id, message_text, recipient_ids, scheduled_at, status')
      .eq('status', 'pending')
      .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
      .order('scheduled_at', { ascending: true, nullsFirst: true })
      .limit(batchSize);
    if (error) throw error;

    let processed = 0;
    let sentCount = 0;
    let failedCount = 0;

    for (const post of (posts ?? []) as WhatsAppPost[]) {
      const reserved = await reservePost(post.id);
      if (!reserved) continue;
      processed += 1;
      const result = await processPost(post);
      sentCount += result.sent;
      failedCount += result.failed;
    }

    return Response.json({
      ok: true,
      processed,
      sentRecipients: sentCount,
      failedRecipients: failedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
