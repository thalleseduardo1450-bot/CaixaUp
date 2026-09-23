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

function allowedEmails() {
  return (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

const PLAN_LABELS = { free: 'Grátis', pro: 'Pro', premium: 'Premium' };
const PRICE_BY_PLAN = {
  pro: () => process.env.STRIPE_PRICE_PRO,
  premium: () => process.env.STRIPE_PRICE_PREMIUM
};
const STATUSES = new Set(['inactive', 'trialing', 'active', 'manual', 'past_due', 'cancel_at_period_end', 'canceled']);
const ROLES = new Set(['owner', 'administrator', 'manager', 'cashier', 'employee']);

async function authenticate(request) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'Administração ainda não está configurada no servidor.' };
  }

  const bearer = request.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ')) return { error: 'Entre na conta administrativa.' };

  const admin = getAdmin();
  const { data, error } = await admin.auth.getUser(bearer.slice(7));
  if (error || !data?.user) return { error: 'Sessão inválida ou expirada.' };
  if (!allowedEmails().includes((data.user.email || '').toLowerCase())) return { error: 'Você não tem permissão administrativa.' };

  return { admin, user: data.user };
}

async function listAuthUsers(admin) {
  const allUsers = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    allUsers.push(...users);
    if (users.length < 1000) break;
    page += 1;
  }

  return allUsers;
}

async function getUserEmail(admin, userId) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return '';
  return data.user.email || '';
}

function siteOrigin(request) {
  return (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
}

export async function GET(request) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return json({ error: auth.error }, 403);

    const { data: profiles, error: profileError } = await auth.admin
      .from('perfis')
      .select('id, empresa_id, nome, cargo, created_at')
      .order('created_at', { ascending: false });
    if (profileError) throw profileError;

    const users = await listAuthUsers(auth.admin);
    const { data: companies, error: companiesError } = await auth.admin.from('empresas').select('id, nome');
    if (companiesError) throw companiesError;
    const { data: subscriptions, error: subscriptionsError } = await auth.admin
      .from('assinaturas')
      .select('empresa_id, plano, trial_ends_at, paid_until, cancel_at_period_end, provider_customer_id, provider_subscription_id');
    if (subscriptionsError) throw subscriptionsError;

    const authUsers = new Map(users.map(user => [user.id, user]));
    const companyNames = new Map((companies || []).map(company => [company.id, company.nome]));
    const subscriptionByCompany = new Map((subscriptions || []).map(subscription => [subscription.empresa_id, subscription]));

    return json({
      users: (profiles || []).map(profile => {
        const authUser = authUsers.get(profile.id);
        const subscription = subscriptionByCompany.get(profile.empresa_id);
        const plan = subscription?.plano === 'gratis' ? 'free' : (subscription?.plano || 'free');
        const status = plan === 'free' ? 'inactive' : (subscription?.cancel_at_period_end ? 'cancel_at_period_end' : (subscription?.paid_until ? 'active' : 'trialing'));
        const safeProfile = { user_id: profile.id, company_id: profile.empresa_id, full_name: profile.nome, role: profile.cargo, created_at: profile.created_at, plan, subscription_status: status, trial_ends_at: subscription?.paid_until || subscription?.trial_ends_at || null };
        return {
          ...safeProfile,
          email: authUser?.email || '',
          email_confirmed_at: authUser?.email_confirmed_at || null,
          last_sign_in_at: authUser?.last_sign_in_at || null,
          company_name: companyNames.get(profile.empresa_id) || 'Sem empresa',
          has_stripe_customer: Boolean(subscription?.provider_customer_id),
          has_stripe_subscription: Boolean(subscription?.provider_subscription_id)
        };
      })
    });
  } catch (error) {
    console.error('admin-platform GET', error);
    return json({ error: 'Não foi possível carregar as contas.' }, 500);
  }
}

export async function PATCH(request) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return json({ error: auth.error }, 403);

    const payload = await request.json();
    if (!payload?.userId || !['free', 'pro', 'premium'].includes(payload.plan)) {
      return json({ error: 'Dados de plano inválidos.' }, 400);
    }

    if (payload.role && ROLES.has(payload.role)) {
      const { error } = await auth.admin.from('perfis').update({ cargo: payload.role === 'owner' ? 'proprietario' : payload.role }).eq('id', payload.userId);
      if (error) throw error;
    }
    const { data: perfil, error: perfilError } = await auth.admin.from('perfis').select('empresa_id').eq('id', payload.userId).single();
    if (perfilError) throw perfilError;
    const subscriptionUpdate = { plano: payload.plan === 'free' ? 'gratis' : payload.plan, updated_at: new Date().toISOString() };
    if (Object.hasOwn(payload, 'expiresAt') && payload.expiresAt) subscriptionUpdate.paid_until = new Date(payload.expiresAt).toISOString();
    const { error: assinaturaError } = await auth.admin.from('assinaturas').update(subscriptionUpdate).eq('empresa_id', perfil.empresa_id);
    if (assinaturaError) throw assinaturaError;

    return json({ updated: true });
  } catch (error) {
    console.error('admin-platform PATCH', error);
    return json({ error: 'Não foi possível atualizar o plano.' }, 500);
  }
}

export async function POST(request) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return json({ error: auth.error }, 403);
    if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Stripe ainda não está configurado no servidor.' }, 503);

    const payload = await request.json();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    if (payload?.action === 'create_checkout') {
      if (!payload.userId || !['pro', 'premium'].includes(payload.plan)) return json({ error: 'Dados de cobrança inválidos.' }, 400);

      const priceId = PRICE_BY_PLAN[payload.plan]?.();
      if (!priceId) return json({ error: `Preço do plano ${PLAN_LABELS[payload.plan]} não configurado.` }, 503);

      const { data: profile, error: profileError } = await auth.admin
        .from('profiles')
        .select('stripe_customer_id, full_name')
        .eq('user_id', payload.userId)
        .single();
      if (profileError) throw profileError;

      let customerId = profile.stripe_customer_id || null;
      if (!customerId) {
        const email = await getUserEmail(auth.admin, payload.userId);
        const customer = await stripe.customers.create({
          email: email || undefined,
          name: profile.full_name || undefined,
          metadata: { supabase_user_id: payload.userId }
        });
        customerId = customer.id;
        const { error: saveError } = await auth.admin.from('profiles').update({ stripe_customer_id: customerId }).eq('user_id', payload.userId);
        if (saveError) throw saveError;
      }

      const checkoutPayload = {
        mode: 'subscription',
        customer: customerId,
        client_reference_id: payload.userId,
        line_items: [{ price: priceId, quantity: 1 }],
        locale: 'pt-BR',
        payment_method_collection: 'always',
        billing_address_collection: 'auto',
        subscription_data: {
          trial_period_days: 7,
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
          metadata: { user_id: payload.userId, plan: payload.plan }
        },
        metadata: { user_id: payload.userId, plan: payload.plan, created_by: auth.user.id },
        success_url: `${siteOrigin(request)}/?checkout=success&admin=1`,
        cancel_url: `${siteOrigin(request)}/#planos`,
        allow_promotion_codes: true
      };

      if (typeof payload.coupon === 'string' && payload.coupon.trim()) {
        checkoutPayload.discounts = [{ coupon: payload.coupon.trim() }];
        checkoutPayload.allow_promotion_codes = undefined;
      }

      const checkout = await stripe.checkout.sessions.create(checkoutPayload);
      return json({ url: checkout.url });
    }

    if (payload?.action === 'billing_portal') {
      if (!payload.userId) return json({ error: 'Conta inválida.' }, 400);
      const { data: profile, error: profileError } = await auth.admin
        .from('profiles')
        .select('stripe_customer_id')
        .eq('user_id', payload.userId)
        .single();
      if (profileError) throw profileError;
      if (!profile?.stripe_customer_id) return json({ error: 'Esta conta ainda não possui cliente no Stripe.' }, 409);
      const portal = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: `${siteOrigin(request)}/?admin=1`
      });
      return json({ url: portal.url });
    }

    if (payload?.action === 'cancel_renewal') {
      if (!payload.userId) return json({ error: 'Conta inválida.' }, 400);
      const { data: perfil, error: perfilError } = await auth.admin.from('perfis').select('empresa_id').eq('id', payload.userId).single();
      if (perfilError) throw perfilError;
      const { data: profile, error: profileError } = await auth.admin.from('assinaturas').select('provider_subscription_id, plano').eq('empresa_id', perfil.empresa_id).single();
      if (profileError) throw profileError;
      if (!profile?.provider_subscription_id || profile.plano === 'gratis') {
        return json({ error: 'Esta conta não possui assinatura paga no Stripe.' }, 409);
      }
      await stripe.subscriptions.update(profile.provider_subscription_id, { cancel_at_period_end: true });
      const { error: updateError } = await auth.admin.from('assinaturas').update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('empresa_id', perfil.empresa_id);
      if (updateError) throw updateError;
      return json({ canceled: true, refund: false });
    }

    return json({ error: 'Ação administrativa inválida.' }, 400);
  } catch (error) {
    console.error('admin-platform POST', error);
    return json({ error: 'Não foi possível concluir a ação administrativa.' }, 500);
  }
}
