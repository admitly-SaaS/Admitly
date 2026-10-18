-- Migration do mapa de documentos (feedback de usuários 15/10):
-- "sentia falta de um mapa para organizar os documentos que já tem e os que vão
-- precisar". Cada (aluno, candidatura, tipo de documento) guarda um estado.
--
-- Como aplicar: cole no SQL Editor do painel do Supabase e rode.

-- application_id é BIGINT porque applications.id é GENERATED ALWAYS AS IDENTITY BIGINT
-- (descoberto ao rodar: FK de uuid sobre bigint não implementa).
create table if not exists public.application_documents (
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id bigint not null references public.applications (id) on delete cascade,
  tipo text not null,
  estado text not null default 'falta' check (estado in ('falta', 'pedindo', 'pronto', 'nao-pede')),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, application_id, tipo)
);

-- Uma marcação por (aluno, candidatura, tipo): repetir o toque atualiza, não duplica.
-- (o upsert no cliente usa onConflict: 'user_id,application_id,tipo')

alter table public.application_documents enable row level security;

create policy "aluno lê os próprios documentos"
  on public.application_documents
  for select
  using (auth.uid() = user_id);

create policy "aluno grava/atualiza os próprios documentos"
  on public.application_documents
  for insert
  with check (auth.uid() = user_id);

create policy "aluno atualiza os próprios documentos"
  on public.application_documents
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "aluno reseta os próprios documentos"
  on public.application_documents
  for delete
  using (auth.uid() = user_id);

-- Sem política para o anon/service além do cascade: quando a candidatura sai,
-- as linhas de documento somem com ela (on delete cascade acima).
