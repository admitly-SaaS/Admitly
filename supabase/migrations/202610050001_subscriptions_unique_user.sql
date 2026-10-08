-- 202610050001_subscriptions_unique_user.sql
--
-- Uma assinatura por aluno.
--
-- O webhook do checkout inseria uma linha nova a cada notificação (e cada
-- renovação), e a tabela não tinha nenhuma restrição em user_id: o aluno
-- a65c3552 ficou com duas linhas ativas (ids 10 e 11, criadas 6s uma da outra).
-- Com duas linhas, o guard antigo (.maybeSingle) devolvia PGRST116/406 e o app
-- lia o erro como "sem assinatura" — trancando quem havia pago.
--
-- O código já se defende (lib/subscriptions.js lê "existe alguma ativa" e o
-- webhook faz select -> update), mas a restrição transforma isso em contrato:
-- se algum dia voltar a inserir em vez de atualizar, o banco recusa.
--
-- Rodar no SQL Editor do Supabase. Se o banco ainda tiver duplicatas, a
-- criação falha: apague as excedentes antes (mantendo a de menor id).

alter table public.subscriptions
  add constraint subscriptions_user_id_key unique (user_id);
