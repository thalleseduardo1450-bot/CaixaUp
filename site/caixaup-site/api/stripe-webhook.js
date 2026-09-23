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

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function updateFromSubscription(subscription, admin) {
  const userId = subscription.metadata?.user_id;
  const selectedPlan = subscription.metadata?.plan;
  if (!userId) return;

  const active = ['trialing', 'active'].includes(subscription.status);
  const plan = active && ['pro', 'premium'].includes(selectedPlan) ? selectedPlan : 'free';
  const accessEndsAt = subscription.trial_end || subscription.current_period_end;
  const subscriptionStatus = subscription.cancel_at_period_end ? 'cancel_at_period_end' : subscription.status;

  const { error } = await admin.from('profiles').update({
    plan,
    stripe_subscription_id: subscription.id,
    subscription_status: subscriptionStatus,
    trial_ends_at: accessEndsAt ? new Date(accessEndsAt * 1000).toISOString() : null,
    updated_at: new Date().toISOString()
  }).eq('user_id', userId);

  if (error) throw error;
}

export async function POST(request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Webhook não configurado.' }, 503);
  }

  const stripe = getStripe();
  const admin = getAdmin();

  const signature = request.headers.get('stripe-signature');
  if (!signature) return json({ error: 'Assinatura ausente.' }, 400);

  let event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('stripe webhook signature', error);
    return json({ error: 'Assinatura inválida.' }, 400);
  }

  const { error: eventInsertError } = await admin.from('stripe_webhook_events').insert({
    event_id: event.id,
    event_type: event.type
  });

  if (eventInsertError?.code === '23505') return json({ received: true, duplicate: true });
  if (eventInsertError) {
    console.error('webhook idempotency insert', eventInsertError);
    return json({ error: 'Falha ao registrar evento.' }, 500);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const checkout = event.data.object;
      if (checkout.subscription) {
        const subscription = await stripe.subscriptions.retrieve(checkout.subscription);
        await updateFromSubscription(subscription, admin);
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      await updateFromSubscription(event.data.object, admin);
    }

    return json({ received: true });
  } catch (error) {
    // O evento só deve ficar marcado como processado depois de concluir.
    // Se houver falha, removemos a trava para que a nova tentativa do Stripe
    // possa processar o mesmo event.id novamente.
    const { error: cleanupError } = await admin
      .from('stripe_webhook_events')
      .delete()
      .eq('event_id', event.id);
    if (cleanupError) console.error('webhook idempotency cleanup', cleanupError);

    console.error('stripe webhook processing', error);
    return json({ error: 'Falha ao processar webhook.' }, 500);
  }
}
