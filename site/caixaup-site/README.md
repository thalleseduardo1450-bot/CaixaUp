# CaixaUp — site oficial + autenticação + planos

Projeto em HTML/CSS/JS que continua o site fornecido e adiciona:

- Entrar e criar conta com Supabase Auth.
- Login com Google.
- Mesma conta para site e aplicativo.
- Redefinição de senha.
- Planos bloqueados para visitantes.
- Stripe Checkout criado somente no servidor.
- Teste de 7 dias sem exigir forma de pagamento no início; se o teste acabar sem forma de pagamento, a assinatura é cancelada e o webhook volta o usuário ao plano Grátis.
- Webhook Stripe com verificação de assinatura e idempotência.
- Download autenticado do app por URL temporária do Supabase Storage.
- Cancelamento de renovação pelo usuário, sem reembolso automático e com acesso até o fim do período.
- Painel administrativo protegido no servidor para visualizar contas e ajustar planos autorizados.
- RLS e separação básica por empresa/tenant.

## 1. Supabase

1. Crie/abra o projeto Supabase.
2. Execute `supabase/schema.sql` no SQL Editor.
3. Em **Authentication > Providers**, deixe Email habilitado.
4. Para Google, habilite o provider Google e configure Client ID/Secret somente no Supabase. Nunca coloque o Client Secret no site, no aplicativo ou no arquivo `.env.local`.
5. Em **Authentication > URL Configuration**, configure `SITE_URL` e adicione as URLs de redirect da produção e do ambiente local do site. O site usa a URL aberta no navegador como retorno do login.
6. Crie um bucket privado chamado `app-builds` e envie o instalador como `CaixaUp-Setup.exe` (ou altere as variáveis do arquivo `.env.example`).

O Supabase pode vincular automaticamente identidades que usam o mesmo e-mail verificado. Assim, alguém que criou conta por e-mail pode depois entrar pelo Google com o mesmo e-mail sem criar uma segunda conta.

## 2. Stripe

1. Crie dois produtos/preços recorrentes mensais: Pro e Premium.
2. Copie os Price IDs para `STRIPE_PRICE_PRO` e `STRIPE_PRICE_PREMIUM`.
3. Crie um webhook apontando para:
   `https://SEU-DOMINIO/api/stripe-webhook`
4. Escute pelo menos:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copie o Signing Secret para `STRIPE_WEBHOOK_SECRET`.

O navegador envia apenas `pro` ou `premium`. O preço real vem de variáveis do servidor, então alterar o HTML/DevTools não muda o valor cobrado nem o plano salvo.

O botão de cancelamento usa `cancel_at_period_end` no Stripe: não cria reembolso e impede a próxima cobrança. O webhook confirma o estado no Supabase.

## 3. Vercel

Para testes locais, o `.env.local` já contém a URL e a chave pública do mesmo projeto Supabase usado pelo CaixaUp. Para produção, adicione na Vercel todas as variáveis listadas em `.env.example`; as chaves privadas ficam somente lá. Rode localmente com `vercel dev` para que as rotas de autenticação e download funcionem.

`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` nunca devem aparecer no HTML nem em JavaScript entregue ao navegador.

## 4. App CaixaUp

O botão de download chama `/api/download-app`. Essa Function exige um token Supabase válido e gera uma URL assinada de 60 segundos para o instalador no bucket privado.

Dentro do aplicativo, use o mesmo projeto Supabase Auth. O usuário poderá entrar com o mesmo e-mail/senha ou com Google, conforme a integração nativa/web do app.

## 5. Arquivos principais

- `index.html` — site completo.
- `api/public-config.js` — entrega apenas configurações públicas ao frontend.
- `api/create-checkout-session.js` — cria Checkout somente para usuário autenticado.
- `api/stripe-webhook.js` — confirma assinatura e atualiza plano no Supabase.
- `api/download-app.js` — libera download autenticado.
- `supabase/schema.sql` — tabelas, trigger e RLS básicos.

Antes de produção, substitua links `#` de Termos/Privacidade/Central de ajuda e revise seus textos jurídicos e política comercial.
