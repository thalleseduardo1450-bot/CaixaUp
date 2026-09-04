begin;

create or replace function public.usuario_empresa_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.empresa_id from public.perfis p join public.empresas e on e.id = p.empresa_id
  where p.id = auth.uid() and p.ativo and e.ativo;
$$;
revoke all on function public.usuario_empresa_id() from public, anon;
grant execute on function public.usuario_empresa_id() to authenticated;

revoke insert, update, delete on public.perfis from anon, authenticated;
grant update (nome, telefone) on public.perfis to authenticated;
revoke insert, delete on public.empresas from anon, authenticated;
drop policy if exists empresas_update on public.empresas;
create policy empresas_update on public.empresas for update to authenticated
using (id = public.usuario_empresa_id() and exists (
  select 1 from public.perfis where id = auth.uid() and cargo in ('proprietario', 'administrador')
)) with check (id = public.usuario_empresa_id());

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id),
  usuario_id uuid references public.perfis(id),
  entidade text not null,
  registro_id uuid,
  acao text not null,
  motivo text not null default '',
  antes jsonb,
  depois jsonb,
  created_at timestamptz not null default now()
);
alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria for select to authenticated
using (empresa_id = public.usuario_empresa_id() and exists (
  select 1 from public.perfis where id = auth.uid() and cargo in ('proprietario', 'administrador', 'gerente')
));
create index if not exists auditoria_empresa_data on public.auditoria(empresa_id, created_at desc);

alter table public.vendas add column if not exists chave_requisicao uuid;
alter table public.vendas add column if not exists revisao integer not null default 1;
alter table public.empresas add column if not exists permitir_sem_estoque boolean not null default true;
create unique index if not exists vendas_idempotencia on public.vendas(empresa_id, chave_requisicao) where chave_requisicao is not null;
create index if not exists vendas_empresa_data on public.vendas(empresa_id, created_at desc, id);
create index if not exists itens_venda_venda on public.itens_venda(venda_id);
create index if not exists pagamentos_venda on public.pagamentos(venda_id);

create table if not exists public.vendas_suspensas (
  id uuid primary key,
  empresa_id uuid not null references public.empresas(id),
  usuario_id uuid not null references public.perfis(id),
  cliente_id uuid references public.clientes(id),
  label text not null,
  items jsonb not null,
  total numeric(12,2) not null,
  status text not null default 'suspensa' check(status in ('suspensa','em_atendimento','concluida','cancelada')),
  claim_token uuid,
  claimed_by uuid references public.perfis(id),
  revisao integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vendas_suspensas enable row level security;
revoke all on public.vendas_suspensas from anon,authenticated;
create index if not exists suspensas_empresa_status on public.vendas_suspensas(empresa_id,status,updated_at desc);

create or replace function public.finalizar_venda(
  p_chave uuid, p_itens jsonb, p_pagamentos jsonb,
  p_cliente uuid default null, p_desconto numeric default 0,
  p_total_esperado numeric default null, p_claim_token uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  empresa uuid := public.usuario_empresa_id();
  venda public.vendas;
  produto public.produtos;
  sessao uuid;
  item jsonb;
  pagamento jsonb;
  itens jsonb := '[]';
  subtotal numeric := 0;
  total numeric;
  quantidade numeric;
  valor numeric;
  pago numeric := 0;
  fiado numeric := 0;
  sem_estoque boolean;
  suspensa public.vendas_suspensas;
begin
  if empresa is null or p_chave is null then raise exception 'Sessão inválida'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(empresa::text, 0));
  select * into venda from public.vendas where empresa_id = empresa and chave_requisicao = p_chave;
  if found then return jsonb_build_object('saleNumber', venda.numero::text, 'saleId', venda.id, 'total', venda.total, 'replayed', true); end if;
  select * into suspensa from public.vendas_suspensas where id=p_chave and empresa_id=empresa for update;
  if found and (suspensa.status <> 'em_atendimento' or suspensa.claimed_by is distinct from auth.uid()
    or suspensa.claim_token is distinct from p_claim_token or p_claim_token is null) then raise exception 'Venda em atendimento por outra estação'; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 2000
     or octet_length(p_itens::text) > 1000000 then raise exception 'Itens inválidos ou venda muito grande'; end if;
  if jsonb_typeof(p_pagamentos) is distinct from 'array' or jsonb_array_length(p_pagamentos) not between 1 and 20
    then raise exception 'Pagamentos inválidos'; end if;
  if p_desconto is null or p_desconto < 0 or p_desconto > 9999999999.99 or p_desconto <> round(p_desconto, 2) then raise exception 'Desconto inválido'; end if;
  if p_total_esperado is null or p_total_esperado <= 0 or p_total_esperado > 9999999999.99 then raise exception 'Total inválido'; end if;
  if jsonb_array_length(p_pagamentos)>1 then perform public.exigir_recurso('multiplos_pagamentos'); end if;
  if p_cliente is not null then perform public.exigir_recurso('clientes'); end if;
  if p_desconto > 0 and not exists(select 1 from public.perfis where id = auth.uid() and cargo in ('proprietario','administrador','gerente'))
    then raise exception 'Sem permissão para desconto'; end if;
  select id into sessao from public.sessoes_caixa where empresa_id = empresa and status = 'aberto'
    order by data_abertura desc limit 1 for update;
  if sessao is null then raise exception 'Abra o caixa antes de vender'; end if;
  if p_cliente is not null and not exists(select 1 from public.clientes where id = p_cliente and empresa_id = empresa)
    then raise exception 'Cliente inválido'; end if;
  select permitir_sem_estoque into sem_estoque from public.empresas where id = empresa;
  for item in select jsonb_build_object('productId', (value->>'productId')::uuid, 'quantity', sum((value->>'quantity')::numeric))
    from jsonb_array_elements(p_itens) group by (value->>'productId')::uuid order by (value->>'productId')::uuid
  loop
    select * into produto from public.produtos where id = (item->>'productId')::uuid and empresa_id = empresa and ativo for update;
    if not found then raise exception 'Produto indisponível'; end if;
    if suspensa.id is not null then
      select coalesce((select (value->>'unitPriceCents')::numeric / 100 from jsonb_array_elements(suspensa.items)
        where value->>'id'=produto.id::text limit 1),produto.preco_venda) into produto.preco_venda;
    end if;
    quantidade := (item->>'quantity')::numeric;
    if quantidade is null or quantidade <= 0 or quantidade > 9999 or quantidade <> round(quantidade, 3)
      then raise exception 'Quantidade inválida'; end if;
    if not sem_estoque and produto.estoque_atual < quantidade then raise exception 'Estoque insuficiente: %', produto.nome; end if;
    if produto.preco_venda < 0 or produto.preco_venda > 9999999999.99
      or abs(produto.estoque_atual)>999999999.999 then raise exception 'Preço ou estoque inválido'; end if;
    subtotal := subtotal + round(produto.preco_venda * quantidade, 2);
    itens := itens || jsonb_build_array(jsonb_build_object('id', produto.id, 'nome', produto.nome,
      'preco', produto.preco_venda, 'quantidade', quantidade, 'estoque', produto.estoque_atual));
  end loop;
  total := subtotal - p_desconto;
  if total <= 0 or p_total_esperado is null or total <> p_total_esperado then
    raise exception 'Total divergente. Atualize os preços e confira a venda antes de confirmar.';
  end if;
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    valor := (pagamento->>'valor')::numeric;
    if valor is null or valor <= 0 or valor > 9999999999.99 or valor <> round(valor,2) or coalesce(pagamento->>'forma','') not in ('dinheiro','pix','debito','credito','cheque','fiado','outros')
      then raise exception 'Pagamento inválido'; end if;
    pago := pago + valor;
    if pagamento->>'forma' = 'fiado' then fiado := fiado + valor; end if;
  end loop;
  if pago <> total then raise exception 'A soma dos pagamentos deve corresponder ao total'; end if;
  if fiado > 0 and p_cliente is null then raise exception 'Identifique o cliente para vender fiado'; end if;
  insert into public.vendas(empresa_id,sessao_caixa_id,usuario_id,cliente_id,subtotal,desconto,total,chave_requisicao)
    values(empresa,sessao,auth.uid(),p_cliente,subtotal,p_desconto,total,p_chave) returning * into venda;
  insert into public.itens_venda(empresa_id,venda_id,produto_id,nome_produto,quantidade,preco_unitario,subtotal)
    select empresa,venda.id,(value->>'id')::uuid,value->>'nome',(value->>'quantidade')::numeric,
      (value->>'preco')::numeric,round((value->>'preco')::numeric * (value->>'quantidade')::numeric,2)
    from jsonb_array_elements(itens);
  update public.produtos p set estoque_atual = p.estoque_atual - (i.value->>'quantidade')::numeric
    from jsonb_array_elements(itens) i where p.id = (i.value->>'id')::uuid and p.empresa_id = empresa;
  insert into public.movimentacoes_estoque(empresa_id,produto_id,usuario_id,tipo,quantidade,estoque_anterior,estoque_novo,motivo,referencia_id)
    select empresa,(value->>'id')::uuid,auth.uid(),'venda',(value->>'quantidade')::numeric,
      (value->>'estoque')::numeric,(value->>'estoque')::numeric - (value->>'quantidade')::numeric,'Venda #'||venda.numero,venda.id
    from jsonb_array_elements(itens);
  insert into public.pagamentos(empresa_id,venda_id,forma,valor)
    select empresa,venda.id,value->>'forma',(value->>'valor')::numeric from jsonb_array_elements(p_pagamentos);
  if fiado > 0 then
    if exists(select 1 from public.clientes where id=p_cliente and (saldo_devedor<0 or saldo_devedor>9999999999.99-fiado)) then raise exception 'Saldo do cliente inválido'; end if;
    update public.clientes set saldo_devedor = saldo_devedor + fiado where id = p_cliente and empresa_id = empresa;
    insert into public.movimentacoes_conta_cliente(empresa_id,cliente_id,venda_id,tipo,valor,descricao)
      values(empresa,p_cliente,venda.id,'debito',fiado,'Venda #'||venda.numero);
  end if;
  insert into public.auditoria(empresa_id,usuario_id,entidade,registro_id,acao,depois)
    values(empresa,auth.uid(),'vendas',venda.id,'concluir',jsonb_build_object('total',total,'itens',jsonb_array_length(itens)));
  update public.vendas_suspensas set status='concluida',claim_token=null,updated_at=now() where id=suspensa.id;
  return jsonb_build_object('saleNumber',venda.numero::text,'saleId',venda.id,'total',total,'replayed',false);
end;
$$;
revoke all on function public.finalizar_venda(uuid,jsonb,jsonb,uuid,numeric,numeric,uuid) from public, anon;
grant execute on function public.finalizar_venda(uuid,jsonb,jsonb,uuid,numeric,numeric,uuid) to authenticated;

create or replace function public.editar_pagamento_venda(p_venda uuid,p_revisao integer,p_pagamentos jsonb,p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  empresa uuid := public.usuario_empresa_id();
  venda public.vendas;
  pagamento jsonb;
  pago numeric := 0;
  valor numeric;
  antes jsonb;
begin
  if empresa is null or not exists(select 1 from public.perfis where id = auth.uid() and ativo and cargo in ('proprietario','administrador','gerente'))
    then raise exception 'Sem permissão para corrigir pagamentos'; end if;
  perform public.exigir_recurso('editar_venda');
  if length(trim(coalesce(p_motivo,''))) < 5 or length(p_motivo) > 500 then raise exception 'Informe o motivo da correção'; end if;
  select * into venda from public.vendas where id = p_venda and empresa_id = empresa for update;
  if not found or venda.status <> 'concluida' or venda.revisao is distinct from p_revisao then raise exception 'Venda alterada ou indisponível. Reabra os detalhes.'; end if;
  if exists(select 1 from public.pagamentos where venda_id = p_venda and forma = 'fiado') then
    raise exception 'Venda fiada exige conciliação da conta do cliente antes da correção'; end if;
  if jsonb_typeof(p_pagamentos) is distinct from 'array' or jsonb_array_length(p_pagamentos) not between 1 and 20
    then raise exception 'Pagamentos inválidos'; end if;
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    valor := (pagamento->>'valor')::numeric;
    if valor is null or valor <= 0 or valor > 9999999999.99 or valor <> round(valor,2) or coalesce(pagamento->>'forma','') not in ('dinheiro','pix','debito','credito','cheque','outros')
      then raise exception 'Pagamento inválido'; end if;
    pago := pago + valor;
  end loop;
  if pago <> venda.total then raise exception 'Soma dos pagamentos diferente do total'; end if;
  select jsonb_agg(jsonb_build_object('forma',anterior.forma,'valor',anterior.valor)) into antes from public.pagamentos anterior where anterior.venda_id = p_venda;
  delete from public.pagamentos where venda_id = p_venda and empresa_id = empresa;
  insert into public.pagamentos(empresa_id,venda_id,forma,valor)
    select empresa,p_venda,value->>'forma',(value->>'valor')::numeric from jsonb_array_elements(p_pagamentos);
  update public.vendas set revisao = revisao + 1 where id = p_venda;
  insert into public.auditoria(empresa_id,usuario_id,entidade,registro_id,acao,motivo,antes,depois)
    values(empresa,auth.uid(),'pagamentos',p_venda,'corrigir',p_motivo,antes,p_pagamentos);
end;
$$;
revoke all on function public.editar_pagamento_venda(uuid,integer,jsonb,text) from public, anon;
grant execute on function public.editar_pagamento_venda(uuid,integer,jsonb,text) to authenticated;
revoke insert, update, delete on public.vendas,public.itens_venda,public.pagamentos,public.movimentacoes_conta_cliente from authenticated, anon;
revoke all on function public.registrar_debito_cliente(uuid,uuid,numeric,text) from public,anon,authenticated;

commit;
