-- 202610140001_cron_runs.sql
--
-- Registro de execução do CRON AUTOMÁTICO (o agendador interno do servidor).
--
-- Para quê: o agendador roda no processo do Next e pode ganhar instância nova
-- a cada deploy/restart — sem registro persistente, cada instância reenviaria
-- o digest/alerta da vez. Aqui fica gravado o ÚLTIMO disparo de cada job:
--
--   digest_semanal  → rodar 1x por semana, às segundas
--   alerta_prazo    → rodar 1x por dia
--
-- Como aplicar: cole no SQL Editor do painel do Supabase e rode
-- (convenção do projeto — migrations são manuais).
--
-- RLS: a tabela só é escrita pela service key (agendador e rotas cron);
-- nenhuma policy de RLS = nada acessível via API anon. É deliberado.

create table if not exists public.cron_runs (
  job        text primary key,
  ultima_rodada_at timestamptz not null default now(),
  detalhes   jsonb null
);

-- O agendador decide com base nessa linha; manter só a última é o contrato.
comment on table public.cron_runs is
  'Última execução de cada job do cron interno. Service role only (sem RLS policies).';
