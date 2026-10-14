-- Migration do Radar: tabela de reações de 1 toque ("Não faz sentido" e
-- "Já fiz"). O matching do Admitly aprende com o que o aluno rejeitou.
--
-- Como aplicar: cole no SQL Editor do painel do Supabase e rode.

create table if not exists public.radar_descartes (
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  reacao text not null check (reacao in ('descartado', 'feito')),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

-- Uma reação por (aluno, oportunidade): repetir o toque atualiza, não duplica.
-- (o upsert no cliente usa onConflict: 'user_id,opportunity_id')

alter table public.radar_descartes enable row level security;

create policy "aluno lê os próprios descartes"
  on public.radar_descartes
  for select
  using (auth.uid() = user_id);

create policy "aluno grava/atualiza os próprios descartes"
  on public.radar_descartes
  for insert
  with check (auth.uid() = user_id);

create policy "aluno atualiza os próprios descartes"
  on public.radar_descartes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sem política de delete: a reação é um registro consolidado (o upsert é a
-- forma de mudar de ideia). Se um programa sair do catálogo, o cascade
-- remove a linha automaticamente.
