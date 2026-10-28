-- Persistent PDV state, suppliers, operational records and secure roles.
begin;
alter table public.empresas add column if not exists dados_extras jsonb not null default '{}';
alter table public.perfis drop constraint if exists perfis_cargo_check;
alter table public.perfis add constraint perfis_cargo_check check(cargo in ('proprietario','administrador','gerente','operador','atendente','financeiro'));
alter table public.perfis add column if not exists permanente boolean not null default false;
alter table public.produtos add column if not exists imagem_url text not null default '';
alter table public.produtos add column if not exists imagem_nome text not null default '';
alter table public.produtos add column if not exists fornecedor text not null default '';
alter table public.produtos drop constraint if exists produtos_empresa_id_codigo_barras_key;
create unique index if not exists produtos_barras_unico on public.produtos(empresa_id,codigo_barras) where codigo_barras <> '';
alter table public.clientes drop constraint if exists clientes_empresa_id_cpf_cnpj_key;
create unique index if not exists clientes_documento_unico on public.clientes(empresa_id,cpf_cnpj) where cpf_cnpj <> '';

create table if not exists public.preferencias_usuario (
 usuario_id uuid not null references public.perfis(id) on delete cascade,
 chave text not null, valor text not null,
 updated_at timestamptz not null default now(), primary key(usuario_id,chave)
);
create table if not exists public.fornecedores (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 dados jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.registros_operacionais (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 modulo text not null, dados jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists fornecedores_empresa on public.fornecedores(empresa_id);
create index if not exists registros_empresa_modulo on public.registros_operacionais(empresa_id,modulo);
create or replace function public.usuario_empresa_id() returns uuid language sql stable security definer set search_path=public as $$
 select empresa_id from public.perfis where id=auth.uid() and ativo;
$$;
create or replace function public.usuario_admin() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select ativo and cargo in ('administrador','proprietario') from public.perfis where id=auth.uid()),false);
$$;

alter table public.preferencias_usuario enable row level security;
create policy preferencias_proprias on public.preferencias_usuario for all to authenticated
 using(usuario_id=auth.uid() and public.usuario_empresa_id() is not null)
 with check(usuario_id=auth.uid() and public.usuario_empresa_id() is not null);
do $$ declare t text; begin
 foreach t in array array['fornecedores','registros_operacionais'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy empresa_acesso on public.%I for all to authenticated using(empresa_id=public.usuario_empresa_id()) with check(empresa_id=public.usuario_empresa_id())',t);
  execute format('create trigger updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
 end loop;
end $$;
create trigger updated_at before update on public.preferencias_usuario for each row execute function public.set_updated_at();

-- Roles and company assignment can only be managed by a company administrator.
drop policy if exists perfis_select on public.perfis;
drop policy if exists perfis_update on public.perfis;
drop policy if exists perfis_insert on public.perfis;
create policy perfis_select on public.perfis for select to authenticated using(id=auth.uid() or (empresa_id=public.usuario_empresa_id() and public.usuario_admin()));
create policy perfis_update on public.perfis for update to authenticated using(id=auth.uid() or (empresa_id=public.usuario_empresa_id() and public.usuario_admin()))
 with check(id=auth.uid() or (empresa_id=public.usuario_empresa_id() and public.usuario_admin()));
create or replace function public.proteger_perfil() returns trigger language plpgsql set search_path=public as $$
begin
 if auth.uid() is not null then
  if new.empresa_id is distinct from old.empresa_id or new.permanente is distinct from old.permanente then raise exception 'Vinculo e acesso permanente protegidos'; end if;
  if (new.cargo is distinct from old.cargo or new.ativo is distinct from old.ativo) and not public.usuario_admin() then raise exception 'Apenas administradores podem alterar permissoes'; end if;
  if old.permanente and (not new.ativo or new.cargo not in ('administrador','proprietario')) then raise exception 'Administrador permanente protegido'; end if;
 end if;
 return new;
end $$;
create trigger proteger_perfil before update on public.perfis for each row execute function public.proteger_perfil();
-- Provisioning performs a trusted company assignment; the trigger above must
-- allow only the narrow initial assignment done by this definer function.
create or replace function public.proteger_perfil() returns trigger language plpgsql set search_path=public as $$
begin
 if auth.uid() is not null and current_user not in ('postgres','supabase_admin') then
  if new.empresa_id is distinct from old.empresa_id or new.permanente is distinct from old.permanente then raise exception 'Vinculo e acesso permanente protegidos'; end if;
  if (new.cargo is distinct from old.cargo or new.ativo is distinct from old.ativo) and not public.usuario_admin() then raise exception 'Apenas administradores podem alterar permissoes'; end if;
  if old.permanente and (not new.ativo or new.cargo not in ('administrador','proprietario')) then raise exception 'Administrador permanente protegido'; end if;
 end if;
 return new;
end $$;
drop policy if exists empresas_insert on public.empresas;
drop policy if exists empresas_update on public.empresas;
create policy empresas_update on public.empresas for update to authenticated using(id=public.usuario_empresa_id() and public.usuario_admin()) with check(id=public.usuario_empresa_id() and public.usuario_admin());

-- A sale, payment, stock movement and customer debt commit together.
create or replace function public.registrar_venda(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 emp uuid:=public.usuario_empresa_id(); uid uuid:=auth.uid(); sess uuid; cli uuid;
 item jsonb; pay jsonb; prod public.produtos; sale public.vendas;
 qty numeric; subtotal numeric:=0; total numeric; payment_total numeric:=0; debt numeric:=0;
 payments jsonb; allow_negative boolean:=coalesce((p_payload->>'allowSellingWithoutStock')::boolean,false);
begin
 if emp is null then raise exception 'Sessao invalida ou usuario inativo'; end if;
 if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')=0 then raise exception 'Venda sem itens'; end if;
 -- Serialize cash closure and sales for this company.
 perform pg_advisory_xact_lock(hashtextextended(emp::text,0));
 select id into sess from public.sessoes_caixa where empresa_id=emp and status='aberto' order by data_abertura desc limit 1 for update;
 if sess is null then raise exception 'Abra o caixa antes de vender'; end if;
 if nullif(p_payload->>'customerId','') is not null then
  select id into cli from public.clientes where empresa_id=emp and id=(p_payload->>'customerId')::uuid;
  if cli is null then raise exception 'Cliente invalido'; end if;
 elsif nullif(p_payload->>'customerName','') is not null then
  select id into cli from public.clientes where empresa_id=emp and nome=p_payload->>'customerName' limit 1;
 end if;
 for item in select value from jsonb_array_elements(p_payload->'items') loop
  qty:=(item->>'quantity')::numeric;
  if qty is null or qty<=0 then raise exception 'Quantidade invalida'; end if;
  select * into prod from public.produtos where empresa_id=emp and ativo and
   (codigo_barras=item->>'productCode' or sku=item->>'productCode' or id::text=item->>'productCode') order by id limit 1 for update;
  if not found then raise exception 'Produto nao encontrado: %',item->>'productCode'; end if;
  subtotal:=subtotal+round(prod.preco_venda*qty,2);
 end loop;
 total:=replace(replace(coalesce(nullif(p_payload->>'totalAmount',''),subtotal::text),'.',''),',','.')::numeric;
 -- Frontend sends amounts in Brazilian format; fallback keeps numeric subtotal.
 if nullif(p_payload->>'totalAmount','') is null then total:=subtotal; end if;
 if total<=0 or total>subtotal then raise exception 'Total invalido'; end if;
 payments:=p_payload->'payments';
 if payments is null or jsonb_array_length(payments)=0 then
  payments:=jsonb_build_array(jsonb_build_object('forma',coalesce(nullif(p_payload->>'paymentType',''),'dinheiro'),'valor',total));
 end if;
 for pay in select value from jsonb_array_elements(payments) loop
  if (pay->>'valor')::numeric<=0 then raise exception 'Pagamento invalido'; end if;
  payment_total:=payment_total+(pay->>'valor')::numeric;
  if pay->>'forma'='fiado' then debt:=debt+(pay->>'valor')::numeric; end if;
 end loop;
 if abs(payment_total-total)>0.009 then raise exception 'Pagamentos nao conferem com o total'; end if;
 if debt>0 and cli is null then raise exception 'Identifique o cliente para venda fiada'; end if;
 insert into public.vendas(empresa_id,sessao_caixa_id,usuario_id,cliente_id,subtotal,desconto,total)
 values(emp,sess,uid,cli,subtotal,subtotal-total,total) returning * into sale;
 for item in select value from jsonb_array_elements(p_payload->'items') loop
  qty:=(item->>'quantity')::numeric;
  select * into strict prod from public.produtos where empresa_id=emp and ativo and
   (codigo_barras=item->>'productCode' or sku=item->>'productCode' or id::text=item->>'productCode') order by id limit 1 for update;
  if not allow_negative and prod.estoque_atual<qty then raise exception 'Estoque insuficiente: %',prod.nome; end if;
  insert into public.itens_venda(empresa_id,venda_id,produto_id,nome_produto,quantidade,preco_unitario,subtotal)
   values(emp,sale.id,prod.id,prod.nome,qty,prod.preco_venda,round(qty*prod.preco_venda,2));
  update public.produtos set estoque_atual=estoque_atual-qty where id=prod.id;
  insert into public.movimentacoes_estoque(empresa_id,produto_id,usuario_id,tipo,quantidade,estoque_anterior,estoque_novo,motivo,referencia_id)
   values(emp,prod.id,uid,'venda',qty,prod.estoque_atual,prod.estoque_atual-qty,'Venda #'||sale.numero,sale.id);
 end loop;
 for pay in select value from jsonb_array_elements(payments) loop
  insert into public.pagamentos(empresa_id,venda_id,forma,valor) values(emp,sale.id,pay->>'forma',(pay->>'valor')::numeric);
 end loop;
 if debt>0 then perform public.registrar_debito_cliente(cli,sale.id,debt,'Venda #'||sale.numero); end if;
 return jsonb_build_object('saleNumber',sale.numero::text,'id',sale.id);
end $$;
revoke all on function public.registrar_venda(jsonb) from public,anon;
grant execute on function public.registrar_venda(jsonb) to authenticated;
revoke all on function public.usuario_admin() from public,anon;
grant execute on function public.usuario_admin() to authenticated;
-- All public tables are authenticated-only and protected by RLS.
revoke all on all tables in schema public from anon;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;
commit;
