-- Migration da aba Redações: ensaios por candidatura + versões salvas.
--
-- Como aplicar: cole no SQL Editor do painel do Supabase e rode.
--
-- Design:
--   - essays.application_id é nullable: uma redação pode existir sem
--     candidatura ainda (criada do zero na tela). Se a candidatura sair,
--     o cascade NÃO apaga a redação: ela volta para "Sem candidatura"
--     (on delete set null) — texto do aluno nunca desaparece sem aviso.
--   - essay_versions não tem delete: "Salvar versão" é histórico consagrado;
--     remover a redação apaga as versões por cascade.
--   - status com CHECK igual a radar_descartes.reacao.
--   - updated_at mantém "ATUALIZADO HOJE" do cartão sem custo de leitura.

create table if not exists public.essays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
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

create policy "aluno lê as próprias redações"
  on public.essays for select
  using (auth.uid() = user_id);

create policy "aluno cria as próprias redações"
  on public.essays for insert
  with check (auth.uid() = user_id);

create policy "aluno atualiza as próprias redações"
  on public.essays for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "aluno remove as próprias redações"
  on public.essays for delete
  using (auth.uid() = user_id);

-- Versões: acesso derivado da redação-pai (a versão não tem user_id próprio;
-- a policy checa o dono via EXISTS — padrão seguro em tabelas filhas).
create policy "aluno lê versões das próprias redações"
  on public.essay_versions for select
  using (exists (select 1 from public.essays e where e.id = essay_id and e.user_id = auth.uid()));

create policy "aluno cria versões das próprias redações"
  on public.essay_versions for insert
  with check (exists (select 1 from public.essays e where e.id = essay_id and e.user_id = auth.uid()));
