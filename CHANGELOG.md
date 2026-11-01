# Novidades do CaixaUp

## 4.0.6

### Caixa: abrir e fechar refeito

- Tela nova de abrir e fechar caixa. O resumo do turno agora soma certo (antes ficava em R$ 0,00 e uma venda com vários itens contava várias vezes).
- Fechamento com conferência: a tela mostra quanto dinheiro deve ter na gaveta, você digita o que contou e vê se sobra ou falta.
- Sangria e suprimento registrados no caixa e descontados da conta da gaveta.
- Histórico com esperado, contado e diferença de cada caixa, e impressão do fechamento.
- Caixa aberto há mais de 24 horas para de vender até ser fechado e aberto de novo.
- Janelas de confirmação não abrem mais fora da vista em telas compridas.

### Busca de produtos no caixa

- A busca do caixa acha todos os produtos, mesmo com mais de 1.000 cadastrados.

## 4.0.5

### Abertura sempre

- A abertura animada toca toda vez que o CaixaUp abre, mesmo com as animações do Windows desligadas, e depois dela a tela entra suave.

### Telas 1024 × 768 com cara de Full HD

- Em telas menores que Full HD (1024 × 768, 1366 × 768, 1600 × 900…) o sistema usa um modo compacto: letras, espaços e colunas diminuem juntos e a tela fica com a mesma arrumação do Full HD.
- A letra continua nítida e na mesma fonte do Full HD: cada tamanho de letra é um número inteiro de pixels, sem redução da janela, e os textos cinza ficam um pouco mais escuros.
- Full HD e telas maiores continuam iguais. Para desligar, use **Configurações → Adaptar para telas menores**.

### TOTAL na coluna Venda

- A faixa do TOTAL vai de uma borda à outra da coluna Venda, em qualquer resolução.
- Valores grandes (R$ 100.000,00 para cima) diminuem a letra em vez de sair da coluna.

## 4.0.4

### Abertura nova

- Ao abrir o programa aparece uma animação de 7 segundos com o logo do CaixaUp: o "C" é desenhado, a folha verde aparece, entra o nome e o slogan, e no fim tudo fica pequeno no centro.
- A tela do caixa abre logo depois da animação. Se o carregamento demorar mais, aparece a barrinha "Iniciando servidor e banco de dados…".

## 4.0.3

### Caixa mais rápido no teclado

- F2 finaliza a venda (F9 continua funcionando). A busca de produto passou para o F5.
- A quantidade do produto na venda pode ser digitada: clique no número, digite e dê Enter.
- No campo QTD, digitar troca o 1 em vez de grudar nele.
- Valor recebido em reais: digite 90 para R$ 90,00; centavos só se quiser, depois da vírgula (90,50).
- Enter para avançar: o 1º mostra o troco, o 2º conclui a venda e o 3º abre a próxima venda.

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
