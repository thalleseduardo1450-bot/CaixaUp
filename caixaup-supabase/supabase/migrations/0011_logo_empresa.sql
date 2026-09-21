-- 0011 — Logo da empresa guardada no banco.
--
-- Antes a logo ficava só no localStorage de cada computador: quem trocava via a
-- nova imagem, e os outros usuários da mesma empresa continuavam sem ela.
--
-- Agora ela é uma coluna de public.empresas. As políticas que já existem cobrem
-- o acesso sem nenhuma mudança:
--   empresas_select (0001): todo usuário lê só a linha da própria empresa;
--   empresas_update (0005): só proprietário/administrador da empresa altera.
-- Não há grant por coluna em empresas, então a coluna nova herda isso.
--
-- Aditiva e idempotente: não lê nem altera dado existente; pode rodar de novo.
-- Para desfazer: alter table public.empresas drop column if exists logo;

alter table public.empresas add column if not exists logo text;

-- A logo chega como data URL já reduzida pelo app (~256 px). O limite impede
-- que alguém grave um arquivo enorme ou algo que não seja imagem.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'empresas_logo_formato' and conrelid = 'public.empresas'::regclass
  ) then
    alter table public.empresas add constraint empresas_logo_formato check (
      logo is null
      or (length(logo) <= 400000 and logo ~ '^data:image/(png|jpeg|webp);base64,')
    );
  end if;
end $$;
