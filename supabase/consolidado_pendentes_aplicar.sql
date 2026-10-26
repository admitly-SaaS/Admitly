-- ============================================================================
-- CONSOLIDADO DAS MIGRATIONS PENDENTES DO ADMITLY
-- Gerado em 2026-10-19 · REGENERADO em 2026-10-26 (v2) · aplicar UMA VEZ, no SQL Editor do Supabase
--
-- Consta (em ordem):
--   1. applications.details            (coluna jsonb — migration vazia no repo)
--   2. radar_descartes                 (reações de 1 toque do radar)
--   3. essays + essay_versions         (aba Redações; FK corrigida p/ bigint)
--   4. extracurriculares               (aba de atividades)
--   5. application_documents           (mapa de documentos por candidatura)
--   6. cron_runs                       (registro do cron interno — RLS LIGADA)
--   7. digest_foto                     (foto semanal p/ delta do digest — RLS LIGADA)
--   8. email_prefs                     (pausar digest/alerta — migration citada pelo perfil)
--   9. onboarding_mail + email_prefs.pausar_onboarding
--      (cadência de onboarding: estado idempotente por (user_id, tipo),
--       métrica de abertura do Resend e o 3º toggle de preferência)
--
-- Correções de segurança embutidas (autorizadas na revisão):
--   🔴 cron_runs e digest_foto com ENABLE ROW LEVEL SECURITY (sem policies:
--      anon não lê nem grava; service role tem bypass e segue funcionando).
--   🟢 essays/application_documents: policies exigem que application_id
--      pertença ao próprio usuário (checagem de posse).
--   🟡 Idempotência: uso de pg_policies/pg_triggers para tolerar reexecução.
--
-- TABELAS FORA DO ESCOPO POR REGRA: subscriptions, webhook da Kiwify e
-- acesso do assinante — nenhuma instrução aqui toca essas superfícies.
--
-- NÃO HÁ DROP, DELETE, TRUNCATE nem UPDATE de dados neste arquivo: só cria
-- tabelas/colunas/índices/policies novas (todas tolerantes a reexecução).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1 · applications.details (jsonb) — substitui a migration vazia do repositório
-- ----------------------------------------------------------------------------
alter table public.applications
  add column if not exists details jsonb;

-- ----------------------------------------------------------------------------
-- 2 · radar_descartes — reações de 1 toque ("Não faz sentido" / "Já fiz")
-- ----------------------------------------------------------------------------
create table if not exists public.radar_descartes (
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  reacao text not null check (reacao in ('descartado', 'feito')),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

alter table public.radar_descartes enable row level security;

-- Idempotente: só cria a policy se ainda não existir em pg_policies.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'radar_descartes'
      and policyname = 'aluno lê os próprios descartes'
  ) then
    create policy "aluno lê os próprios descartes"
      on public.radar_descartes for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'radar_descartes'
      and policyname = 'aluno grava/atualiza os próprios descartes'
  ) then
    create policy "aluno grava/atualiza os próprios descartes"
      on public.radar_descartes for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'radar_descartes'
      and policyname = 'aluno atualiza os próprios descartes'
  ) then
    create policy "aluno atualiza os próprios descartes"
      on public.radar_descartes for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Sem policy de delete (registro consolidado); o cascade remove quando a
-- oportunidade sai do catálogo. Intencional, como na migration original.

-- ----------------------------------------------------------------------------
-- 3 · essays + essay_versions — aba Redações
--     application_id é BIGINT (id de applications é identity bigint; a versão
--     original com uuid quebraria a FK). Redação sem candidatura é permitida
--     (nullable) e o on delete set null preserva o texto do aluno.
-- ----------------------------------------------------------------------------
create table if not exists public.essays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id bigint references public.applications (id) on delete set null,
  title text not null default 'Redação sem título',
  prompt text not null default '',
  body text not null default '',
  status text not null default 'ideia' check (status in ('ideia', 'rascunho', 'revisao', 'final')),
  word_limit integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.essay_versions (
  id uuid primary key default gen_random_uuid(),
  essay_id uuid not null references public.essays (id) on delete cascade,
  label text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists essays_user_idx on public.essays (user_id, updated_at desc);
create index if not exists essay_versions_essay_idx on public.essay_versions (essay_id, created_at desc);

alter table public.essays enable row level security;
alter table public.essay_versions enable row level security;

-- updated_at real de verdade: a API permitida do app (lib/redacoes.js) não
-- envia updated_at, então sem trigger o cartão mentiria a data de edição.
create or replace function public.toca_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.triggers
    where event_object_table = 'essays' and trigger_name = 'essays_touch_updated_at'
  ) then
    create trigger essays_touch_updated_at
      before update on public.essays
      for each row execute function public.toca_updated_at();
  end if;
end $$;

-- 🟢 posse de application_id exigida em insert/update (não dá para afinar
--    redação/como candidatura de outro aluno).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'essays'
      and policyname = 'aluno lê as próprias redações'
  ) then
    create policy "aluno lê as próprias redações"
      on public.essays for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'essays'
      and policyname = 'aluno cria as próprias redações'
  ) then
    create policy "aluno cria as próprias redações"
      on public.essays for insert
      with check (
        auth.uid() = user_id
        and (application_id is null or exists (
          select 1 from public.applications a
          where a.id = application_id and a.user_id = auth.uid()
        ))
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'essays'
      and policyname = 'aluno atualiza as próprias redações'
  ) then
    create policy "aluno atualiza as próprias redações"
      on public.essays for update
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and (application_id is null or exists (
          select 1 from public.applications a
          where a.id = application_id and a.user_id = auth.uid()
        ))
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'essays'
      and policyname = 'aluno remove as próprias redações'
  ) then
    create policy "aluno remove as próprias redações"
      on public.essays for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- Versões: acesso derivado da redação-pai (sem user_id próprio).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'essay_versions'
      and policyname = 'aluno lê versões das próprias redações'
  ) then
    create policy "aluno lê versões das próprias redações"
      on public.essay_versions for select
      using (exists (
        select 1 from public.essays e
        where e.id = essay_id and e.user_id = auth.uid()
      ));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'essay_versions'
      and policyname = 'aluno cria versões das próprias redações'
  ) then
    create policy "aluno cria versões das próprias redações"
      on public.essay_versions for insert
      with check (exists (
        select 1 from public.essays e
        where e.id = essay_id and e.user_id = auth.uid()
      ));
  end if;
end $$;

-- Sem update/delete em essay_versions: histórico consagrado, intencional.

-- ----------------------------------------------------------------------------
-- 4 · extracurriculares — lista estruturada de atividades
-- ----------------------------------------------------------------------------
create table if not exists public.extracurriculares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  papel text not null default '',
  categoria text not null default 'outra' check (categoria in (
    'academico', 'pesquisa', 'esporte', 'arte', 'comunidade', 'trabalho',
    'projeto_proprio', 'lideranca', 'outra'
  )),
  horas_semana numeric(4, 1),
  semanas_ano integer,
  descricao text not null default '' check (char_length(descricao) <= 400),
  descricao_polida text not null default '' check (char_length(descricao_polida) <= 300),
  status text not null default 'em_curso' check (status in (
    'em_curso', 'listagem_pronta', 'usada_em_redacao', 'enviada'
  )),
  inicio text not null default '',
  fim text not null default '',
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists extracurriculares_user_idx
  on public.extracurriculares (user_id, ordem asc, created_at desc);

alter table public.extracurriculares enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'extracurriculares'
      and policyname = 'aluno lê as próprias atividades'
  ) then
    create policy "aluno lê as próprias atividades"
      on public.extracurriculares for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'extracurriculares'
      and policyname = 'aluno cria as próprias atividades'
  ) then
    create policy "aluno cria as próprias atividades"
      on public.extracurriculares for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'extracurriculares'
      and policyname = 'aluno atualiza as próprias atividades'
  ) then
    create policy "aluno atualiza as próprias atividades"
      on public.extracurriculares for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'extracurriculares'
      and policyname = 'aluno remove as próprias atividades'
  ) then
    create policy "aluno remove as próprias atividades"
      on public.extracurriculares for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5 · application_documents — mapa de documentos por candidatura
--     (FK é bigint, igual a essays; checagem de posse autorizada)
-- ----------------------------------------------------------------------------
create table if not exists public.application_documents (
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id bigint not null references public.applications (id) on delete cascade,
  tipo text not null,
  estado text not null default 'falta' check (estado in ('falta', 'pedindo', 'pronto', 'nao-pede')),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, application_id, tipo)
);

alter table public.application_documents enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'application_documents'
      and policyname = 'aluno lê os próprios documentos'
  ) then
    create policy "aluno lê os próprios documentos"
      on public.application_documents for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'application_documents'
      and policyname = 'aluno grava/atualiza os próprios documentos'
  ) then
    create policy "aluno grava/atualiza os próprios documentos"
      on public.application_documents for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.applications a
          where a.id = application_id and a.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'application_documents'
      and policyname = 'aluno atualiza os próprios documentos'
  ) then
    create policy "aluno atualiza os próprios documentos"
      on public.application_documents for update
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.applications a
          where a.id = application_id and a.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'application_documents'
      and policyname = 'aluno reseta os próprios documentos'
  ) then
    create policy "aluno reseta os próprios documentos"
      on public.application_documents for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6 · cron_runs — provedor de last-run do agendador interno
--     🔴 CORREÇÃO: ENABLE ROW LEVEL SECURITY. Com RLS ligada e NENHUMA policy,
--     anon/authenticated não conseguem ler nem gravar nada via API; a service
--     role tem bypass de RLS e o agendador continua normal (grava e compara).
-- ----------------------------------------------------------------------------
create table if not exists public.cron_runs (
  job        text primary key,
  ultima_rodada_at timestamptz not null default now(),
  detalhes   jsonb null
);

alter table public.cron_runs enable row level security;

comment on table public.cron_runs is
  'Última execução de cada job do cron interno. Service role only (RLS ligada, sem policies).';

-- ----------------------------------------------------------------------------
-- 7 · digest_foto — foto semanal de progresso por aluno (insumo do Δ)
--     🔴 mesma correção: RLS ligada, sem policies, service role apenas.
-- ----------------------------------------------------------------------------
create table if not exists public.digest_foto (
  user_id uuid primary key references auth.users (id) on delete cascade,
  foto jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table public.digest_foto enable row level security;

comment on table public.digest_foto is
  'Foto semanal de progresso por aluno (insumo do Δ do digest). Service role only (RLS ligada, sem policies).';

-- ----------------------------------------------------------------------------
-- 8 · email_prefs — pausar digest semanal e/ou alertas de prazo
--     Linha ausente = tudo ligado. Pausa é reversível por update.
-- ----------------------------------------------------------------------------
create table if not exists public.email_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pausar_digest boolean not null default false,
  pausar_alerta boolean not null default false,
  atualizado_em timestamptz not null default now()
);

alter table public.email_prefs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_prefs'
      and policyname = 'aluno lê as próprias preferências'
  ) then
    create policy "aluno lê as próprias preferências"
      on public.email_prefs for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_prefs'
      and policyname = 'aluno grava as próprias preferências'
  ) then
    create policy "aluno grava as próprias preferências"
      on public.email_prefs for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_prefs'
      and policyname = 'aluno atualiza as próprias preferências'
  ) then
    create policy "aluno atualiza as próprias preferências"
      on public.email_prefs for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

comment on table public.email_prefs is
  'Preferências de e-mail do aluno (pausar digest semanal, alertas de prazo e cadência de onboarding). Linha ausente = tudo ligado.';

-- ----------------------------------------------------------------------------
-- 9 · onboarding_mail — estado da cadência de onboarding (migration
--     202610250001) + coluna pausar_onboarding na email_prefs.
--     Chave (user_id, tipo): linha existe = e-mail já saiu — o cron decide
--     sem guardar memória em processo. resend_id = correlato do evento do
--     Resend (webhook /api/webhook-resend); aberto_em = 1ª abertura.
-- ----------------------------------------------------------------------------
create table if not exists public.onboarding_mail (
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('bem_vindo', 'lembrete_perfil', 'reativacao')),
  enviado_at timestamptz not null default now(),
  resend_id text,
  aberto_em timestamptz,
  primary key (user_id, tipo)
);

create index if not exists idx_onboarding_mail_resend
  on public.onboarding_mail (resend_id) where resend_id is not null;

alter table public.onboarding_mail enable row level security;

-- Idempotente (padrão do consolidado): só cria a policy se ainda não existir.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'onboarding_mail'
      and policyname = 'aluno lê o próprio onboarding'
  ) then
    create policy "aluno lê o próprio onboarding"
      on public.onboarding_mail
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- Sem insert/update/delete para o cliente: cadência é decisão do servidor
-- (cron + webhook do Resend, ambos service role). Junto com email_prefs
-- (pausa), é o controle que o aluno tem — e é suficiente.

-- Pausa de onboarding na MESMA tabela de preferências:
-- coluna nova, default ligado (linha ausente segue = tudo ligado).
-- 🟡 Idempotente: tolera a coluna já existindo.
alter table public.email_prefs
  add column if not exists pausar_onboarding boolean not null default false;

comment on table public.onboarding_mail is
  'Estado da cadência de onboarding por aluno: boas-vindas, lembrete de perfil, reativação. Chave (user_id, tipo) = idempotência; aberto_em = métrica de abertura.';

commit;

select now() as aplicado_em,
       (select count(*) from pg_tables
         where schemaname = 'public'
           and tablename in ('radar_descartes','essays','essay_versions',
                             'extracurriculares','application_documents',
                             'cron_runs','digest_foto','email_prefs','onboarding_mail')
       ) as tabelas_criadas,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'email_prefs'
           and column_name = 'pausar_onboarding'
       ) as coluna_onboarding_ok,
       (select count(*) from pg_indexes
         where schemaname = 'public' and indexname = 'idx_onboarding_mail_resend'
       ) as indice_abertura_ok;
