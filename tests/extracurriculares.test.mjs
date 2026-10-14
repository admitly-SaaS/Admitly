import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  TABELA,
  STATUS,
  CATEGORIAS,
  criarAtividade,
  listarAtividades,
  atualizarAtividade,
  removerAtividade,
  contarAtividades,
  resumoParaPerfil,
  vagasComunsApp,
} = require('../lib/extracurriculares.js');

// ---- falso cliente Supabase (padrão dos outros testes do projeto) ----

function clienteFalso(configurado = {}) {
  const chamadas = { tabela: null, acao: null, updateBody: null, insertBody: null };
  const construir = (tabela) => {
    chamadas.tabela = tabela;
    const q = {
      select: () => q,
      single: () => Promise.resolve({ data: configurado.insertData ?? null, error: configurado.insertError ?? null }),
      eq: (col, val) => { chamadas.ultimoEq = `${col}=${val}`; return q; },
      order: (col, opts) => { chamadas.ordenada = `${col} ${opts?.ascending === false ? 'desc' : 'asc'}`; return q; },
      update: (corpo) => { chamadas.updateBody = corpo; return q; },
      insert: (corpo) => { chamadas.insertBody = corpo; return q; },
      delete: () => { chamadas.acao = 'delete'; return q; },
      then: (res, rej) => Promise.resolve({ data: configurado.finalData ?? null, error: configurado.finalError ?? null }).then(res, rej),
    };
    return q;
  };
  return {
    chamadas,
    from(tabela) { return construir(tabela); },
  };
}

// ---- constantes ----

test('TABELA é extracurriculares e catálogos cobrem a jornada', () => {
  assert.equal(TABELA, 'extracurriculares');
  assert.ok(STATUS.includes('em_curso') && STATUS.includes('enviada'));
  assert.ok(CATEGORIAS.includes('pesquisa') && CATEGORIAS.includes('projeto_proprio'));
});

// ---- CRUD ----

test('criarAtividade: grava com user_id, corta campos e valida categoria/status', async () => {
  const cliente = clienteFalso({ insertData: { id: 'a1' } });
  const { data, error } = await criarAtividade('u1', {
    nome: ' Clube de Robótica '
    + 'X'.repeat(200),
    papel: 'Capitã',
    categoria: 'pesquisa',
    horas_semana: '6',
    semanas_ano: 40,
    descricao: 'fatos '.repeat(200),
    status: 'status-fake',
    inicio: '2025-03',
  }, cliente);
  assert.equal(error, null);
  assert.equal(data.id, 'a1');
  assert.equal(cliente.chamadas.tabela, 'extracurriculares');
  assert.equal(cliente.chamadas.insertBody.user_id, 'u1');
  assert.equal(cliente.chamadas.insertBody.nome.length, 80);
  assert.equal(cliente.chamadas.insertBody.descricao.length, 400);
  assert.equal(cliente.chamadas.insertBody.status, 'em_curso'); // inválido → default
  assert.equal(cliente.chamadas.insertBody.horas_semana, 6);
  assert.equal(cliente.chamadas.insertBody.descricao_polida, '');
});

test('criarAtividade: categoria inválida vira outra; horas vazias viram null', async () => {
  const cliente = clienteFalso({ insertData: { id: 'a2' } });
  await criarAtividade('u1', { nome: 'Natação', categoria: 'baleia', horas_semana: '' }, cliente);
  assert.equal(cliente.chamadas.insertBody.categoria, 'outra');
  assert.equal(cliente.chamadas.insertBody.horas_semana, null);
});

test('listarAtividades: ordena por ordem asc e criado desc', async () => {
  const cliente = clienteFalso({ finalData: [] });
  const { data } = await listarAtividades('u1', cliente);
  assert.deepEqual(data, []);
  assert.equal(cliente.chamadas.ordenada, 'created_at desc');
  assert.ok(String(cliente.chamadas.ultimoEq).includes('user_id=u1'));
});

test('atualizarAtividade: filtra campos permitidos e valida categoria/status', async () => {
  const cliente = clienteFalso();
  await atualizarAtividade('a1', { nome: 'Novo', user_id: 'hack', criado_em: 'x' }, cliente);
  assert.equal(cliente.chamadas.updateBody.nome, 'Novo');
  assert.equal(cliente.chamadas.updateBody.user_id, undefined);

  const { error: errCat } = await atualizarAtividade('a1', { categoria: 'baleia' }, cliente);
  assert.ok(errCat);
  const { error: errStatus } = await atualizarAtividade('a1', { status: 'baleia' }, cliente);
  assert.ok(errStatus);
  const { error: vazio } = await atualizarAtividade('a1', {}, cliente);
  assert.equal(vazio, null);
});

test('removerAtividade: delete por id', async () => {
  const cliente = clienteFalso();
  const { error } = await removerAtividade('a1', cliente);
  assert.equal(error, null);
  assert.equal(cliente.chamadas.acao, 'delete');
  assert.ok(String(cliente.chamadas.ultimoEq).includes('id=a1'));
});

// ---- derivados ----

test('contarAtividades: conta por status', () => {
  const lista = [
    { status: 'em_curso' },
    { status: 'listagem_pronta' },
    { status: 'listagem_pronta' },
    { status: 'enviada' },
  ];
  const c = contarAtividades(lista);
  assert.equal(c.total, 4);
  assert.equal(c.em_curso, 1);
  assert.equal(c.listagem_pronta, 2);
  assert.equal(c.enviada, 1);
  assert.equal(contarAtividades(null).total, 0);
});

test('resumoParaPerfil: uma linha "nome (papel, Xh/sem)" compatível com o perfil', () => {
  const lista = [
    { nome: 'Clube de Robótica', papel: 'Capitã', horas_semana: 6 },
    { nome: 'Natação', papel: '', horas_semana: null },
    { nome: 'Monitoria', papel: 'Monitora', horas_semana: null },
  ];
  assert.equal(
    resumoParaPerfil(lista),
    'Clube de Robótica (Capitã, 6h/sem), Natação, Monitoria (Monitora)'
  );
  assert.equal(resumoParaPerfil([]), '');
  assert.equal(resumoParaPerfil(null), '');
});

test('vagasComunsApp: conta as prontas contra as 10 vagas do Common App', () => {
  const lista = [
    { status: 'em_curso' },            // não conta
    { status: 'listagem_pronta' },
    { status: 'usada_em_redacao' },
    { status: 'enviada' },
    ...Array.from({ length: 10 }, () => ({ status: 'enviada' })), // estoura
  ];
  const v = vagasComunsApp(lista);
  assert.equal(v.usadas, 13);
  assert.equal(v.restantes, 0);
  assert.deepEqual(vagasComunsApp([]), { usadas: 0, restantes: 10 });
});
