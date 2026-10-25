-- ============================================================================
-- SQL DE REVERSÃO — GUARDAR, NÃO RODAR
--
-- Este arquivo desfaz o consolidado_pendentes_aplicar.sql. Ele existe para
-- você ter o registro de reversão (o PostgreSQL não tem undo de DDL). Ele NÃO deve
-- ser executado exceto se você pedir explicitamente para remover a funcionalidade:
-- rodar DROP em tabela com dados do aluno APAGA esses dados. Nada aqui deve
-- ser rodado sem você me pedir explicitamente.
-- Reversões listadas na ordem INVERSA da aplicação.
-- ============================================================================

-- 8 · email_prefs -----------------------------------------------------------
drop policy if exists "aluno atualiza as próprias preferências" on public.email_prefs;
drop policy if exists "aluno grava as próprias preferências" on public.email_prefs;
drop policy if exists "aluno lê as próprias preferências" on public.email_prefs;
drop table if exists public.email_prefs;         -- apaga as pausas salvas

-- 7 · digest_foto ------------------------------------------------------------
drop table if exists public.digest_foto;         -- apaga a última foto semanal

-- 6 · cron_runs ---------------------------------------------------------
drop table if exists public.cron_runs;           -- apaga o histórico de execuções

-- 5 · application_documents --------------------------------------------
drop policy if exists "aluno reseta os próprios documentos" on public.application_documents;
drop policy if exists "aluno atualiza os próprios documentos" on public.application_documents;
drop policy if exists "aluno grava/atualiza os próprios documentos" on public.application_documents;
drop policy if exists "aluno lê os próprios documentos" on public.application_documents;
drop table if exists public.application_documents;

-- 4 · extracurriculares -----------------------------------------------------
drop policy if exists "aluno remove as próprias atividades" on public.extracurriculares;
drop policy if exists "aluno atualiza as próprias atividades" on public.extracurriculares;
drop policy if exists "aluno cria as próprias atividades" on public.extracurriculares;
drop policy if exists "aluno lê as próprias atividades" on public.extracurriculares;
drop index if exists public.extracurriculares_user_idx;
drop table if exists public.extracurriculares;   -- apaga todas as atividades

-- 3 · essays + essay_versions (inclui trigger e função) ---------------------------
do $$
begin
  if exists (
    select 1 from information_schema.triggers
    where event_object_table = 'essays' and trigger_name = 'essays_touch_updated_at'
  ) then
    drop trigger essays_touch_updated_at on public.essays;
  end if;
end $$;

drop index if exists public.essays_user_idx;
drop index if exists public.essay_versions_essay_idx;
drop policy if exists "aluno cria versões das próprias redações" on public.essay_versions;
drop policy if exists "aluno lê versões das próprias redações" on public.essay_versions;
drop policy if exists "aluno remove as próprias redações" on public.essays;
drop policy if exists "aluno atualiza as próprias redações" on public.essays;
drop policy if exists "aluno cria as próprias redações" on public.essays;
drop policy if exists "aluno lê as próprias redações" on public.essays;
drop table if exists public.essay_versions;      -- apaga TODAS as versões salvas
drop table if exists public.essays;              -- apaga TODAS as redações (texto do aluno!)
drop function if exists public.toca_updated_at();

-- 2 · radar_descartes --------------------------------------------------------
drop policy if exists "aluno atualiza os próprios descartes" on public.radar_descartes;
drop policy if exists "aluno grava/atualiza os próprios descartes" on public.radar_descartes;
drop policy if exists "aluno lê os próprios descartes" on public.radar_descartes;
drop table if exists public.radar_descartes;     -- apaga reações do radar

-- 1 · applications.details ---------------------------------------------------
-- ⚠️ apaga o details montado de TODAS as 35 candidaturas (sem backup no chat).
alter table public.applications drop column if exists details;
