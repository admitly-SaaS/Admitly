import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { devePausar, prefsPadrao, normalizarPrefs, JOBS_PAUSAVEIS } = require('../lib/email-prefs.js');

// ---- a decisão pura: quando pausa e quando NÃO pausa -----------------------

test('devePausar: pausa só quando a preferência do job é true', () => {
  assert.equal(devePausar({ pausar_digest: true }, 'digest'), true);
  assert.equal(devePausar({ pausar_digest: true }, 'alerta'), false, 'pausar digest não silencia alerta');
  assert.equal(devePausar({ pausar_alerta: true }, 'alerta'), true);
  assert.equal(devePausar({ pausar_digest: false, pausar_alerta: false }, 'digest'), false);
});

test('devePausar: NÃO pausa por défaut/estado confuso (pausa é exceção, não regra)', () => {
  // linha ausente (a maioria do alunos): nada pausa
  assert.equal(devePausar(null, 'digest'), false);
  assert.equal(devePausar(null, 'alerta'), false);
  // undefined e schema quebrado: nunca silencia por desencontro
  assert.equal(devePausar(undefined, 'digest'), false);
  assert.equal(devePausar('lixo', 'alerta'), false);
  // valor estranho (não-boolean estritamente true): não pausa
  assert.equal(devePausar({ pausar_digest: 1 }, 'digest'), false);
  assert.equal(devePausar({ pausar_digest: 'sim' }, 'alerta'), false);
  // job desconhecido: nunca pausa (silêncio geral por bug seria catastrófico)
  assert.equal(devePausar({ pausar_digest: true, pausar_alerta: true }, 'qualquer'), false);
});

test('jobs pausáveis são digest, alerta e onboarding — a superfície toda dos e-mails do cron', () => {
  assert.deepEqual(JOBS_PAUSAVEIS, ['digest', 'alerta', 'onboarding']);
});

test('prefsPadrao/normalizarPrefs: linha ausente = tudo ligado, sem undefined na tela', () => {
  assert.deepEqual(prefsPadrao(), { pausar_digest: false, pausar_alerta: false, pausar_onboarding: false });
  assert.deepEqual(normalizarPrefs(null), { pausar_digest: false, pausar_alerta: false, pausar_onboarding: false });
  const linha = { pausar_digest: true, pausar_alerta: false, pausar_onboarding: true, atualizado_em: '2026-10-18T12:00:00Z' };
  const normal = normalizarPrefs(linha);
  assert.deepEqual(normal, { pausar_digest: true, pausar_alerta: false, pausar_onboarding: true });
  assert.equal('atualizado_em' in normal, false, 'a tela só vê os toggles, nada de schema vazar');
});

// ---- leitura/gravação contra cliente falso (padrão da suíte) ---------------

function clienteFalso({ leitura = null, erroLeitura = null, erroGrava = null } = {}) {
  const chamadas = { tabela: null, upsertBody: null, onConflict: null };
  const construir = (tabela) => {
    chamadas.tabela = tabela;
    const q = {
      select: () => q,
      eq: (col, val) => { chamadas.ultimoEq = `${col}=${val}`; return q; },
      maybeSingle: () => Promise.resolve({ data: leitura, error: erroLeitura }),
      upsert: (corpo, opts) => { chamadas.upsertBody = corpo; chamadas.onConflict = opts?.onConflict; return Promise.resolve({ error: erroGrava }); },
    };
    return q;
  };
  return { chamadas, from: (t) => construir(t) };
}

test('lerPrefs: lê a linha do aluno; falha real volta como erro (não como silêncio)', async () => {
  const ok = clienteFalso({ leitura: { pausar_digest: true, pausar_alerta: false, pausar_onboarding: true } });
  const r1 = await require('../lib/email-prefs.js').lerPrefs(ok, 'u1');
  assert.equal(r1.error, null);
  assert.deepEqual(r1.prefs, { pausar_digest: true, pausar_alerta: false, pausar_onboarding: true });
  assert.ok(String(ok.chamadas.ultimoEq).includes('user_id=u1'));

  const quebra = clienteFalso({ erroLeitura: { code: '42P01', message: 'boom' } });
  const r2 = await require('../lib/email-prefs.js').lerPrefs(quebra, 'u1');
  assert.ok(r2.error);
  assert.equal(r2.prefs, null);
});

test('lerPrefs: migration ausente (PGRST205) vira TABELA_AUSENTE — o cron NÃO pausa ninguém sabido', async () => {
  const { lerPrefs } = require('../lib/email-prefs.js');
  const falso = clienteFalso({ erroLeitura: { code: 'PGRST205', message: 'Could not find the table' } });
  const r = await lerPrefs(falso, 'u1');
  assert.equal(r.error?.code, 'TABELA_AUSENTE');
  assert.equal(r.prefs, null);
  // com prefs null, a decisão pura mantém o fluxo: ninguém é silenciado
  assert.equal(devePausar(r.prefs, 'digest'), false);
});

test('gravarPrefs: upsert por user_id, bool estrito e atualizado_em novo', async () => {
  const { gravarPrefs } = require('../lib/email-prefs.js');
  const falso = clienteFalso();
  const r = await gravarPrefs('u1', { pausar_digest: true, pausar_alerta: 'x' }, falso);
  // assinatura: gravarPrefs(userId, valores, client)
  assert.equal(r.error, null);
  assert.equal(falso.chamadas.tabela, 'email_prefs');
  assert.equal(falso.chamadas.upsertBody.user_id, 'u1');
  assert.equal(falso.chamadas.upsertBody.pausar_digest, true);
  assert.equal(falso.chamadas.upsertBody.pausar_alerta, false, 'valor estranho vira false estrito');
  assert.ok(falso.chamadas.upsertBody.atualizado_em);
  assert.equal(falso.chamadas.onConflict, 'user_id');
});

test('gravarPrefs: sem migration, TABELA_AUSENTE — a tela desfaz o toggle com aviso', async () => {
  const { gravarPrefs } = require('../lib/email-prefs.js');
  const falso = clienteFalso({ erroGrava: { code: 'PGRST205', message: 'Could not find the table' } });
  const r = await gravarPrefs('u1', { pausar_digest: true }, falso);
  assert.equal(r.error?.code, 'TABELA_AUSENTE', 'a tela desfaz o toggle otimista e avisa com este código');
});
