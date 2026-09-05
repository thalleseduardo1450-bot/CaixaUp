begin;

create table if not exists public.platform_faturas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  plano text not null references public.planos(codigo),
  valor_centavos integer not null check (valor_centavos >= 0),
  desconto_centavos integer not null default 0 check (desconto_centavos >= 0),
  vencimento timestamptz not null,
  status text not null default 'aberta' check (status in ('rascunho','aberta','paga','cancelada')),
  observacao text not null default '',
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  pago_em timestamptz
);

alter table public.platform_faturas enable row level security;
revoke all on public.platform_faturas from anon, authenticated;

create or replace function public.admin_contas(p_busca text default '', p_pagina integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if public.papel_plataforma() is null then raise exception 'Acesso administrativo exige permissão da plataforma e MFA'; end if;
  select coalesce(jsonb_agg(to_jsonb(conta)), '[]') into resultado from (
    select p.id as usuario_id, p.nome as nome_usuario, p.email, p.cargo, p.ativo as usuario_ativo,
      e.id as empresa_id, e.nome as empresa, e.ativo as empresa_ativa,
      a.plano, a.trial_ends_at, a.paid_until,
      case when a.paid_until > now() and a.plano <> 'gratis' then a.plano
        when a.trial_ends_at > now() then 'premium' else 'gratis' end as plano_efetivo
    from public.perfis p
    left join public.empresas e on e.id = p.empresa_id
    left join public.assinaturas a on a.empresa_id = p.empresa_id
    where p.nome ilike '%' || left(coalesce(p_busca,''),100) || '%'
      or p.email ilike '%' || left(coalesce(p_busca,''),100) || '%'
      or coalesce(e.nome,'') ilike '%' || left(coalesce(p_busca,''),100) || '%'
    order by p.created_at desc
    limit 50 offset greatest(0, least(coalesce(p_pagina,0),100000))*50
  ) conta;
  return resultado;
end;
$$;

create or replace function public.admin_faturas(p_empresa uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if public.papel_plataforma() is null then raise exception 'Acesso administrativo exige permissão da plataforma e MFA'; end if;
  select coalesce(jsonb_agg(to_jsonb(fatura)), '[]') into resultado
  from (
    select f.id, f.numero, f.empresa_id, e.nome as empresa, f.plano,
      f.valor_centavos, f.desconto_centavos, f.vencimento, f.status,
      f.observacao, f.criado_em, f.pago_em
    from public.platform_faturas f
    join public.empresas e on e.id = f.empresa_id
    where p_empresa is null or f.empresa_id = p_empresa
    order by f.criado_em desc
    limit 100
  ) fatura;
  return resultado;
end;
$$;

create or replace function public.admin_gerar_fatura(
  p_empresa uuid, p_plano text, p_vencimento timestamptz,
  p_desconto_centavos integer default 0, p_observacao text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare preco integer; desconto integer := coalesce(p_desconto_centavos,0); fatura public.platform_faturas;
begin
  if public.papel_plataforma() is distinct from 'superadmin' then raise exception 'Apenas superadministrador com MFA'; end if;
  if p_empresa is null or p_plano is null or p_plano not in ('gratis','pro','premium')
    or p_vencimento is null or p_vencimento < now() - interval '1 day'
    or p_vencimento > now() + interval '2 years' or desconto < 0 then raise exception 'Dados inválidos'; end if;
  select preco_centavos into preco from public.planos where codigo=p_plano;
  if preco is null or desconto > preco then raise exception 'Desconto maior que o valor do plano'; end if;
  if not exists(select 1 from public.empresas where id=p_empresa) then raise exception 'Empresa não encontrada'; end if;
  insert into public.platform_faturas(empresa_id,plano,valor_centavos,desconto_centavos,vencimento,observacao,criado_por)
    values(p_empresa,p_plano,preco-desconto,desconto,left(coalesce(p_observacao,''),500),auth.uid())
    returning * into fatura;
  insert into public.auditoria(empresa_id,usuario_id,entidade,registro_id,acao,motivo,depois)
    values(p_empresa,auth.uid(),'platform_faturas',fatura.id,'gerar_fatura',left(coalesce(p_observacao,''),500),to_jsonb(fatura));
  return to_jsonb(fatura);
end;
$$;

revoke all on function public.admin_contas(text,integer), public.admin_faturas(uuid), public.admin_gerar_fatura(uuid,text,timestamptz,integer,text) from public, anon;
grant execute on function public.admin_contas(text,integer), public.admin_faturas(uuid), public.admin_gerar_fatura(uuid,text,timestamptz,integer,text) to authenticated;

commit;
