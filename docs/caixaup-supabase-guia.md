# CaixaUp + Supabase — Guia passo a passo (para iniciantes)

Guia oficial do projeto para transformar o CaixaUp em um sistema completo
usando **React no frontend** e **Supabase** como backend, autenticação e banco
PostgreSQL.

> Regra deste guia: **uma etapa por vez**. Só avance depois de testar a etapa
> atual. Cada etapa termina com um teste de confirmação.

---

## Conceitos básicos (com exemplos do CaixaUp)

| Conceito | O que é | Exemplo no CaixaUp |
|---|---|---|
| **Supabase** | Plataforma que entrega banco de dados, autenticação e API prontos na nuvem. Você não precisa criar um backend do zero. | É o "lugar" onde ficam os dados e o login do CaixaUp |
| **PostgreSQL** | Banco de dados relacional: dados organizados em tabelas (linhas e colunas), como uma planilha gigante conectada. | Tabela `produtos` guarda todos os produtos |
| **Supabase Auth** | Sistema de login pronto (cadastro, login, logout, recuperação de senha, sessão). | O usuário entra com e-mail e senha |
| **API** | Ponte que liga o app (React) ao banco. O Supabase cria a API automaticamente. | O React pede "lista de produtos" e a API responde |
| **Tabela** | Estrutura que guarda um tipo de dado. | `produtos`, `vendas`, `clientes` |
| **Coluna** | Cada campo de uma tabela. | Coluna `preco_venda` da tabela `produtos` |
| **Chave primária (PK)** | Identificador único de cada linha. | `id` do produto |
| **Chave estrangeira (FK)** | Coluna que liga uma tabela a outra. | `categoria_id` em `produtos` aponta para `categorias.id` |
| **UUID** | Identificador único universal (letras e números). | `3f2a1c4e-...` — usado como `id` para nunca colidir entre empresas |
| **RLS** | Row Level Security: regra no banco que limita quais linhas cada usuário vê. | Usuário da Empresa A só enxerga produtos da Empresa A |
| **Policies** | Regras específicas do RLS (quem pode ver/criar/editar/apagar). | Policy "ver produtos da minha empresa" |
| **Variável de ambiente** | Valor guardado fora do código (arquivo `.env`), para não expor segredos. | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| **Frontend** | O que o usuário vê e toca. | Telas React (Login, PDV, Dashboard) |
| **Backend** | Onde os dados vivem e as regras rodam. | Supabase (PostgreSQL + Auth) |

---

# ETAPA 1 — Criar o projeto no Supabase

**O que vamos fazer:** criar uma conta gratuita no Supabase e criar o projeto
que vai hospedar o banco de dados do CaixaUp.

**Por que:** o Supabase é o "backend" — tudo que o CaixaUp salvar (produtos,
vendas, clientes, caixa) vai morar no PostgreSQL que esse projeto cria.

---

### 1.1 — Criar conta

1. Abra o navegador e acesse: **https://supabase.com**
2. Clique no botão **"Start your project"** (ou **"Sign in"** no topo).
3. Escolha **"Continue with GitHub"** (recomendado) ou **"Continue with Email"**.
4. Complete o cadastro e confirme o e-mail, se pedir.

> Se já tem conta, é só entrar (Sign in).

### 1.2 — Criar o projeto

1. Depois de logado, você cai no **Dashboard** (painel de projetos).
2. Clique no botão verde **"New project"** (canto superior direito).
3. Em **Organization** (organização): selecione a sua organização (ou crie uma
   nova, ex.: nome da sua empresa). Mantenha o plano **Free** (grátis).
4. Em **Project name**: digite `caixaup`
5. Em **Database Password**: clique em **"Gerar uma senha"** (link verde) e
   **guarde essa senha com segurança** — você vai precisar dela para se conectar
   ao banco diretamente. (Nunca cole a senha do banco em chats/código.)
6. Em **Region**: escolha **América do Sul (São Paulo)** — é a região mais
   próxima do Brasil, melhor desempenho.
7. Clique no botão verde **"Create new project"**.
8. Aguarde a criação (1–2 minutos). Quando terminar, o painel do projeto abre.

### 1.3 — Copiar as chaves do projeto

Agora vamos pegar as duas informações que o React vai precisar:

1. No painel do projeto, clique no botão **"Connect"** no topo (ao lado do nome
   do projeto). Abre uma janela com as informações de conexão.
   - **Project URL**: começa com `https://....supabase.co` — copie.
   - **Publishable key**: começa com `sb_publishable_...` — copie.
2. Alternativa (mesma coisa): menu lateral **⚙ Settings → API Keys**, aba
   **"Publishable and secret API keys"**.
   - **Project URL** e **Publishable key** estão lá.

> **Importante — segurança:** a **Publishable key** é pública por design e pode
> (e deve) ir no React. A **Secret key** (`sb_secret_...`) e a legada
> `service_role` têm acesso total ao banco e **nunca** podem ir para o frontend.
> Nesta etapa você **não precisa** da secret key — ela só é usada em servidor,
> e o CaixaUp vai operar com RLS (segurança no banco), não com a secret key.

### 1.4 — Testar se funcionou

1. No painel do projeto, clique em **"SQL Editor"** no menu lateral esquerdo.
2. Clique em **"+ New query"** (nova consulta).
3. Cole e execute:
   ```sql
   select 1 as ok, current_database() as banco;
   ```
4. Clique em **"Run"** (ou Ctrl+Enter).
5. **Funcionou se:** aparecer um resultado com `ok = 1` e `banco = postgres`.

Esse teste prova que o banco do projeto está vivo e respondendo.

### 1.5 — Guarde suas chaves

Crie na raiz do projeto (ao lado de `README.md`) um arquivo chamado `.env.local`
e cole seus valores (troque pelos seus):

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE
```

**Não envie esse arquivo para o Git** (ele já está no `.gitignore`).

> **O que mandar para mim:** para eu continuar a Etapa 2, me mande apenas
> a **Project URL** e a **Publishable key** (a pública). Nunca me mande a
> secret key nem a senha do banco.

---

---

# ETAPA 2 — Configurar React + Supabase ✅ (concluída)

**O que fizemos:** criamos um app React novo (`caixaup-supabase/`) e o
conectamos ao seu projeto Supabase.

- `npm install @supabase/supabase-js` (a ponte React ↔ Supabase)
- `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
- `src/lib/supabase.js` — a conexão única do app com o Supabase
- Tela de teste que mostrou **"✅ Conectado ao Supabase"**

O servidor roda com `npm run dev` (porta 5175 neste projeto).

---

# ETAPA 3 — Autenticação (login, logout, sessão e proteção de rotas)

**O que vamos fazer:** criar o login com e-mail e senha, cadastro de conta,
recuperação de senha, sessão persistente (o usuário continua logado ao
recarregar a página) e proteção das páginas internas.

**Por que:** nenhum sistema de caixa funciona sem saber quem está operando.
A partir daqui, o CaixaUp só mostra as telas internas para quem está logado.
O login usa o **Supabase Auth** (pronto, seguro — senha com hash, sessão por
token JWT, tudo no padrão da indústria).

**Como funciona a sessão persistente:** quando o usuário entra, o Supabase
guarda o token de sessão no navegador. Ao reabrir o app, o `AuthContext`
chama `supabase.auth.getSession()` para restaurar essa sessão — por isso o
usuário não precisa digitar a senha de novo.

---

## 3.1 — Onde clicar no Supabase (configuração)

O login por e-mail/senha já vem **ligado por padrão**. Você só precisa:

1. **Configurar o endereço do app** (para o e-mail de recuperação de senha
   conseguir voltar ao app): menu lateral **⚙ Settings → Authentication →
   URL Configuration** → em **Site URL** coloque `http://localhost:5175` →
   **Save**.
2. **(Opcional) Criar um usuário de teste sem confirmação por e-mail:**
   menu lateral **Authentication → Users → "Add user"** → informe o e-mail e
   uma senha (o botão pode gerar uma). Assim você testa o login na hora,
   sem depender do e-mail de confirmação.
3. **Entender a confirmação por e-mail:** por padrão, cadastros novos pedem
   confirmação por e-mail (recomendado em produção). Para testes, você pode
   desligar em **Authentication → Sign In / Up → Email → "Confirm email"**
   (desmarque e salve) — ou apenas usar o "Add user" do item 2.

> 🔒 **Segurança:** o frontend só usa a **Publishable key** (pública por
> design). A secret key continua proibida no navegador.

---

## 3.2 — Arquivos criados (todos dentro de `caixaup-supabase/src/`)

| Arquivo | Função |
|---|---|
| `context/AuthContext.jsx` | Guarda a sessão e expõe `signIn`, `signUp`, `signOut` para o app todo |
| `components/ProtectedRoute.jsx` | Cerca uma página: sem login → redireciona para `/login` |
| `pages/Login.jsx` | Tela de entrada (abas Entrar / Criar conta) |
| `pages/ResetPassword.jsx` | Recuperação de senha (envio de e-mail + nova senha) |
| `pages/Dashboard.jsx` | Página protegida provisória (mostra usuário logado + sair) |
| `App.jsx` | Rotas: `/login`, `/recuperar-senha`, `/` (protegida) |
| `main.jsx` | Envolve o app com `AuthProvider` + `BrowserRouter` |

### Explicação dos pontos principais

- **`AuthContext.jsx`** é um *Context* do React: ele guarda o usuário logado
  uma única vez e entrega para qualquer tela via `useAuth()`. No carregamento,
  ele restaura a sessão salva (`getSession`) e fica ouvindo mudanças
  (`onAuthStateChange`) — se o token expirar ou o usuário sair em outra aba,
  o app reage sozinho.
- **`ProtectedRoute.jsx`**: enquanto restaura a sessão mostra "Carregando…"
  (para não piscar a tela errada); sem usuário, `Navigate to="/login"`;
  com usuário, renderiza a página.
- **`Login.jsx`**: chama `signInWithPassword` (entrar) ou `signUp` (criar
  conta). Erros do Supabase são traduzidos para mensagens em português
  (ex.: e-mail/senha incorretos).
- **`ResetPassword.jsx`**: o e-mail de recuperação volta para `/recuperar-senha`
  com um token na URL. A página detecta `#type=recovery` no endereço e troca
  o formulário: pedir e-mail → definir nova senha (`updateUser`).

---

## 3.3 — Como testar (passo a passo)

1. Com o servidor rodando (`npm run dev`), abra `http://localhost:5175/`.
2. **Redirecionamento:** deslogado, `/` deve cair sozinho em `/login`.
3. **Login com erro:** digite um e-mail e senha quaisquer → deve aparecer
   "E-mail ou senha incorretos." (prova que o app falou com o Supabase).
4. **Login de verdade:** entre com o usuário criado no item 3.1.2 → deve
   abrir o Dashboard mostrando seu e-mail.
5. **Sessão persistente:** recarregue a página (F5) → continua logado.
6. **Logout:** clique em "Sair (logout)" → volta para `/login`.
7. **Proteção:** com alguém logado, abra `/` em outra aba anônima → cai no login.
8. **Criar conta (opcional):** aba "Criar conta" → confirme o e-mail se
   pedir → entre com a conta nova.
9. **Recuperar senha (opcional):** em `/login` clique em "Esqueci minha
   senha" → digite o e-mail → chega o link → defina a nova senha.

**Funcionou se:** o fluxo 4–6 funcionou (login → dashboard → sair).

---

## Ordem das próximas etapas

4. Criar tabelas empresas e perfis
5. Criar RLS e policies
6. Categorias
7. Produtos
8. Estoque
9. Clientes
10. Abertura de caixa
11. Sangria e suprimento
12. PDV
13. Vendas
14. Integrar estoque com vendas
15. Fechamento de caixa
16. Cancelamento
17. Dashboard
18. Relatórios
19. Permissões
20. Revisão de segurança

---

# ETAPA 4 — Hospedar o banco de dados na nuvem (Supabase)

**O que faz:** cria as 12 tabelas do CaixaUp (empresas, perfis, categorias, produtos, clientes, caixas, sessoes_caixa, movimentacoes_caixa, vendas, itens_venda, pagamentos, movimentacoes_estoque) no PostgreSQL do seu projeto Supabase, com segurança RLS e dados de demonstração.

**Arquivo com o SQL completo:** `caixaup-supabase/supabase/migrations/0001_caixaup_schema.sql`

## Passo a passo (2 minutos)

1. Abra o painel do Supabase → **https://supabase.com/dashboard** → clique no projeto **caixaup**
2. Menu lateral esquerdo → **SQL Editor** (ícone `>_`)
3. Clique em **"+ New query"** (ou "Nova consulta")
4. **Abra o arquivo** `caixaup-supabase\supabase\migrations\0001_caixaup_schema.sql` no Bloco de Notas (clique direito → Abrir com → Bloco de Notas), pressione `Ctrl+A` (selecionar tudo) e `Ctrl+C` (copiar)
5. Volte ao Supabase, clique dentro do editor e pressione `Ctrl+V` (colar)
6. Clique no botão azul **"Run"** (ou `Ctrl+Enter`)
7. Deve aparecer **"Success. No rows returned"** e o tempo de execução (ex.: ~0.4s)

## Como saber se funcionou

- Menu lateral esquerdo → **Table Editor** → devem aparecer as 12 tabelas na lista
- Clique em **produtos** → você deve ver os 5 produtos de demonstração (Coca-Cola 2L, Água Mineral, Café, Pão de Queijo, Chocolate)
- Clique em **empresas** → deve existir "Mercado Demonstracao"

## O que o SQL faz (resumo)

| Parte | O que é |
|---|---|
| 12 tabelas | Todas as tabelas do sistema, com `id` UUID (identificador universal) e `empresa_id` em cada uma (multiempresa) |
| Triggers | `updated_at` automático + criação do perfil automaticamente quando alguém se cadastra no app |
| RLS + Policies | Segurança **no banco**: cada usuário só vê os dados da própria empresa |
| Índices | Consultas rápidas (busca de produto por nome/código de barras, vendas por data, etc.) |
| Seed | Empresa "Mercado Demonstracao" + 5 produtos + cliente demo + caixa |

## Depois de rodar (passo opcional, mas importante)

Faça **login no app CaixaUp** (http://localhost:5175) com a conta que você criou na Etapa 3 e, no SQL Editor, rode só este trecho para ligar seu perfil à empresa demo:

```sql
update public.perfis
   set empresa_id = '10000000-0000-4000-8000-000000000001'
 where id = auth.uid();
```

Sem isso, o app ainda mostra a tela de login mas não lista dados (seu perfil ainda não pertence a nenhuma empresa — é a segurança RLS funcionando).
