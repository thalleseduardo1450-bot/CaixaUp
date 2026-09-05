/*
 * Configuração pública do cliente CaixaUp.
 * A chave publishable do Supabase pode ficar no navegador; a proteção real
 * continua sendo feita pelas políticas RLS no banco. Nunca inclua aqui uma
 * service_role, segredo OAuth, chave Stripe ou senha.
 */
window.CAIXAUP_CONFIG = Object.freeze({
  supabaseUrl: 'https://tugtruobxcfulbcipbkh.supabase.co',
  supabasePublishableKey: 'sb_publishable_SQdUlF0ytdANtZZRt8FkTQ_xD429GIs',
  appUrl: 'http://127.0.0.1:4173',
  downloadEndpoint: '/api/download-app'
});
