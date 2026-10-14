-- Migration da aba Extracurriculares: lista estruturada de atividades do aluno.
--
-- Como aplicar: cole no SQL Editor do painel do Supabase e rode.
--
-- Design:
--   - Uma linha por atividade. O Common App cobra até 10 atividades com
--     descrição de 150 caracteres; guardar esse limite como CHECK evita que o
--     aluno escreva um parágrafo onde caberia uma linha de formulário.
--   - "status" guarda a jornada da atividade: em curso → listagem pronta
--     (descrição polida gerada) → usada em redação → enviada.
--   - horas_semana e semanas_ano alimentam o futuro matching por tempo
--     disponível; ambos nullable porque nem sempre o aluno sabe de imediato.
--   - ordem explícita (sort_order integer) preserva a sequência que o aluno
--     quer ver — listagens são ordenadas por importância, não por data.

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

create policy "aluno lê as próprias atividades"
  on public.extracurriculares for select
  using (auth.uid() = user_id);

create policy "aluno cria as próprias atividades"
  on public.extracurriculares for insert
  with check (auth.uid() = user_id);

create policy "aluno atualiza as próprias atividades"
  on public.extracurriculares for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "aluno remove as próprias atividades"
  on public.extracurriculares for delete
  using (auth.uid() = user_id);
