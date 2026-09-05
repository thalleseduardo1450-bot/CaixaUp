# Segurança do CaixaUp

## Proteções aplicadas

- O Electron usa isolamento de contexto, sandbox e integração Node desativada no renderer.
- IPC aceita somente mensagens da janela principal e da origem local confiável.
- Navegação externa é bloqueada; links externos só podem abrir por HTTPS.
- O servidor local aplica CSP, bloqueia frames, permissões do dispositivo, cache persistente e source maps.
- Supabase usa chave publicável no frontend; chaves privilegiadas não pertencem ao bundle.
- Dados de vendas locais são separados por empresa e usuário; backups aceitam somente chaves conhecidas e têm limites de tamanho.
- Operações administrativas e de venda são protegidas por funções server-side, RLS, MFA quando exigido, idempotência e auditoria.

## Regras operacionais

- Nunca colocar `service_role`, senha de banco, chave privada, segredo de webhook ou token completo em arquivos do frontend.
- Não confiar em preço, quantidade, desconto, empresa ou status enviados pelo navegador; repetir validação no banco/API.
- Não registrar senha, CVV, PAN completo, tokens ou segredos nos logs.
- Fazer backup local antes de trocar de computador ou reinstalar o aplicativo. O arquivo deve ser guardado em local privado.
- Atualizações devem ser geradas pelo processo oficial do Electron Builder e distribuídas somente por uma release confiável.

## Limites conhecidos

O `localStorage` é adequado para rascunhos do terminal, mas não é armazenamento criptografado. Para dados sensíveis ou operação entre terminais, é necessário migrar para armazenamento protegido do sistema ou para o backend com RLS.
