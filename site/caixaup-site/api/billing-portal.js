import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function getAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function POST(request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Portal de cobrança ainda não está configurado no servidor.' }, 503);
    }

    const bearer = request.headers.get('authorization') || '';
    if (!bearer.startsWith('Bearer ')) return json({ error: 'Entre na sua conta para gerenciar a assinatura.' }, 401);

    const admin = getAdmin();
    const { data: authData, error: authError } = await admin.auth.getUser(bearer.slice(7));
    if (authError || !authData?.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);

    const { data: perfil, error: perfilError } = await admin
      .from('perfis')
      .select('empresa_id')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (perfilError) throw perfilError;
    const { data: assinatura, error: assinaturaError } = await admin
      .from('assinaturas')
      .select('provider_customer_id')
      .eq('empresa_id', perfil?.empresa_id || '')
      .maybeSingle();
    if (assinaturaError) throw assinaturaError;
    if (!assinatura?.provider_customer_id) {
      return json({ error: 'Assine um plano primeiro para abrir o gerenciamento de cobrança.' }, 409);
    }

    const siteUrl = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const portal = await stripe.billingPortal.sessions.create({
      customer: assinatura.provider_customer_id,
      return_url: `${siteUrl}/?account=1`
    });

    return json({ url: portal.url });
  } catch (error) {
    console.error('billing-portal', error);
    return json({ error: 'Não foi possível abrir o gerenciamento de cobrança agora.' }, 500);
  }
}
