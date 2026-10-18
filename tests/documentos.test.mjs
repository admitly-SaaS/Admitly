// Testes de lib/documentos.js — mapa de documentos por candidatura.
// Runner: node --test (nativo), import dinâmico como os outros testes ESM.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  TABELA,
  TIPOS,
  proximoEstado,
  desmarcarEstado,
  carregarDocumentos,
  gravarEstado,
  criticosFaltando,
  LIMITE_CRITICO,
  CRITICOS,
} = await import('../lib/documentos.js');

// Falso cliente do Supabase: cobre o contrato (select eq / upsert onConflict)
// sem rede — mesmo padrão dos testes de radar-descartes.
function clienteFalso(configurado = {}) {
  const chamadas = { tabela: null, acao: null, filtroEq: null, upsertBody: null, onConflict: null };
  const tabela = {
    upsert(body, opts) {
      chamadas.acao = 'upsert';
      chamadas.upsertBody = body;
      chamadas.onConflict = opts?.onConflict || null;
      return Promise.resolve({ data: null, error: configurado.upsertError ?? null });
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

test('catalogo: tipos essenciais presentes e únicos', () => {
  const ids = TIPOS.map((t) => t.id);
  assert.equal(TABELA, 'application_documents');
  assert.ok(TIPOS.length >= 5 && TIPOS.length <= 10, 'curado: nem infinito nem mísero');
  assert.deepEqual([...new Set(ids)], ids, 'sem id repetido');
  for (const t of TIPOS) {
    assert.ok(t.nome && t.dica, `${t.id} precisa de nome e dica`);
  }
  for (const chave of ['transcricao', 'passaporte', 'redacao', 'recomendacao']) {
    assert.ok(ids.includes(chave), `${chave} é essencial`);
  }
});

test('proximoEstado: ciclo falta → pedindo → pronto → falta', () => {
  let estado = 'falta';
  const trilha = [estado];
  for (let i = 0; i < 3; i++) {
    estado = proximoEstado(estado);
    trilha.push(estado);
  }
  assert.deepEqual(trilha, ['falta', 'pedindo', 'pronto', 'falta'], 'ciclo em 3 toques');
  assert.equal(proximoEstado('nao-pede'), 'falta', 'sair de não-pede volta ao começo');
  assert.equal(proximoEstado(undefined), 'pedindo', 'estado estranho trata como falta');
});

test('desmarcarEstado: qualquer estado volta a falta, sem ciclar', () => {
  // O botão "desmarcar" é o caminho curto — de QUALQUER dos quatro estados, o
  // resultado é 'falta' em um toque (nada de passar por 'pronto' no meio).
  for (const estado of ['falta', 'pedindo', 'pronto', 'nao-pede', undefined, 'valor-estranho']) {
    assert.equal(desmarcarEstado(estado), 'falta', `desmarcar a partir de ${estado} deve dar falta`);
  }
});

test('carregarDocumentos: devolve Map chave appId__tipo filtrando lixo', async () => {
  const cliente = clienteFalso({
    selectData: [
      { application_id: 'a', tipo: 'passaporte', estado: 'pronto' },
      { application_id: 'a', tipo: 'tipo-inexistente', estado: 'pronto' }, // fora do catálogo
      { application_id: 'b', tipo: 'redacao', estado: 'estado-ruim' }, // estado inválido
      { application_id: null, tipo: 'passaporte', estado: 'pronto' }, // chave inválida
    ],
  });
  const { documentos, error } = await carregarDocumentos('u1', cliente);
  assert.equal(error, null);
  assert.equal(cliente.chamadas.tabela, 'application_documents');
  assert.equal(documentos.size, 1);
  assert.equal(documentos.get('a__passaporte'), 'pronto');
});

test('carregarDocumentos: PGRST205 (migration não rodou) vira TABELA_AUSENTE', async () => {
  const cliente = clienteFalso({
    selectError: { code: 'PGRST205', message: 'Could not find the table public.application_documents in the schema cache' },
  });
  const { documentos, error } = await carregarDocumentos('u1', cliente);
  assert.equal(documentos.size, 0);
  assert.equal(error.code, 'TABELA_AUSENTE');
});

test('gravarEstado: upsert com conflito (user_id, application_id, tipo) e estado válido', async () => {
  const cliente = clienteFalso();
  const { error } = await gravarEstado('u1', 'a', 'transcricao', 'pedindo', cliente);
  assert.equal(error, null);
  assert.equal(cliente.chamadas.tabela, 'application_documents');
  assert.equal(cliente.chamadas.acao, 'upsert');
  assert.equal(cliente.chamadas.upsertBody.user_id, 'u1');
  assert.equal(cliente.chamadas.upsertBody.application_id, 'a');
  assert.equal(cliente.chamadas.upsertBody.tipo, 'transcricao');
  assert.equal(cliente.chamadas.upsertBody.estado, 'pedindo');
  assert.equal(cliente.chamadas.onConflict, 'user_id,application_id,tipo');
  assert.ok(cliente.chamadas.upsertBody.atualizado_em, 'grava o momento');
});

test('gravarEstado: rejeita tipo ou estado fora do catálogo sem tocar no banco', async () => {
  const a = await gravarEstado('u1', 'a', 'doc-estranho', 'pronto', clienteFalso());
  const b = await gravarEstado('u1', 'a', 'passaporte', 'quase-pronto', clienteFalso());
  const c = await gravarEstado(null, 'a', 'passaporte', 'pronto', clienteFalso());
  const d = await gravarEstado('u1', null, 'passaporte', 'pronto', clienteFalso());
  for (const r of [a, b, c, d]) {
    assert.equal(r.error?.code, 'ARGUMENTO');
  }
});

// ---------- sugestão automática de críticos (prazo < 30 dias) ----------

test('criticosFaltando: prazo em até 29 dias devolve críticos ainda em falta, na ordem', () => {
  assert.equal(LIMITE_CRITICO, 30);
  // CRITICOS tem presença obrigatória dos pedidos que levam semanas (feedback 16/10)
  const ids = CRITICOS.map((c) => c.id);
  assert.ok(ids.includes('proficiencia') && ids.includes('recomendacao'));

  const map = new Map([['app1__proficiencia', 'pedindo']]);
  const criticos = criticosFaltando(map, 'app1', 29);
  assert.deepEqual(
    criticos.map((t) => t.id),
    CRITICOS.filter((c) => c.id !== 'proficiencia').map((c) => c.id),
    'em pedido não é crítico; falta na ordem de CRITICOS'
  );
});

test('criticosFaltando: 30 dias ou mais, sem data, encerrada e sem mapa não sugerem', () => {
  const map = new Map();
  assert.deepEqual(criticosFaltando(map, 'app1', 45), [], 'fora da janela');
  assert.deepEqual(criticosFaltando(map, 'app1', 30), [], 'o limite é < 30, não <= 30');
  assert.deepEqual(criticosFaltando(map, 'app1', 7), CRITICOS.map((c) => TIPOS.find((t) => t.id === c.id)));
  assert.deepEqual(criticosFaltando(map, 'app1', null), [], 'sem data');
  assert.deepEqual(criticosFaltando(map, 'app1', -2), [], 'encerrada');
  assert.deepEqual(criticosFaltando(null, 'app1', 7), []);
  assert.deepEqual(criticosFaltando(map, null, 7), []);
});

test('criticosFaltando: estado pronto ou nao-pede nunca é crítico', () => {
  const map = new Map([
    ['app2__proficiencia', 'pronto'],
    ['app2__recomendacao', 'nao-pede'],
  ]);
  const criticos = criticosFaltando(map, 'app2', 7);
  assert.deepEqual(criticos.map((t) => t.id).filter((id) => id === 'passaporte'), ['passaporte']);
  assert.ok(!criticos.some((t) => t.id === 'proficiencia'), 'pronto não vira crítico');
  assert.ok(!criticos.some((t) => t.id === 'recomendacao'), 'nao-pede não vira crítico');
});
