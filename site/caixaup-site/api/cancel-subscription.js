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
      return json({ error: 'Cancelamento ainda não está configurado no servidor.' }, 503);
    }
    const bearer = request.headers.get('authorization') || '';
    if (!bearer.startsWith('Bearer ')) return json({ error: 'Entre na sua conta para cancelar a renovação.' }, 401);
    const admin = getAdmin();
    const { data: authData, error: authError } = await admin.auth.getUser(bearer.slice(7));
    if (authError || !authData?.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('stripe_subscription_id, plan')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.stripe_subscription_id || profile.plan === 'free') {
      return json({ error: 'Esta conta não possui uma assinatura paga ativa.' }, 409);
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const subscription = await stripe.subscriptions.update(profile.stripe_subscription_id, { cancel_at_period_end: true });
    const { error: updateError } = await admin.from('profiles').update({
      subscription_status: 'cancel_at_period_end',
      trial_ends_at: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq('user_id', authData.user.id);
    if (updateError) throw updateError;
    return json({ canceled: true, refund: false });
  } catch (error) {
    console.error('cancel-subscription', error);
    return json({ error: 'Não foi possível cancelar a renovação agora.' }, 500);
  }
}
