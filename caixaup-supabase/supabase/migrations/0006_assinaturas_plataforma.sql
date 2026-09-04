begin;
create table public.planos (
  codigo text primary key check (codigo in ('gratis','pro','premium')),
  nome text not null,
  preco_centavos integer not null check (preco_centavos >= 0),
  recursos jsonb not null
);
insert into public.planos values
('gratis','Grátis',0,'{"produtos":50,"operadores":1,"suspensas":1,"historico_dias":7,"clientes":false,"fornecedores":false,"relatorios":false,"impressao":false,"editar_venda":false,"multiplos_pagamentos":false}'),
('pro','Pro',8900,'{"produtos":null,"operadores":null,"suspensas":null,"historico_dias":null,"clientes":true,"fornecedores":true,"relatorios":true,"impressao":true,"editar_venda":true,"multiplos_pagamentos":true}'),
('premium','Premium',11900,'{"produtos":null,"operadores":null,"suspensas":null,"historico_dias":null,"clientes":true,"fornecedores":true,"relatorios":true,"impressao":true,"editar_venda":true,"multiplos_pagamentos":true}');
alter table public.planos enable row level security;
grant select on public.planos to anon,authenticated;
create policy planos_select on public.planos for select using (true);
revoke insert,update,delete on public.planos from anon,authenticated;

create table public.assinaturas (
  empresa_id uuid primary key references public.empresas(id),
  plano text not null default 'gratis' references public.planos(codigo),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default now() + interval '7 days',
  paid_until timestamptz,
  cancel_at_period_end boolean not null default false,
  provider_customer_id text unique,
  provider_subscription_id text unique,
  updated_at timestamptz not null default now(),
  check (trial_ends_at = trial_started_at + interval '7 days')
);
alter table public.assinaturas enable row level security;
revoke all on public.assinaturas from anon,authenticated;
grant select on public.assinaturas to authenticated;
create policy assinatura_select on public.assinaturas for select to authenticated using(empresa_id = public.usuario_empresa_id());
insert into public.assinaturas(empresa_id) select id from public.empresas on conflict do nothing;
create function public.iniciar_avaliacao() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.assinaturas(empresa_id) values(new.id) on conflict do nothing; return new; end;
$$;
create trigger empresa_avaliacao after insert on public.empresas for each row execute function public.iniciar_avaliacao();

create function public.plano_efetivo() returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select case when paid_until > now() and plano <> 'gratis' then plano
    when trial_ends_at > now() then 'premium' else 'gratis' end from public.assinaturas
    where empresa_id = public.usuario_empresa_id()),'gratis');
$$;
create function public.minha_assinatura() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare empresa uuid := public.usuario_empresa_id(); dados public.assinaturas; codigo_plano text;
begin
  if empresa is null then raise exception 'Sessão inválida'; end if;
  select * into strict dados from public.assinaturas where empresa_id = empresa;
  codigo_plano := public.plano_efetivo();
  return jsonb_build_object('companyId',empresa,'plan',codigo_plano,'serverNow',now(),
    'status',case when dados.paid_until > now() and dados.plano <> 'gratis' then 'active'
      when dados.trial_ends_at > now() then 'trial' else 'free' end,
    'expiresAt',case when dados.paid_until > now() and dados.plano <> 'gratis' then dados.paid_until else dados.trial_ends_at end,
    'cancelAtPeriodEnd',dados.cancel_at_period_end,
    'features',(select plano.recursos from public.planos plano where plano.codigo = codigo_plano));
end;
$$;
create function public.exigir_recurso(recurso text) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if public.usuario_empresa_id() is null or not coalesce((select (recursos->>recurso)::boolean from public.planos where codigo=public.plano_efetivo()),false)
    then raise exception 'Este recurso exige um plano pago'; end if;
end;
$$;
revoke all on function public.plano_efetivo(),public.minha_assinatura(),public.exigir_recurso(text),public.iniciar_avaliacao() from public,anon;
grant execute on function public.plano_efetivo(),public.minha_assinatura(),public.exigir_recurso(text) to authenticated;

alter table public.empresas add column produtos_gratis uuid[];
alter table public.empresas add constraint max_produtos_gratis check (produtos_gratis is null or cardinality(produtos_gratis) <= 50);
create function public.produto_disponivel_plano(produto uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.produtos p where p.id=produto and p.empresa_id=public.usuario_empresa_id() and p.ativo)
  and (public.plano_efetivo() <> 'gratis' or produto = any(coalesce(
    (select produtos_gratis from public.empresas where id=public.usuario_empresa_id()),
    array(select id from public.produtos where empresa_id=public.usuario_empresa_id() and ativo order by created_at,id limit 50))));
$$;
create function public.validar_limites_produto() returns trigger language plpgsql security definer set search_path = '' as $$
declare limite integer;
begin
  if auth.uid() is null then return new; end if;
  if new.empresa_id is distinct from public.usuario_empresa_id() then raise exception 'Empresa inválida'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.empresa_id::text,0));
  select (recursos->>'produtos')::integer into limite from public.planos where codigo=public.plano_efetivo();
  if limite is not null and new.ativo and (tg_op='INSERT' or not old.ativo) and
    (select count(*) from public.produtos where empresa_id=new.empresa_id and ativo) >= limite
    then raise exception 'O plano Grátis permite até % produtos ativos',limite; end if;
  return new;
end;
$$;
create trigger produtos_limite before insert or update on public.produtos for each row execute function public.validar_limites_produto();
create function public.validar_venda_plano() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.empresa_id is distinct from public.usuario_empresa_id() then raise exception 'Empresa inválida'; end if;
  if tg_table_name='itens_venda' then
    if not public.produto_disponivel_plano(new.produto_id) then
      raise exception 'Produto fora da seleção de 50 produtos do plano Grátis';
    end if;
  elsif tg_table_name='pagamentos' then
    if public.plano_efetivo()='gratis' and new.forma <> 'dinheiro' then raise exception 'Este meio de pagamento exige um plano pago'; end if;
  end if;
  return new;
end;
$$;
create trigger item_plano before insert on public.itens_venda for each row execute function public.validar_venda_plano();
create trigger pagamento_plano before insert on public.pagamentos for each row execute function public.validar_venda_plano();

create table public.platform_admins (
  usuario_id uuid primary key references auth.users(id),
  papel text not null check(papel in ('superadmin','suporte','financeiro')),
  ativo boolean not null default true
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon,authenticated;
create function public.papel_plataforma() returns text language sql stable security definer set search_path = '' as $$
  select papel from public.platform_admins where usuario_id=auth.uid() and ativo and auth.jwt()->>'aal' = 'aal2';
$$;
create function public.admin_empresas(p_busca text default '',p_pagina integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if public.papel_plataforma() is null then raise exception 'Acesso administrativo exige permissão da plataforma e MFA'; end if;
  select coalesce(jsonb_agg(to_jsonb(emp)),'[]') into resultado from (
    select e.id,e.nome,e.email,e.ativo,e.created_at,a.plano,a.trial_ends_at,a.paid_until,a.cancel_at_period_end,
      case when a.paid_until>now() then a.plano when a.trial_ends_at>now() then 'premium' else 'gratis' end as plano_efetivo
    from public.empresas e left join public.assinaturas a on a.empresa_id=e.id
    where e.nome ilike '%'||left(p_busca,100)||'%' order by e.created_at desc limit 50 offset greatest(0,least(p_pagina,100000))*50
  ) emp;
  return resultado;
end;
$$;
create function public.admin_alterar_assinatura(p_empresa uuid,p_plano text,p_ate timestamptz,p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare antes jsonb;
begin
  if public.papel_plataforma() is distinct from 'superadmin' then raise exception 'Apenas superadministrador com MFA'; end if;
  if p_plano not in ('gratis','pro','premium') or p_plano is null or length(trim(coalesce(p_motivo,'')))<5 or length(p_motivo)>500
    or (p_plano<>'gratis' and (p_ate is null or p_ate<=now() or p_ate>now()+interval '1 year')) then raise exception 'Dados inválidos'; end if;
  select to_jsonb(a) into antes from public.assinaturas a where empresa_id=p_empresa for update;
  if antes is null then raise exception 'Empresa não encontrada'; end if;
  update public.assinaturas set plano=p_plano,paid_until=p_ate,updated_at=now() where empresa_id=p_empresa;
  insert into public.auditoria(empresa_id,usuario_id,entidade,registro_id,acao,motivo,antes,depois)
    values(p_empresa,auth.uid(),'assinaturas',p_empresa,'alterar_plano',p_motivo,antes,jsonb_build_object('plano',p_plano,'paid_until',p_ate));
end;
$$;
create function public.admin_bloquear_empresa(p_empresa uuid,p_bloquear boolean,p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.papel_plataforma() is distinct from 'superadmin' then raise exception 'Apenas superadministrador com MFA'; end if;
  if length(trim(coalesce(p_motivo,'')))<5 or length(p_motivo)>500 then raise exception 'Informe o motivo'; end if;
  update public.empresas set ativo=not p_bloquear where id=p_empresa;
  if not found then raise exception 'Empresa não encontrada'; end if;
  insert into public.auditoria(empresa_id,usuario_id,entidade,registro_id,acao,motivo,depois)
    values(p_empresa,auth.uid(),'empresas',p_empresa,'bloqueio',p_motivo,jsonb_build_object('bloqueado',p_bloquear));
end;
$$;
revoke all on function public.papel_plataforma(),public.admin_empresas(text,integer),public.admin_alterar_assinatura(uuid,text,timestamptz,text),public.admin_bloquear_empresa(uuid,boolean,text),public.produto_disponivel_plano(uuid),public.validar_limites_produto(),public.validar_venda_plano() from public,anon;
grant execute on function public.papel_plataforma(),public.admin_empresas(text,integer),public.admin_alterar_assinatura(uuid,text,timestamptz,text),public.admin_bloquear_empresa(uuid,boolean,text),public.produto_disponivel_plano(uuid) to authenticated;

commit;
