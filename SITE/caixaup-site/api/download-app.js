import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Download ainda não configurado no servidor.' }, 503);
    }
    const admin = getAdmin();
    const auth = request.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Entre na sua conta para baixar o aplicativo.' }, 401);

    const { data, error } = await admin.auth.getUser(auth.slice(7));
    if (error || !data?.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);

    return json({ url: 'https://github.com/thalleseduardo1450-bot/CaixaUp/releases/download/v3.3.24/CaixaUp-Setup-3.3.24.exe' });
  } catch (error) {
    console.error('download-app', error);
    return json({ error: 'Não foi possível gerar o link de download.' }, 500);
  }
}
