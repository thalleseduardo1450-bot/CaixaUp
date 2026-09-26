# Novidades do CaixaUp

## 3.3.50

- Volta o vídeo de abertura do CaixaUp. Os vídeos agora vão dentro do instalador e da atualização automática.

## 3.3.49

### Telas da 3.3.47 de volta

- Volta a tela Pagamentos e Fiado, a pré-visualização do cupom e as telas Fiscal, Painel, PDV e Configurações como estavam na 3.3.47 (a 3.3.48 saiu com telas antigas).
- Mantém do programa desktop da 3.3.48 o registro de falhas de rede em `caixaup-network.log`.
- As mensagens explicando o "Failed to fetch" voltam quando o código mais novo das telas estiver no GitHub.

## 3.3.48

### Conexão em outros computadores ("Failed to fetch")

- Leituras que falham por rede são repetidas automaticamente uma vez antes de mostrar erro.
- No lugar de "Failed to fetch", o CaixaUp mostra o motivo real: data/hora do Windows errada, certificado recusado (antivírus com proteção HTTPS), DNS, proxy, firewall ou falta de internet.
- Falhas de rede ficam registradas em `caixaup-network.log` na pasta de dados do CaixaUp, para suporte.
- A política de segurança da tela libera a API do CaixaUp e as consultas de CEP e código de barras.

## 3.3.28

### Catálogo completo de produtos

- A lista agora carrega todos os produtos, mesmo quando passa do limite de 1000 registros do Supabase.
- Produtos inativos aparecem identificados no cadastro e podem ser reativados.
- Produtos inativos continuam ocultos na frente de caixa.
- Exclusão e reativação respeitam a empresa do usuário.
- Valores do pagamento são digitados em reais por padrão; centavos são opcionais.
- A tecla Enter fecha a confirmação de venda e inicia a próxima venda.
- Produtos editados ou importados são reativados automaticamente.

## 3.3.26

### Cadastro de produtos, caixa e interface

- Descrição, preço unitário e quantidade inicial agora são opcionais no cadastro de produtos.
- Novo produto sem quantidade começa com estoque zero; ao editar, quantidade vazia preserva o estoque atual.
- Salvamento de produtos valida valores inválidos e informa erros de código duplicado, permissão e conexão de forma clara.
- Fechamento de caixa ganhou confirmação mais clara, foco por teclado e adaptação para `1024 × 768`.
- Tela de abertura, transições de páginas e revelação ao rolar foram refinadas, com suporte a movimento reduzido.

## 3.3.15

### Visual mais moderno e cupom corrigido

- Nova tela de abertura animada do CaixaUp.
- Janelas abrem e fecham com transição suave.
- Cupom não corta mais os últimos dígitos dos valores (ex.: R$ 10,00).
- Páginas iniciais, relatórios e histórico revelam conteúdo ao rolar.
- Botões, cards e menus com respostas visuais mais claras.

## 3.3.14

### Caixa mais rápido

- Pesquisa mostra produtos em lista leve com nome, código e preço de venda.
- Produtos selecionados permanecem visíveis em lista no centro da tela.
- Painel lateral mostra somente resumo, total e ações da venda.
- Resultados são limitados aos 80 mais relevantes para resposta imediata.

## 3.3.13

### Importação Nex

- EAN/GTIN repetido não cria nem sobrescreve o produto errado.
- Código interno do Nex tem prioridade para atualizar o produto correto.

## 3.3.12

### Leitor de código de barras

- Códigos com hífen, espaços, prefixo do leitor ou zero inicial agora são reconhecidos.
- Importação do Nex usa EAN/GTIN como código de barras e preserva o código interno.
- Produtos podem ser encontrados pelo EAN/GTIN ou pelo código interno do Nex.

## 3.3.4

### Validação final

- Versão publicada para confirmar o fluxo automático corrigido.
- Mantém o fechamento completo e a adaptação para telas `1024 × 768`.

## 3.3.3

### Correção do atualizador

- Corrigida a atualização que baixava, mas não executava o instalador.
- O CaixaUp agora encerra todos os processos antes de instalar a nova versão.
- Clicar no `X` ou usar `Alt + F4` fecha completamente o aplicativo.
- Removido o funcionamento em segundo plano pela bandeja do Windows.
- Mensagens de erro da atualização agora aparecem nas configurações.
- Novo arquivo de diagnóstico local para facilitar futuras verificações.

## 3.3.2

### Compatibilidade com telas menores

- Nova opção **Adaptar para telas menores** nas configurações.
- Interface completa ajustada automaticamente para monitores `1024 × 768`.
- Menus, caixa, botões e janelas permanecem visíveis sem cortes.
- A escala é recalculada imediatamente quando a preferência é alterada.

## 3.3.1

### Atualizações

- Verificação automática de novas versões ao abrir o aplicativo.
- Download e instalação automática das versões publicadas no GitHub.
- Nova tela com as novidades depois que a atualização termina.
- Progresso do download disponível nas configurações.

### Comportamento do aplicativo

- Opção para iniciar o CaixaUp junto com o Windows.
- Opção para fechar o aplicativo para a bandeja do sistema.
- Atalho global `Ctrl + Shift + C` para abrir o CaixaUp rapidamente.
- Botão para procurar atualizações manualmente.

### Caixa e cadastros

- Melhorias visuais e de uso na frente de caixa.
- Importação Nex aprimorada para produtos e clientes.
- Imagens automáticas para os produtos sem foto cadastrada.
- Nova identidade visual e ícone do CaixaUp.
