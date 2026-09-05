-- CaixaUp: estrutura mínima para autenticação, empresa/tenant e assinatura.
-- Execute no SQL Editor do Supabase em um projeto novo ou adapte ao seu schema atual.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text,
  role text not null default 'owner' check (role in ('owner','administrator','manager','cashier','employee')),
  plan text not null default 'free' check (plan in ('free','pro','premium')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'inactive',
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.stripe_webhook_events enable row level security;

-- Usuário lê apenas o próprio perfil.
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles
for select to authenticated
using (user_id = (select auth.uid()));

-- Usuário lê somente a própria empresa/tenant.
drop policy if exists "companies_select_own" on public.companies;
create policy "companies_select_own" on public.companies
for select to authenticated
using (
  id in (select company_id from public.profiles where user_id = (select auth.uid()))
);

-- Sem policies de INSERT/UPDATE para cliente em campos de plano/Stripe.
-- Alterações de assinatura são feitas pela Vercel Function com service_role.

create or replace function public.handle_new_caixaup_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_company_id uuid;
  store_name text;
begin
  store_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'store_name'), ''), 'Meu comércio');

  insert into public.companies(name)
  values (left(store_name, 120))
  returning id into new_company_id;

  insert into public.profiles(user_id, company_id, full_name, role, plan)
  values (
    new.id,
    new_company_id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
    'owner',
    'free'
  );

  return new;
end;
$$;

-- Evita trigger duplicado se você executar o arquivo mais de uma vez.
drop trigger if exists on_auth_user_created_caixaup on auth.users;
create trigger on_auth_user_created_caixaup
after insert on auth.users
for each row execute procedure public.handle_new_caixaup_user();

-- Índices úteis para consultas internas/webhooks.
create index if not exists profiles_company_id_idx on public.profiles(company_id);
create index if not exists profiles_stripe_customer_id_idx on public.profiles(stripe_customer_id);
create index if not exists profiles_stripe_subscription_id_idx on public.profiles(stripe_subscription_id);
