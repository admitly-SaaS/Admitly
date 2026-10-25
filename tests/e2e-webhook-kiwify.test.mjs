// E2E do fluxo de PAGAMENTO — regressão contra “pagou e ficou trancado”.
//
// O que prova, no transporte REAL (Next de verdade rodando + Supabase de
// verdade, com RLS agindo):
//   0. token errado → 401 e NADA gravado (a porta fica fechada);
//   1. pagamento para um e-mail sem conta → 404 (a Kiwify reenvia sozinha);
//   2. webhook paid → assinatura ATIVA, e o guard REAL do app
//      (lib/subscriptions.js, com o cliente anon logado como o aluno) libera;
//   3. segundo paid (renovação) → continua EXATAMENTE 1 linha (o bug histórico
//      de duplicata que trancava aluno pago);
//   4. refund → 200 revogado e o MESMO guard volta a negar;
//   5. status neutro (awaiting_payment) → acesso inalterado;
//   6. paid devolta → reativo (revogação é reversível, não destrava o ciclo).
//
// Por que não dá pra fingir: o fluxo inteiro é HTTP — o teste levanta um
// `next dev` PRÓPRIO (porta livre, token novo, CRON_AUTO=0 e ALERTA_EMAIL
// vazios para NENHUM e-mail real sair do ambiente de teste) e fala com ele do
// lado de fora, como a Kiwify faria. Se a rota, o token ou o guard quebrarem,
// este teste quebra — que é o ponto.
// A service role só cria a conta de teste e apaga TUDO dela no fim.
//
// Skip: roda na suíte normal (`npm test`) e se AUTO-pula quando não há
// credenciais/deps — nunca falha por falta de ambiente. Direto:
//   node --test tests/e2e-webhook-kiwify.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let createClient = null;
let temAssinaturaAtiva = null;
let hasDeps = false;
try {
  ({ createClient } = require('@supabase/supabase-js'));
  ({ temAssinaturaAtiva } = require('../lib/subscriptions.js'));
  hasDeps = true;
} catch {
  // dependência ausente: skip lá embaixo
}

// ---- ambiente (.env.local é a convenção do projeto; process.env ganha) -----

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
const nextBin = join(raiz, 'node_modules', 'next', 'dist', 'bin', 'next');
const roda = hasDeps && URL_SUPABASE && CHAVE_ANON && CHAVE_SERVICE && existsSync(nextBin);

const headersService = {
  apikey: CHAVE_SERVICE,
  Authorization: `Bearer ${CHAVE_SERVICE}`,
  'Content-Type': 'application/json',
};

// ---- infra do servidor de teste --------------------------------------------

const portaLivre = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const porta = srv.address().port;
      srv.close(() => resolve(porta));
    });
  });

function subirServidor(porta, token) {
  // CRON_AUTO=0 → o agendador de e-mails NUNCA liga neste servidor; ALERTA
  // vazio → avisos operacionais ficam em log por desenho. Nada sai de verdade.
  const filho = spawn(
    process.execPath,
    [nextBin, 'dev', '--port', String(porta), '--hostname', '127.0.0.1'],
    {
      cwd: raiz,
      env: { ...process.env, KIWIFY_WEBHOOK_TOKEN: token, CRON_AUTO: '0', ALERTA_EMAIL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  const saida = [];
  filho.stdout.on('data', (d) => saida.push(`out> ${d}`));
  filho.stderr.on('data', (d) => saida.push(`err> ${d}`));
  const cauda = () => saida.join('').split('\n').slice(-40).join('\n');
  return { filho, cauda };
}

async function esperarServidor(prontoUrl, servidor, { maxMs = 120_000 } = {}) {
  const inicio = Date.now();
  while (Date.now() - inicio < maxMs) {
    if (servidor.filho.exitCode !== null) throw new Error(`next dev morreu no boot:\n${servidor.cauda()}`);
    try {
      // QUALQUER resposta HTTP prova que o servidor responde; erro de rede
      // é “ainda não”.
      return await fetch(prontoUrl, { signal: AbortSignal.timeout(3000) });
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`next dev não respondeu em ${maxMs / 1000}s:\n${servidor.cauda()}`);
}

/** POST no webhook com tolerância de rede/o boot (o 1º pode incluir compilação). */
async function postWebhook(base, token, corpo) {
  const q = token == null ? '' : `?token=${encodeURIComponent(token)}`;
  for (let tentativa = 0; ; tentativa += 1) {
    try {
      return await fetch(`${base}/api/webhook-kiwify${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      if (tentativa >= 40) throw new Error('webhook nunca respondeu por rede');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

test(
  'E2E: webhook Kiwify paga → app desbloqueia → reembolso tranca de novo',
  {
    skip: roda ? false : 'sem credencias/deps do Supabase (.env.local) — E2E precisa de projeto real',
    timeout: 300_000, // boot do Next + compilação da rota no 1º POST
  },
  async () => {
    const token = randomBytes(24).toString('hex');
    const porta = await portaLivre();
    const base = `http://127.0.0.1:${porta}`;
    const servidor = subirServidor(porta, token);
    const { filho } = servidor;

    const email = `e2e-webhook-${randomUUID().slice(0, 8)}@admitly.test`;
    const senha = randomBytes(12).toString('hex') + 'a1';
    let usuarioId = null;

    // O apagamento acontece MESMO se o meio do teste quebrar — a conta é lixo
    // nosso, nunca pode sobrar no projeto.
    try {
      await esperarServidor(base, servidor);

      // ---- conta de teste: sem senha na criação (identity não nasce), senha
      // num PUT logo depois — padrão observado deste projeto (e2e-documentos).
      const criado = await fetch(`${URL_SUPABASE}/auth/v1/admin/users`, {
        method: 'POST',
        headers: headersService,
        body: JSON.stringify({ email, email_confirm: true }),
      });
      assert.equal(criado.ok, true, `admin users: criar conta de teste falhou (${criado.status})`);
      const corpoCriado = await criado.json();
      usuarioId = corpoCriado.id;
      assert.ok(usuarioId, 'e-mail precisa do id da conta');
      const senhaGravada = await fetch(`${URL_SUPABASE}/auth/v1/admin/users/${usuarioId}`, {
        method: 'PUT',
        headers: headersService,
        body: JSON.stringify({ password: senha }),
      });
      assert.equal(senhaGravada.ok, true, `admin users: definir senha falhou (${senhaGravada.status})`);

      // ---- o aluno: cliente anon + sessão própria (transporte do navegador) --
      // O GUARD É O do app: lib/subscriptions.js via RLS. Se a leitura do
      // aluno quebrar, o desbloqueio NÃO pode ser provado.

      const pagamento = (emailOuToken, status) => ({
        Customer: { email: emailOuToken },
        order_status: status,
      });

      let client = createClient(URL_SUPABASE, CHAVE_ANON);
      const { error } = await client.auth.signInWithPassword({ email, password: senha });
      assert.equal(error, null, `signInWithPassword: ${error?.message}`);

      const linhas = async () => {
        const { data } = await client.from('subscriptions').select('id, status').eq('user_id', usuarioId);
        return Array.isArray(data) ? data : [];
      };

      // ---- ANTES: trancado (o pagamento não chegou) ------------------------
      assert.equal(await temAssinaturaAtiva(client, usuarioId), false, 'sem pagamento, o guard tem que negar');
      assert.equal((await linhas()).length, 0, 'sem pagamento, NADA pode estar gravado');

      // ---- (0) token errado: 401 e nada gravado ----------------------------
      let r = await postWebhook(base, `${token}errado`, pagamento(email, 'paid'));
      assert.equal(r.status, 401, 'token errado recebe 401');
      assert.equal(await temAssinaturaAtiva(client, usuarioId), false, 'token errado NÃO libera');
      assert.equal((await linhas()).length, 0, 'token errado NÃO grava nada');

      // ---- (1) pagamento de e-mail sem conta: 404 --------------------------
      r = await postWebhook(base, token, pagamento(`ninguem-${randomUUID().slice(0, 6)}@admitly.test`, 'paid'));
      assert.equal(r.status, 404, 'pagamento para e-mail sem conta devolve 404 (Kiwify reenvia)');

      // ---- (2) paid → desbloqueio via o GUARD DO APP -----------------------
      r = await postWebhook(base, token, pagamento(email, 'paid'));
      assert.equal(r.status, 200, `paid: esperado 200 (got ${r.status})`);
      let corpo = await r.json().catch(() => ({}));
      assert.equal(corpo.acesso, 'liberado', 'resposta do paid é “liberado”');

      // Sessão fresca (o que um reload de página faria) — e o guard do app:
      client = createClient(URL_SUPABASE, CHAVE_ANON);
      await client.auth.signInWithPassword({ email, password: senha });
      assert.equal(
        await temAssinaturaAtiva(client, usuarioId),
        true,
        'APÓS paid o guard do app (RLS) precisa liberar o acesso — regressão de “pagou e ficou trancado”'
      );
      let at = await linhas();
      assert.equal(at.length, 1, 'exatamente UMA linha de assinatura');
      assert.equal(at[0].status, 'active');

      // ---- (3) renovação (paid de novo): sem duplicata ---------------------
      r = await postWebhook(base, token, pagamento(email, 'paid'));
      assert.equal(r.status, 200, 'renovação: 200');
      at = await linhas();
      assert.equal(at.length, 1, 'renovação NÃO cria linha nova (bug histórico de duplicata)');
      assert.equal(await temAssinaturaAtiva(client, usuarioId), true, 'renovação mantém o acesso');

      // ---- (4) refund → tradado e o guard volta a NEGAR --------------------
      r = await postWebhook(base, token, pagamento(email, 'refund_requested'));
      assert.equal(r.status, 200, 'refund: 200');
      corpo = await r.json().catch(() => ({}));
      assert.equal(corpo.acesso, 'revogado', 'resposta do refund é “revogado”');
      assert.equal(
        await temAssinaturaAtiva(client, usuarioId),
        false,
        'APÓS refund o guard do app volta a negar (sessão persistida não vale)'
      );

      // ---- (5) status neutro: nada muda ------------------------------------
      r = await postWebhook(base, token, pagamento(email, 'awaiting_payment'));
      assert.equal(r.status, 200, 'status neutro: 200');
      corpo = await r.json().catch(() => ({}));
      assert.equal(corpo.acesso, 'inalterado', 'status fora do mapa NÃO mexe no acesso');
      assert.equal(await temAssinaturaAtiva(client, usuarioId), false, 'status neutro NÃO libera');

      // ---- (6) paid devolta: o ciclo reativa --------------------------------
      r = await postWebhook(base, token, pagamento(email, 'approved'));
      assert.equal(r.status, 200, 'reativação: 200');
      corpo = await r.json().catch(() => ({}));
      assert.equal(corpo.acesso, 'liberado', 'status “approved” também libera (mapa de pagos)');
      assert.equal(await temAssinaturaAtiva(client, usuarioId), true, 'pagamento depois do refund REATIVA o acesso');

      // Ainda UMA linha (todas as pernas moraram na MESMA linha):
      assert.equal((await linhas()).length, 1, 'pago→regeneração→refund→netro→pago mantém 1 linha só');
    } finally {
      // ---- teardown: mata o Next e apaga a CONTA (cascade derruba assinaturas)

      filho.kill();
      setTimeout(() => filho.kill('SIGKILL'), 3000).unref?.();

      if (usuarioId) {
        // Formato endpoint: DELETE /admin/users/{id} (com querystring o endpoint
        // aceita mas NÃO apaga — observado neste projeto).
        const apagar = await fetch(`${URL_SUPABASE}/auth/v1/admin/users/${usuarioId}`, {
          method: 'DELETE',
          headers: headersService,
        });
        if (!apagar.ok) {
          // Nunca engolir: teardown falho é ruído no log, mas o falhar é real.
          console.error(`E2E webhook: FALHOU ao apagar a conta ${email} — apague manualmente`);
        }
      }
    }
  },
);

