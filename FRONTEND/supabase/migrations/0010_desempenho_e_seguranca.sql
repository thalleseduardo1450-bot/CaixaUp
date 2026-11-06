-- 0010: desempenho e segurança (pedido "otimiza o caixaUP e no supabase").
-- Não muda dados, só índices, regras de acesso (RLS) e permissões.

-- 1) RLS: a função usuario_empresa_id() era chamada uma vez POR LINHA lida
--    (cada chamada lê a tabela perfis). Com "(select ...)" o Postgres calcula
--    uma vez por consulta. Mesma regra, mesmo resultado, bem mais rápido em
--    listas grandes (ex.: 1016 produtos = 1016 leituras de perfis antes).
do $$
declare t text;
begin
  foreach t in array array['caixas','categorias','clientes','fornecedores','itens_venda',
    'movimentacoes_caixa','movimentacoes_conta_cliente','movimentacoes_estoque','pagamentos',
    'produtos','registros_operacionais','sessoes_caixa','vendas'] loop
    execute format(
      'alter policy empresa_acesso on public.%I using (empresa_id = (select public.usuario_empresa_id())) with check (empresa_id = (select public.usuario_empresa_id()))', t);
  end loop;
end $$;

alter policy empresas_select on public.empresas
  using (id = (select public.usuario_empresa_id()));
alter policy empresas_update on public.empresas
  using (id = (select public.usuario_empresa_id()) and (select public.usuario_admin()))
  with check (id = (select public.usuario_empresa_id()) and (select public.usuario_admin()));

alter policy perfis_select on public.perfis
  using (id = (select auth.uid()) or (empresa_id = (select public.usuario_empresa_id()) and (select public.usuario_admin())));
alter policy perfis_update on public.perfis
  using (id = (select auth.uid()) or (empresa_id = (select public.usuario_empresa_id()) and (select public.usuario_admin())))
  with check (id = (select auth.uid()) or (empresa_id = (select public.usuario_empresa_id()) and (select public.usuario_admin())));

alter policy preferencias_proprias on public.preferencias_usuario
  using (usuario_id = (select auth.uid()) and (select public.usuario_empresa_id()) is not null)
  with check (usuario_id = (select auth.uid()) and (select public.usuario_empresa_id()) is not null);

-- 2) Índices para as ligações entre tabelas (itens e pagamentos de cada venda,
--    vendas de cada sessão de caixa, etc.) e para as consultas mais usadas.
create index if not exists itens_venda_venda_id_idx on public.itens_venda (venda_id);
create index if not exists itens_venda_produto_id_idx on public.itens_venda (produto_id);
create index if not exists pagamentos_venda_id_idx on public.pagamentos (venda_id);
create index if not exists vendas_sessao_caixa_id_idx on public.vendas (sessao_caixa_id);
create index if not exists vendas_cliente_id_idx on public.vendas (cliente_id);
create index if not exists vendas_usuario_id_idx on public.vendas (usuario_id);
create index if not exists vendas_cancelado_por_idx on public.vendas (cancelado_por);
create index if not exists vendas_empresa_data_idx on public.vendas (empresa_id, created_at desc);
create index if not exists movimentacoes_caixa_sessao_idx on public.movimentacoes_caixa (sessao_caixa_id);
create index if not exists movimentacoes_caixa_usuario_idx on public.movimentacoes_caixa (usuario_id);
create index if not exists movimentacoes_conta_cliente_cliente_idx on public.movimentacoes_conta_cliente (cliente_id);
create index if not exists movimentacoes_conta_cliente_venda_idx on public.movimentacoes_conta_cliente (venda_id);
create index if not exists movimentacoes_estoque_produto_idx on public.movimentacoes_estoque (produto_id);
create index if not exists movimentacoes_estoque_usuario_idx on public.movimentacoes_estoque (usuario_id);
create index if not exists perfis_empresa_id_idx on public.perfis (empresa_id);
create index if not exists produtos_categoria_id_idx on public.produtos (categoria_id);
create index if not exists produtos_empresa_ativo_nome_idx on public.produtos (empresa_id, ativo, nome, id);
create index if not exists produtos_empresa_sku_idx on public.produtos (empresa_id, sku);
create index if not exists requisicoes_venda_usuario_idx on public.requisicoes_venda (usuario_id);
create index if not exists sessoes_caixa_caixa_id_idx on public.sessoes_caixa (caixa_id);
create index if not exists sessoes_caixa_usuario_id_idx on public.sessoes_caixa (usuario_id);
create index if not exists sessoes_caixa_empresa_status_idx on public.sessoes_caixa (empresa_id, status, data_abertura desc);

-- 3) Segurança: funções que quem não entrou no sistema conseguia chamar.
revoke execute on function public.usuario_empresa_id() from public, anon;
revoke execute on function public.handle_novo_perfil() from public, anon, authenticated;
alter function public.set_updated_at() set search_path = '';
