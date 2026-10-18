-- 202610180001_digest_foto.sql
--
-- Foto semanal de progresso, por aluno — o insumo do "Δ da semana" do digest.
--
-- No digest de cada segunda, o agendador (a) compara o progresso do aluno com
-- a foto gravada na segunda ANTERIOR (o delta vai no e-mail: "+3 tarefas
-- desde a última segunda") e (b) grava a foto nova. Sem foto anterior, o
-- digest sai sem delta — nunca inventamos progresso.
--
-- Uma linha por aluno (o upsert usa onConflict: 'user_id').
--
-- Como aplicar: cole no SQL Editor do painel do Supabase e rode
-- (convenção do projeto — migrations são manuais).
--
-- RLS: escrita e leitura só pela service key (agendador); sem policies de
-- RLS = nada acessível via API anon. Deliberado, como em cron_runs.

create table if not exists public.digest_foto (
  user_id uuid primary key references auth.users (id) on delete cascade,
  foto jsonb not null,
  atualizado_em timestamptz not null default now()
);

comment on table public.digest_foto is
  'Foto semanal de progresso por aluno (insumo do Δ do digest). Service role only (sem RLS policies).';
