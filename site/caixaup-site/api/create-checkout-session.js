import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function getAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const PRICE_BY_PLAN = {
  pro: () => process.env.STRIPE_PRICE_PRO,
  premium: () => process.env.STRIPE_PRICE_PREMIUM,
};

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function authenticatedUser(request, admin) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function POST(request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Servidor de assinaturas ainda não configurado.' }, 503);
    }

    const stripe = getStripe();
    const admin = getAdmin();

    const user = await authenticatedUser(request, admin);
    if (!user) return json({ error: 'Faça login para assinar um plano.' }, 401);

    const { plan } = await request.json();
    if (!Object.hasOwn(PRICE_BY_PLAN, plan) && plan !== 'teste') return json({ error: 'Plano inválido.' }, 400);

    const priceId = PRICE_BY_PLAN[plan]?.();
    if (!priceId && plan !== 'teste') return json({ error: `Price ID do plano ${plan} não configurado.` }, 503);

    const { data: perfil, error: perfilError } = await admin
      .from('perfis')
      .select('empresa_id')
      .eq('id', user.id)
      .single();
    if (perfilError || !perfil?.empresa_id) return json({ error: 'Sua conta ainda não possui uma empresa vinculada.' }, 409);
    const { data: assinatura, error: assinaturaError } = await admin
      .from('assinaturas')
      .select('provider_customer_id')
      .eq('empresa_id', perfil.empresa_id)
      .single();
    if (assinaturaError) throw assinaturaError;

    let customerId = assinatura?.provider_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.user_metadata?.full_name || undefined,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;
      const { error: customerSaveError } = await admin
        .from('assinaturas')
        .update({ provider_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq('empresa_id', perfil.empresa_id);
      if (customerSaveError) throw customerSaveError;
    }

    const siteUrl = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: priceId ? [{ price: priceId, quantity: 1 }] : [{ price_data: { currency: 'brl', unit_amount: 500, recurring: { interval: 'month' }, product_data: { name: 'CaixaUp — Plano Teste' } }, quantity: 1 }],
      locale: 'pt-BR',
      payment_method_types: ['card'],
      payment_method_collection: 'always',
      billing_address_collection: 'auto',
      subscription_data: {
        ...(plan === 'teste' ? {} : { trial_period_days: 7 }),
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        metadata: { user_id: user.id, plan }
      },
      metadata: { user_id: user.id, plan },
      success_url: `${siteUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#planos`,
      allow_promotion_codes: true
    });

    return json({ url: checkout.url });
  } catch (error) {
    console.error('create-checkout-session', error);
    return json({ error: 'Não foi possível iniciar a assinatura.' }, 500);
  }
}
