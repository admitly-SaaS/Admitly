// Testes de lib/radar-descartes.js — persistência das reações do Radar.
// Runner: node --test (nativo, mesmo padrão dos outros testes).
// A lib é ESM com export nomeado; como os testes deste projeto usam
// createRequire para carregar CommonJS, aqui usamos dynamic import direto.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { gravarDescarte, listarDescartes, TABELA } = await import('../lib/radar-descartes.js');

// Falso cliente do Supabase: registra chamadas encadeadas e devolve o que
// o teste configurar. Cobre o contrato (select/eq/upsert) sem rede.
function clienteFalso(configurado = {}) {
  const chamadas = { tabela: null, acao: null, filtroEq: null, upsertBody: null, onConflict: null };
  const tabela = {
    upsert(body, opts) {
      chamadas.acao = 'upsert';
      chamadas.upsertBody = body;
      chamadas.onConflict = opts?.onConflict || null;
      return Promise.resolve({ data: configurado.upsertData ?? null, error: configurado.upsertError ?? null });
    },
    select() {
      return {
        eq(coluna, valor) {
          chamadas.filtroEq = `${coluna}=${valor}`;
          return Promise.resolve({ data: configurado.selectData ?? null, error: configurado.selectError ?? null });
        },
      };
    },
  };
  return {
    chamadas,
    from(t) {
      chamadas.tabela = t;
      return tabela;
    },
  };
}

test('TABELA é radar_descartes', () => {
  assert.equal(TABELA, 'radar_descartes');
});

test('gravarDescarte: upsert com conflito em (user_id, opportunity_id) e reacao válida', async () => {
  const cliente = clienteFalso();
  const { error } = await gravarDescarte('u1', 'o1', 'descartado', cliente);
  assert.equal(error, null);
  assert.equal(cliente.chamadas.tabela, 'radar_descartes');
  assert.equal(cliente.chamadas.acao, 'upsert');
  assert.equal(cliente.chamadas.upsertBody.user_id, 'u1');
  assert.equal(cliente.chamadas.upsertBody.opportunity_id, 'o1');
  assert.equal(cliente.chamadas.upsertBody.reacao, 'descartado');
  assert.equal(cliente.chamadas.onConflict, 'user_id,opportunity_id');
  assert.ok(cliente.chamadas.upsertBody.atualizado_em, 'grava o momento');
});

test('gravarDescarte: aceita também reacao "feito"', async () => {
  const cliente = clienteFalso();
  const { error } = await gravarDescarte('u1', 'o2', 'feito', cliente);
  assert.equal(error, null);
  assert.equal(cliente.chamadas.upsertBody.reacao, 'feito');
});

test('gravarDescarte: rejeita tipo inválido sem tocar no banco', async () => {
  const cliente = clienteFalso();
  const { error } = await gravarDescarte('u1', 'o1', 'salvar', cliente);
  assert.ok(error);
  assert.match(error.message, /tipo inválido/);
  assert.equal(cliente.chamadas.acao, null, 'nenhuma query foi feita');
});

test('gravarDescarte: rejeita userId ou opportunityId ausentes', async () => {
  const cliente = clienteFalso();
  const a = await gravarDescarte(null, 'o1', 'descartado', cliente);
  const b = await gravarDescarte('u1', null, 'descartado', cliente);
  assert.ok(a.error && b.error);
  assert.equal(cliente.chamadas.acao, null);
});

// Degradção graciosa: a migration pode não ter rodado ainda — o PostgREST
// responde 404 de schema cache com código PGRST205. O contrato é transformar
// isso num error marcado, não em exceção.
test('gravarDescarte: PGRST205 (tabela ausente) vira erro TABELA_AUSENTE', async () => {
  const cliente = clienteFalso({ upsertError: { code: 'PGRST205', message: 'Could not find the table public.radar_descartes in the schema cache' } });
  const { error } = await gravarDescarte('u1', 'o1', 'descartado', cliente);
  assert.equal(error?.code, 'TABELA_AUSENTE');
});

test('gravarDescarte: outro erro passa direto (não é mascarado)', async () => {
  const cliente = clienteFalso({ upsertError: { code: '42501', message: 'RLS violation' } });
  const { error } = await gravarDescarte('u1', 'o1', 'descartado', cliente);
  assert.equal(error?.code, '42501');
});

test('listarDescartes: devolve Map de id→reacao, filtrando reações inválidas', async () => {
  const cliente = clienteFalso({
    selectData: [
      { opportunity_id: 'a', reacao: 'descartado' },
      { opportunity_id: 'b', reacao: 'feito' },
      { opportunity_id: 'c', reacao: 'lixo' }, // inválido, entra fora
      { opportunity_id: null, reacao: 'descartado' }, // id inválido, fora
    ],
  });
  const { descartes, error } = await listarDescartes('u1', cliente);
  assert.equal(error, null);
  assert.ok(descartes instanceof Map);
  assert.equal(descartes.size, 2);
  assert.equal(descartes.get('a'), 'descartado');
  assert.equal(descartes.get('b'), 'feito');
  assert.equal(cliente.chamadas.filtroEq, 'user_id=u1');
});

test('listarDescartes: sem userId devolve Map vazio sem consultar', async () => {
  const cliente = clienteFalso();
  const { descartes, error } = await listarDescartes(null, cliente);
  assert.equal(error, null);
  assert.equal(descartes.size, 0);
  assert.equal(cliente.chamadas.acao, null);
});

test('listarDescartes: tabela ausente degrada em Map vazio + TABELA_AUSENTE', async () => {
  const cliente = clienteFalso({ selectError: { code: 'PGRST205', message: 'Could not find the table' } });
  const { descartes, error } = await listarDescartes('u1', cliente);
  assert.ok(descartes instanceof Map);
  assert.equal(descartes.size, 0);
  assert.equal(error?.code, 'TABELA_AUSENTE');
});

test('listarDescartes: ids numéricos são canonizados em string (match com opps do catálogo)', async () => {
  const cliente = clienteFalso({ selectData: [{ opportunity_id: 42, reacao: 'descartado' }] });
  const { descartes } = await listarDescartes('u1', cliente);
  assert.equal(descartes.get('42'), 'descartado');
});
