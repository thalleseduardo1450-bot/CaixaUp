# Site CaixaUp

Vitrine estática do CaixaUp. Abra `index.html` em um servidor HTTP para testar.

## Stripe de teste

Os produtos recorrentes foram criados na conta de teste:

- CaixaUp Pro: `R$ 89/mês`, produto `prod_VCLOWcVBtTsOZS`, preço `price_1UBwi3BcBnTOAk91niAU7bwm`.
- CaixaUp Premium: `R$ 119/mês`, produto `prod_VCLPODv7R2B90U`, preço `price_1UBwiLBcBnTOAk91UpWSw8ts`.
- Checkout Pro de teste: `https://buy.stripe.com/test_eVqbJ074s2vn7jc3rkeQM00` — trial de 7 dias.
- Checkout Premium de teste: `https://buy.stripe.com/test_3cIeVcdsQee5dHA9PIeQM01` — trial de 7 dias.

Os IDs e links de teste são públicos e não são chaves secretas. Os links reais ainda dependem da ativação do modo de produção e da configuração do webhook.

## Próxima etapa segura

1. Criar Payment Links no modo de teste com trial de 7 dias, ou um endpoint server-side que crie sessões Checkout.
2. Configurar webhook assinado para atualizar `assinaturas` somente após eventos confirmados.
3. Testar cancelamento, expiração do trial e retorno ao plano Grátis.
4. Repetir a configuração no modo de produção depois de verificar a conta e o domínio.

Nunca coloque `sk_live`, `sk_test`, segredo de webhook ou chave privada neste site.
