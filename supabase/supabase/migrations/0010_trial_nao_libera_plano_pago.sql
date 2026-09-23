begin;

create or replace function public.plano_efetivo()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when paid_until > now() and plano <> 'gratis' then plano
      when trial_ends_at > now() and plano <> 'gratis' then plano
      else 'gratis'
    end
    from public.assinaturas
    where empresa_id = public.usuario_empresa_id()
  ), 'gratis');
$$;

create or replace function public.minha_assinatura()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  empresa uuid := public.usuario_empresa_id();
  dados public.assinaturas;
  codigo_plano text;
  assinatura_paga boolean;
  assinatura_teste boolean;
begin
  if empresa is null then raise exception 'Sessao invalida'; end if;

  select * into strict dados
  from public.assinaturas
  where empresa_id = empresa;

  assinatura_paga := dados.paid_until > now() and dados.plano <> 'gratis';
  assinatura_teste := dados.trial_ends_at > now() and dados.plano <> 'gratis';
  codigo_plano := public.plano_efetivo();

  return jsonb_build_object(
    'companyId', empresa,
    'plan', codigo_plano,
    'serverNow', now(),
    'status', case
      when assinatura_paga then 'active'
      when assinatura_teste then 'trial'
      else 'free'
    end,
    'expiresAt', case
      when assinatura_paga then dados.paid_until
      when assinatura_teste then dados.trial_ends_at
      else null
    end,
    'cancelAtPeriodEnd', dados.cancel_at_period_end,
    'features', (select plano.recursos from public.planos plano where plano.codigo = codigo_plano)
  );
end;
$$;

create or replace function public.admin_empresas(p_busca text default '', p_pagina integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare resultado jsonb;
begin
  if public.papel_plataforma() is null then raise exception 'Acesso administrativo exige permissao da plataforma e MFA'; end if;

  select coalesce(jsonb_agg(to_jsonb(emp)), '[]') into resultado from (
    select e.id, e.nome, e.email, e.ativo, e.created_at,
      a.plano, a.trial_ends_at, a.paid_until, a.cancel_at_period_end,
      case
        when a.paid_until > now() and a.plano <> 'gratis' then a.plano
        when a.trial_ends_at > now() and a.plano <> 'gratis' then a.plano
        else 'gratis'
      end as plano_efetivo
    from public.empresas e
    left join public.assinaturas a on a.empresa_id = e.id
    where e.nome ilike '%' || left(coalesce(p_busca, ''), 100) || '%'
    order by e.created_at desc
    limit 50 offset greatest(0, least(coalesce(p_pagina, 0), 100000)) * 50
  ) emp;

  return resultado;
end;
$$;

create or replace function public.admin_contas(p_busca text default '', p_pagina integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare resultado jsonb;
begin
  if public.papel_plataforma() is null then raise exception 'Acesso administrativo exige permissao da plataforma e MFA'; end if;

  select coalesce(jsonb_agg(to_jsonb(conta)), '[]') into resultado from (
    select p.id as usuario_id, p.nome as nome_usuario, p.email, p.cargo, p.ativo as usuario_ativo,
      e.id as empresa_id, e.nome as empresa, e.ativo as empresa_ativa,
      a.plano, a.trial_ends_at, a.paid_until,
      case
        when a.paid_until > now() and a.plano <> 'gratis' then a.plano
        when a.trial_ends_at > now() and a.plano <> 'gratis' then a.plano
        else 'gratis'
      end as plano_efetivo
    from public.perfis p
    left join public.empresas e on e.id = p.empresa_id
    left join public.assinaturas a on a.empresa_id = p.empresa_id
    where p.nome ilike '%' || left(coalesce(p_busca, ''), 100) || '%'
      or p.email ilike '%' || left(coalesce(p_busca, ''), 100) || '%'
      or coalesce(e.nome, '') ilike '%' || left(coalesce(p_busca, ''), 100) || '%'
    order by p.created_at desc
    limit 50 offset greatest(0, least(coalesce(p_pagina, 0), 100000)) * 50
  ) conta;

  return resultado;
end;
$$;

revoke all on function public.plano_efetivo(), public.minha_assinatura(), public.admin_empresas(text, integer), public.admin_contas(text, integer) from public, anon;
grant execute on function public.plano_efetivo(), public.minha_assinatura(), public.admin_empresas(text, integer), public.admin_contas(text, integer) to authenticated;

commit;
