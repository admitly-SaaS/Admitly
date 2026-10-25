-- 202610250001_onboarding_mail.sql
--
-- Estado dos e-mails de ONBOARDING cadência (lib/onboarding.js + cron):
-- boas-vindas, lembrete de completar o perfil e reativação. O envio é
-- idempotente pela CHAVE (user_id, tipo): linha existe = já saiu — o cron
-- decide SEM guardar memória em processo.
--
-- Métricas de abertura ficam na MESMA linha: resend_id (correlato do evento
-- do Resend, captado pelo /api/webhook-resend) e aberto_em (primeira abertura).
--
-- Service role grava sem RLS (bypass nativo). O aluno LÊ as próprias linhas —
-- a página de preferências mostra o que já foi enviado de onboarding.

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

create policy "aluno lê o próprio onboarding"
  on public.onboarding_mail
  for select
  using (auth.uid() = user_id);

-- Sem insert/update/delete para o cliente: cadência é decisão do servidor
-- (cron + webhook do Resend, ambos service role). Junto com email_prefs
-- (pausa), é o controle que o aluno tem — e é suficiente.

-- Pausa de onboarding entra na MESMA tabela de preferências que já existe:
-- coluna nova, default ligado (linha ausente segue = tudo ligado).
alter table public.email_prefs
  add column if not exists pausar_onboarding boolean not null default false;

-- Rodapé dos e-mails de onboarding também promete preferências no perfil.
comment on table public.onboarding_mail is
  'Estado da cadência de onboarding por aluno: boas-vindas, lembrete de perfil, reativação. Chave (user_id, tipo) = idempotência; aberto_em = métrica de abertura.';
