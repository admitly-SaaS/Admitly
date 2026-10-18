-- 202610190001_email_prefs.sql
--
-- Preferências de e-mail, por aluno: pausar o digest semanal e/ou os alertas
-- de prazo. O rodapé dos dois e-mails já promete "preferências no seu perfil"
-- — este é o lugar que faz a promessa valer.
--
-- Uma linha por aluno (pk user_id). LINHA AUSENTE = tudo ligado: o aluno só
-- tem preferência quando a cria (o perfil salva com upsert on user_id).
-- Pausa é reversível — nada aqui apaga dados do aluno.
--
-- Como aplicar: cole no SQL Editor do painel do Supabase e rode
-- (convenção do projeto — migrations são manuais).

create table if not exists public.email_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pausar_digest boolean not null default false,
  pausar_alerta boolean not null default false,
  atualizado_em timestamptz not null default now()
);

alter table public.email_prefs enable row level security;

create policy "aluno lê as próprias preferências"
  on public.email_prefs
  for select
  using (auth.uid() = user_id);

create policy "aluno grava as próprias preferências"
  on public.email_prefs
  for insert
  with check (auth.uid() = user_id);

create policy "aluno atualiza as próprias preferências"
  on public.email_prefs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sem política de delete: a pausa é um toggle, não remoção de linha.

comment on table public.email_prefs is
  'Preferências de e-mail do aluno (pausar digest semanal e/ou alertas de prazo). Linha ausente = tudo ligado.';
