begin;
create function public.suspender_venda(p_id uuid,p_itens jsonb,p_label text,p_cliente uuid default null,p_token uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare empresa uuid := public.usuario_empresa_id(); registro public.vendas_suspensas; produto public.produtos;
  item jsonb; itens jsonb := '[]'; quantidade numeric; preco numeric; total numeric := 0; limite integer;
begin
  if empresa is null or p_id is null then raise exception 'Sessão inválida'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(empresa::text,0));
  select * into registro from public.vendas_suspensas where id=p_id for update;
  if found and (registro.empresa_id <> empresa or registro.status <> 'em_atendimento' or registro.claimed_by is distinct from auth.uid()
    or p_token is null or registro.claim_token is distinct from p_token) then raise exception 'Venda indisponível para suspensão'; end if;
  if exists(select 1 from public.vendas where empresa_id=empresa and chave_requisicao=p_id) then raise exception 'Venda já concluída'; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 2000 or octet_length(p_itens::text)>1000000
    then raise exception 'Itens inválidos'; end if;
  if p_cliente is not null and not exists(select 1 from public.clientes where id=p_cliente and empresa_id=empresa)
    then raise exception 'Cliente inválido'; end if;
  select (recursos->>'suspensas')::integer into limite from public.planos where codigo=public.plano_efetivo();
  if limite is not null and (select count(*) from public.vendas_suspensas where empresa_id=empresa and status in ('suspensa','em_atendimento') and id<>p_id)>=limite
    then raise exception 'Limite de vendas suspensas do plano atingido'; end if;
  for item in select value from jsonb_array_elements(p_itens) loop
    select * into produto from public.produtos where id=(item->>'productId')::uuid and empresa_id=empresa and ativo;
    if not found or not public.produto_disponivel_plano(produto.id) then raise exception 'Produto indisponível'; end if;
    quantidade := (item->>'quantity')::numeric;
    if quantidade is null or quantidade <= 0 or quantidade > 9999 or quantidade<>round(quantidade,3) then raise exception 'Quantidade inválida'; end if;
    preco := coalesce((select (value->>'unitPriceCents')::numeric / 100 from jsonb_array_elements(registro.items) where value->>'id'=produto.id::text limit 1),produto.preco_venda);
    total := total + round(preco*quantidade,2);
    itens := itens || jsonb_build_array(jsonb_build_object('id',produto.id,'code',coalesce(nullif(produto.codigo_barras,''),produto.sku),
      'name',produto.nome,'quantity',quantidade,'unitPriceCents',preco*100,'addedAt',extract(epoch from now())*1000));
  end loop;
  insert into public.vendas_suspensas(id,empresa_id,usuario_id,cliente_id,label,items,total)
    values(p_id,empresa,auth.uid(),p_cliente,left(coalesce(nullif(trim(p_label),''),'Venda suspensa'),120),itens,total)
    on conflict(id) do update set status='suspensa',items=excluded.items,total=excluded.total,cliente_id=excluded.cliente_id,
      label=excluded.label,claim_token=null,claimed_by=null,revisao=public.vendas_suspensas.revisao+1,updated_at=now();
end;
$$;
create function public.listar_vendas_suspensas(p_busca text default '',p_pagina integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if public.usuario_empresa_id() is null then raise exception 'Sessão inválida'; end if;
  select coalesce(jsonb_agg(to_jsonb(v)),'[]') into resultado from (
    select s.id,s.label,s.total*100 as "totalCents",extract(epoch from s.created_at)*1000 as "suspendedAt",
      p.nome as "operatorName",coalesce(c.nome,'') as "customerName",coalesce(s.cliente_id::text,'') as "customerId",
      jsonb_array_length(s.items) as "itemCount",'[]'::jsonb as items,s.revisao as revision
    from public.vendas_suspensas s join public.perfis p on p.id=s.usuario_id left join public.clientes c on c.id=s.cliente_id
    where s.empresa_id=public.usuario_empresa_id() and s.status='suspensa'
      and (s.label ilike '%'||left(p_busca,100)||'%' or c.nome ilike '%'||left(p_busca,100)||'%' or
        exists(select 1 from jsonb_array_elements(s.items) item where item->>'name' ilike '%'||left(p_busca,100)||'%'))
    order by s.updated_at desc,s.id limit 50 offset greatest(0,least(p_pagina,100000))*50
  ) v;
  return resultado;
end;
$$;
create function public.retomar_venda(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare venda public.vendas_suspensas;
begin
  update public.vendas_suspensas set status='em_atendimento',claimed_by=auth.uid(),claim_token=gen_random_uuid(),
    revisao=revisao+1,updated_at=now() where id=p_id and empresa_id=public.usuario_empresa_id() and status='suspensa' returning * into venda;
  if not found then raise exception 'Outra estação já retomou esta venda'; end if;
  return jsonb_build_object('id',venda.id,'label',venda.label,'items',venda.items,'totalCents',venda.total*100,
    'customerId',coalesce(venda.cliente_id::text,''),'customerName',coalesce((select nome from public.clientes where id=venda.cliente_id),''),
    'operatorName',(select nome from public.perfis where id=venda.usuario_id),'suspendedAt',extract(epoch from venda.created_at)*1000,
    'claimToken',venda.claim_token,'revision',venda.revisao);
end;
$$;
create function public.descartar_venda_suspensa(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.vendas_suspensas set status='cancelada',updated_at=now() where id=p_id and empresa_id=public.usuario_empresa_id() and status='suspensa'
    and (usuario_id=auth.uid() or exists(select 1 from public.perfis where id=auth.uid() and cargo in ('proprietario','administrador','gerente')));
  if not found then raise exception 'Venda indisponível ou sem permissão'; end if;
  insert into public.auditoria(empresa_id,usuario_id,entidade,registro_id,acao)
    values(public.usuario_empresa_id(),auth.uid(),'vendas_suspensas',p_id,'descartar');
end;
$$;
revoke all on function public.suspender_venda(uuid,jsonb,text,uuid,uuid),public.listar_vendas_suspensas(text,integer),public.retomar_venda(uuid),public.descartar_venda_suspensa(uuid) from public,anon;
grant execute on function public.suspender_venda(uuid,jsonb,text,uuid,uuid),public.listar_vendas_suspensas(text,integer),public.retomar_venda(uuid),public.descartar_venda_suspensa(uuid) to authenticated;
commit;
