// E2E do mapa de documentos — regressão contra perda de gravação.
//
// O que prova, no transporte REAL (REST do Supabase, com RLS agindo):
//   1. O aluno entra por senha (como no navegador) e insere uma candidatura.
//   2. Um toque no mapa (gravarEstado — a MESMA função da página) grava via
//      upsert em user_id/application_id/tipo.
//   3. "Recarregar a página" = criar um cliente NOVO do zero (sessão nova,
//      zero cache de memória) — o que um carregamento de página faz — e ler
//      de novo: o estado tem que estar lá, vindo do banco.
//   4. Um segundo toque (ciclo pedindo → pronto) também persiste.
//
// Por que não dá pra fingir: o cliente do aluno usa a CHAVE ANON com a sessão
// dele; se a RLS ou o upsert quebrarem, este teste quebra — que é o ponto.
// A service key só cria a conta de teste e apaga TUDO dela no fim.
//
// Skip: o arquivo roda na suíte normal (`npm test`) e se AUTO-pula quando não
// há credenciais — nunca falha por falta de ambiente. Rodar diretamente:
//   node --test tests/e2e-documentos.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let createClient = null;
let hasSupabase = false;
try {
  ({ createClient } = require('@supabase/supabase-js'));
  hasSupabase = true;
} catch {
  // dependência ausente: skip lá embaixo
}

const { gravarEstado, carregarDocumentos } = require('../lib/documentos.js');

// ---- ambiente (.env.local é a convenção do projeto; process.env ganha) ----

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

function valorEnv(chave) {
  if (process.env[chave]) return process.env[chave];
  try {
    const linhas = readFileSync(join(raiz, '.env.local'), 'utf8').split(/\r?\n/);
    for (const linha of linhas) {
      const m = linha.match(new RegExp(`^${chave}=(.*)$`));
      if (m) return m[1].trim();
    }
  } catch {
    // sem .env.local — segue
  }
  return null;
}

const URL_SUPABASE = valorEnv('NEXT_PUBLIC_SUPABASE_URL');
const CHAVE_ANON = valorEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const CHAVE_SERVICE = valorEnv('SUPABASE_SERVICE_ROLE_KEY');

const roda = hasSupabase && URL_SUPABASE && CHAVE_ANON && CHAVE_SERVICE;

test(
  'E2E: toque no mapa de documentos persiste através de um reload',
  { skip: roda ? false : 'sem credenciais/deps do Supabase (.env.local) — E2E precisa de projeto real' },
  async () => {
    // ---- helpers de service role (REST; só setup e teardown) ----------------

    const headersService = {
      apikey: CHAVE_SERVICE,
      Authorization: `Bearer ${CHAVE_SERVICE}`,
      'Content-Type': 'application/json',
    };

    const email = `e2e-doc-${randomUUID().slice(0, 8)}@admitly.test`;
    const senha = randomBytes(12).toString('hex') + 'a1';
    let usuarioId = null;

    // Conta de teste nasce SEM senha pela API admin: é o comportamento real
    // observado no projeto que createUser com senha NÃO cria a identity (o
    // aluno não conseguia nem logar). A senha entra num PUT logo depois — aí a
    // identity 'email' nasce e o signInWithPassword funciona como no site.
    const criado = await fetch(`${URL_SUPABASE}/auth/v1/admin/users`, {
      method: 'POST',
      headers: headersService,
      body: JSON.stringify({ email, email_confirm: true }),
    });
    assert.equal(criado.ok, true, `admin users: criar conta de teste falhou (${criado.status})`);
    const corpoCriado = await criado.json();
    usuarioId = corpoCriado.id;
    assert.ok(usuarioId, 'candidatura precisa do id da conta');

    const senhaGravada = await fetch(`${URL_SUPABASE}/auth/v1/admin/users/${usuarioId}`, {
      method: 'PUT',
      headers: headersService,
      body: JSON.stringify({ password: senha }),
    });
    assert.equal(senhaGravada.ok, true, `admin users: definir senha falhou (${senhaGravada.status})`);

    // O apagamento acontece MESMO se o meio do teste quebrar — a conta é lixo
    // nosso, nunca pode sobrar no projeto.
    try {
      // ---- o aluno: cliente anon + sessão própria (transporte do navegador) --

      // "Página 1": sessão entra, o aluno cria a candidatura na aba Aplicações.
      const cliente1 = createClient(URL_SUPABASE, CHAVE_ANON);
      const { error: erroLogin } = await cliente1.auth.signInWithPassword({ email, password: senha });
      assert.equal(erroLogin, null, `signInWithPassword: ${erroLogin?.message}`);
      const { data: quemSou } = await cliente1.auth.getUser();
      assert.equal(quemSou.user.id, usuarioId);

      const { error: erroApp } = await cliente1
        .from('applications')
        .insert({ user_id: usuarioId, university: 'E2E — Universidade do Teste' });
      assert.equal(erroApp, null, `insert applications: ${erroApp?.message}`);

      const { data: apps } = await cliente1
        .from('applications')
        .select('id')
        .eq('user_id', usuarioId);
      assert.ok(apps?.length === 1, 'a candidatura criada tem que aparecer para o próprio aluno');
      const appId = apps[0].id;

      // ---- O TOQUE: mesmo handler ciclarDocumento da página -------------------

      const { error: erroToque } = await gravarEstado(usuarioId, appId, 'transcricao', 'pedindo', cliente1);
      assert.equal(erroToque, null, `gravarEstado: ${erroToque?.message}`);

      // ---- O RELOAD: cliente NOVO (nova sessão, zero memória herdade) ---------

      const cliente2 = createClient(URL_SUPABASE, CHAVE_ANON);
      const { error: erroLogin2 } = await cliente2.auth.signInWithPassword({ email, password: senha });
      assert.equal(erroLogin2, null);

      const { documentos, error: erroLeitura } = await carregarDocumentos(usuarioId, cliente2);
      assert.equal(erroLeitura, null, `carregarDocumentos: ${erroLeitura?.message || String(erroLeitura)}`);
      assert.equal(
        documentos.get(`${appId}__transcricao`),
        'pedindo',
        'o estado marcado ANTES do reload tem que voltar igual DEPOIS dele (perda de gravação = regressão)'
      );

      // ---- Segundo toque ciclo pedindo → pronto; persiste do mesmo jeito -----

      const { error: erroToque2 } = await gravarEstado(usuarioId, appId, 'transcricao', 'pronto', cliente2);
      assert.equal(erroToque2, null, `gravarEstado (2ª rodada): ${erroToque2?.message}`);

      const cliente3 = createClient(URL_SUPABASE, CHAVE_ANON);
      await cliente3.auth.signInWithPassword({ email, password: senha });
      const { documentos: documentos3 } = await carregarDocumentos(usuarioId, cliente3);
      assert.equal(documentos3.get(`${appId}__transcricao`), 'pronto', 'o ciclo completo falta→pedindo→pronto persiste');
    } finally {
      // ---- teardown: apagar a CONTA (cascade derruba applications e documents) —

      if (usuarioId) {
        // Formato endpoint: DELETE /admin/users/{id} (com querystring o endpoint
        // aceita mas NÃO apaga — observado neste projeto).
        const apagar = await fetch(`${URL_SUPABASE}/auth/v1/admin/users/${usuarioId}`, {
          method: 'DELETE',
          headers: headersService,
        });
        if (!apagar.ok) {
          // Nunca engolir: teardown falho é ruído no log, mas o falhar é real.
          console.error(`E2E documentos: FALHOU ao apagar a conta ${email} — apague manualmente`);
        }
      }
    }
  }
);
