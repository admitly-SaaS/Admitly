import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  TABELA,
  TABELA_VERSOES,
  STATUS,
  criarEnsaioParaUsuario,
  salvarRascunho,
  atualizarEnsaio,
  removerEnsaio,
  salvarVersao,
  listarVersoes,
  candidaturaPedeRedacao,
  calcularSugestoes,
  sugestoesRedacaoDaMensagem,
  dispensarSugestao,
  removerDispensa,
  segmentarAnalise,
} = require('../lib/redacoes.js');

// ---- falso cliente Supabase (padrão dos outros testes do projeto) ----

function clienteFalso(configurado = {}) {
  const chamadas = { tabela: null, acao: null };
  function construir(tabela) {
    chamadas.tabela = tabela;
    const q = {
      select: () => q,
      single: () => Promise.resolve({ data: configurado.insertData ?? null, error: configurado.insertError ?? null }),
      eq: (col, val) => { chamadas.ultimoEq = `${col}=${val}`; return q; },
      order: (col, opts) => { chamadas.orderBy = `${col} ${opts?.ascending === false ? 'desc' : 'asc'}`; return q; },
      update: (corpo) => { chamadas.updateBody = corpo; return q; },
      insert: (corpo) => { chamadas.insertBody = corpo; return q; },
      delete: () => { chamadas.acao = 'delete'; return q; },
      maybeSingle: () => Promise.resolve({ data: configurado.fetchData ?? null, error: configurado.fetchError ?? null }),
      then: (res, rej) => Promise.resolve({ data: configurado.finalData ?? null, error: configurado.finalError ?? null }).then(res, rej),
    };
    return q;
  }
  return {
    chamadas,
    from(t) { return construir(t); },
  };
}

// cliente encadeado para dispensarSugestao (select → eq → maybeSingle / update → eq)
function clienteDispensa(dadosFetch = null) {
  const chamadas = {};
  let q;
  q = {
    select() { return q; },
    eq(col, val) { chamadas.ultimoEqFetch = `${col}=${val}`; return q; },
    maybeSingle: () => Promise.resolve({ data: dadosFetch, error: null }),
    update(corpo) { chamadas.updateBody = corpo; return q; },
    then(res) { return Promise.resolve({ data: null, error: null }).then(res); },
  };
  return { chamadas, from: () => q };
}

// ---- constantes ----

test('TABELA é essays e versões são essay_versions', () => {
  assert.equal(TABELA, 'essays');
  assert.equal(TABELA_VERSOES, 'essay_versions');
});

test('STATUS cobre o ciclo do acordeão', () => {
  assert.deepEqual(STATUS, ['ideia', 'rascunho', 'revisao', 'final']);
});

// ---- CRUD ----

test('criarEnsaioParaUsuario: status inválido vira ideia, application_id preservado', async () => {
  const cliente = clienteFalso({ insertData: { id: 'e1' } });
  const { data, error } = await criarEnsaioParaUsuario('u1', { title: '  Why Yale ', status: 'hacker', application_id: 'ap1', word_limit: 320 }, cliente);
  assert.equal(error, null);
  assert.equal(data.id, 'e1');
  assert.equal(cliente.chamadas.tabela, 'essays');
  assert.equal(cliente.chamadas.insertBody.user_id, 'u1');
  assert.equal(cliente.chamadas.insertBody.title, 'Why Yale');
  assert.equal(cliente.chamadas.insertBody.status, 'ideia');
  assert.equal(cliente.chamadas.insertBody.application_id, 'ap1');
  assert.equal(cliente.chamadas.insertBody.word_limit, 320);
});

test('criarEnsaioParaUsuario: título vira default quando vazio', async () => {
  const cliente = clienteFalso({ insertData: { id: 'e2' } });
  await criarEnsaioParaUsuario('u1', {}, cliente);
  assert.equal(cliente.chamadas.insertBody.title, 'Redação sem título');
});

test('salvarRascunho: atualiza body e updated_at por id', async () => {
  const cliente = clienteFalso();
  const { error } = await salvarRascunho('e1', 'novo texto', cliente);
  assert.equal(error, null);
  assert.equal(cliente.chamadas.tabela, 'essays');
  assert.equal(cliente.chamadas.updateBody.body, 'novo texto');
  assert.ok(cliente.chamadas.updateBody.updated_at);
  assert.ok(cliente.chamadas.ultimoEq.includes('id=e1'));
});

test('atualizarEnsaio: filtra campos permitidos e valida status', async () => {
  const cliente = clienteFalso();
  await atualizarEnsaio('e1', { title: 'Novo título', user_id: 'hack', body: 'não' }, cliente);
  assert.equal(cliente.chamadas.updateBody.title, 'Novo título');
  assert.equal(cliente.chamadas.updateBody.user_id, undefined);
  assert.equal(cliente.chamadas.updateBody.body, undefined);

  const { error } = await atualizarEnsaio('e1', { status: 'banana', word_limit: 5 }, cliente);
  assert.ok(error);
});

test('removerEnsaio: delete por id', async () => {
  const cliente = clienteFalso();
  const { error } = await removerEnsaio('e1', cliente);
  assert.equal(error, null);
  assert.equal(cliente.chamadas.acao, 'delete');
  assert.ok(String(cliente.chamadas.ultimoEq).includes('id=e1'));
});

// ---- versões ----

test('salvarVersao: rejeita body vazio', async () => {
  const cliente = clienteFalso();
  const { error } = await salvarVersao('e1', '   ', cliente);
  assert.ok(error);
});

test('salvarVersao: grava em essay_versions com rótulo', async () => {
  const cliente = clienteFalso({ insertData: { id: 'v1' } });
  const { error } = await salvarVersao('e1', 'texto congelado', cliente);
  assert.equal(error, null);
  assert.equal(cliente.chamadas.tabela, 'essay_versions');
  assert.equal(cliente.chamadas.insertBody.essay_id, 'e1');
  assert.equal(cliente.chamadas.insertBody.body, 'texto congelado');
  assert.ok(cliente.chamadas.insertBody.label.startsWith('v ·'));
});

test('listarVersoes: order desc por created_at', async () => {
  const cliente = clienteFalso({ finalData: [] });
  const { data } = await listarVersoes('e1', cliente);
  assert.deepEqual(data, []);
  assert.equal(cliente.chamadas.orderBy, 'created_at desc');
});

// ---- banner de sugestão ----

test('candidaturaPedeRedacao: reconhece com e sem acento, rejeita outros', () => {
  assert.ok(candidaturaPedeRedacao({ details: { requirements: 'redação, entrevista' } }));
  assert.ok(candidaturaPedeRedacao({ details: { requirements: 'Requiro redacao e teste' } }));
  assert.equal(candidaturaPedeRedacao({ details: { requirements: 'carta de recomendação só' } }), false);
  assert.equal(candidaturaPedeRedacao({ details: {} }), false);
  assert.equal(candidaturaPedeRedacao({}), false);
  assert.equal(candidaturaPedeRedacao(null), false);
});

test('calcularSugestoes: só candidaturas pedindo redação sem ensaio e não dispensadas', () => {
  const aplicacoes = [
    { id: 'ap1', university: 'Yale', details: { requirements: 'redação, carta' } },
    { id: 'ap2', university: 'MIT', details: { requirements: 'carta de recomendação' } },
    { id: 'ap3', university: 'Stanford', details: { requirements: 'redação', redacao_dispensada: true } },
    { id: 'ap4', university: 'Princeton', details: {} },
  ];
  const ensaios = [
    { id: 'e1', application_id: 'ap1' },
    { id: 'e2', application_id: null },
  ];

  const sugestoes = calcularSugestoes(aplicacoes, ensaios);
  // ap1 já tem ensaio; ap2 não pede; ap3 pede mas foi dispensada; ap4 não detalha
  assert.equal(sugestoes.length, 0);

  const comYaleSemEnsaio = calcularSugestoes(aplicacoes, [{ id: 'e2', application_id: null }]);
  assert.deepEqual(comYaleSemEnsaio.map((s) => s.id), ['ap1']);
});

test('calcularSugestoes: ensaio sem vínculo não bloqueia sugestão', () => {
  const aplicacoes = [{ id: 'ap1', university: 'Yale', details: { requirements: 'redação' } }];
  const sugestoes = calcularSugestoes(aplicacoes, [{ id: 'e2', application_id: null }]);
  assert.equal(sugestoes.length, 1);
});

test('dispensarSugestao: merge em details preservando o que já existe', async () => {
  const cliente = clienteDispensa({ details: { requirements: 'redação', foo: 'bar' } });
  const { error } = await dispensarSugestao('ap1', cliente);
  assert.equal(error, null);
  const details = cliente.chamadas.updateBody?.details;
  assert.equal(details.redacao_dispensada, true);
  assert.equal(details.requirements, 'redação');
  assert.equal(details.foo, 'bar');
});

test('dispensarSugestao: candidatura sem details também salva', async () => {
  const cliente = clienteDispensa(null);
  const { error } = await dispensarSugestao('ap9', cliente);
  assert.equal(error, null);
  assert.equal(cliente.chamadas.updateBody.details.redacao_dispensada, true);
});

test('dispensarSugestao: sem application_id devolve erro sem tocar o banco', async () => {
  const cliente = clienteFalso();
  const { error } = await dispensarSugestao(null, cliente);
  assert.ok(error);
});

test('removerDispensa: tira só a chave redacao_dispensada, preservando o resto', async () => {
  const cliente = clienteDispensa({ details: { requirements: 'redação', redacao_dispensada: true, foo: 'bar' } });
  const { error } = await removerDispensa('ap1', cliente);
  assert.equal(error, null);
  const details = cliente.chamadas.updateBody?.details;
  assert.equal(details.redacao_dispensada, undefined);
  assert.equal(details.requirements, 'redação');
  assert.equal(details.foo, 'bar');
});

test('removerDispensa: candidatura sem details salva objeto vazio sem quebrar', async () => {
  const cliente = clienteDispensa(null);
  const { error } = await removerDispensa('ap9', cliente);
  assert.equal(error, null);
  assert.deepEqual(cliente.chamadas.updateBody.details, {});
});

test('removerDispensa: sem application_id devolve erro sem tocar o banco', async () => {
  const cliente = clienteFalso();
  const { error } = await removerDispensa(null, cliente);
  assert.ok(error);
});

// ---- segmentação da análise ----

test('segmentarAnalise: completa divide nas cinco seções, na ordem', () => {
  const texto = [
    'Sumário do texto: Você descreveu sua paixão por engenharia com exemplos concretos.',
    'Pontos fortes:',
    '- "montei um dron no 9º ano" é prova concreta',
    '- tom sincero',
    'A melhorar:',
    '- palavra "incrível" repetida três vezes — trocar por dados',
    'Reescrita de exemplo: A escola me deu oportunidades incríveis → A escola me deu acesso ao lab de robótica.',
    'Pergunta: quer aprofundar as repetições ou o enunciado de Yale?',
  ].join('\n');
  const secoes = segmentarAnalise(texto);
  assert.deepEqual(secoes.map((s) => s.rotulo), ['Sumário do texto', 'Pontos fortes', 'A melhorar', 'Reescrita de exemplo', 'Pergunta']);
  assert.ok(secoes[0].conteudo.includes('engenharia com exemplos concretos'));
  assert.ok(secoes[1].conteudo.startsWith('- "montei'));
  assert.ok(secoes[4].conteudo.startsWith('quer aprofundar'));
});

test('segmentarAnalise: streaming parcial segmenta só o que chegou', () => {
  const parcial = 'Sumário do texto: frase do resumo.\nPontos fortes:- "trecho ";';
  const secoes = segmentarAnalise(parcial);
  assert.equal(secoes.length, 2);
  assert.equal(secoes[1].rotulo, 'Pontos fortes');
});

test('segmentarAnalise: caixa variando (PERGUNTA:) casa e o último bloco vai até o fim', () => {
  const texto = 'Sumário do texto: ok.\nPERGUNTA: quer aprofundar?';
  const secoes = segmentarAnalise(texto);
  assert.equal(secoes.length, 2);
  assert.equal(secoes[1].rotulo.toLowerCase(), 'pergunta');
  assert.ok(secoes[1].conteudo.endsWith('quer aprofundar?'));
});

test('segmentarAnalise: texto sem marcadores vira um bloco único de fallback', () => {
  const secoes = segmentarAnalise('Só um parágrafo corrido, sem rótulos.');
  assert.equal(secoes.length, 1);
  assert.equal(secoes[0].rotulo, 'Análise');
  assert.ok(secoes[0].conteudo.startsWith('Só um parágrafo'));
  assert.deepEqual(segmentarAnalise(''), []);
  assert.deepEqual(segmentarAnalise(null), []);
});

// ---- sugestão vinda do chat (/api/chat) ----

test('sugestoesRedacaoDaMensagem: acha candidatura citada pelo nome, ace/sn accent/case', () => {
  const aplicacoes = [
    { id: 'ap1', university: 'Yale University', details: { requirements: 'redação' } },
    { id: 'ap2', university: 'Boston College', details: { requirements: 'carta de recomendação' } },
  ];

  // sem acento, maiúsculas, junto do resto da frase
  const achou = sugestoesRedacaoDaMensagem(
    'preciso fazer a aplicação pra YALE logo, como começo a redacao?',
    aplicacoes,
    []
  );
  assert.deepEqual(achou.map((s) => s.id), ['ap1']);

  // acento no enunciado
  assert.deepEqual(
    sugestoesRedacaoDaMensagem('Yale pede redação?', aplicacoes, []).map((s) => s.id),
    ['ap1']
  );
});

test('sugestoesRedacaoDaMensagem: borda de palavra evita falso positivo (MIT em "permitido")', () => {
  const aplicacoes = [
    { id: 'ap1', university: 'MIT', details: { requirements: 'redação' } },
  ];
  assert.equal(sugestoesRedacaoDaMensagem('o cronograma permitido pela MITstructuring... não', aplicacoes, []).length, 0);
  assert.equal(sugestoesRedacaoDaMensagem('quero aplicar pro MIT', aplicacoes, []).length, 1);
});

test('sugestoesRedacaoDaMensagem: nome com sufixo utilitário casa pela menção curta', () => {
  const aplicacoes = [
    { id: 'ap1', university: 'Stanford (teste dispensa)', details: { requirements: 'redação' } },
  ];
  const achou = sugestoesRedacaoDaMensagem(
    'Estou pensando em aplicar pra STANFORD — ela pede redação mesmo?',
    aplicacoes,
    []
  );
  assert.deepEqual(achou.map((s) => s.id), ['ap1']);
});

test('sugestoesRedacaoDaMensagem: ignora candidatura sem redação, dispensada ou já com ensaio', () => {
  const aplicacoes = [
    { id: 'ap1', university: 'Yale', details: { requirements: 'redação' } },
    { id: 'ap2', university: 'Stanford', details: { requirements: 'redação', redacao_dispensada: true } },
    { id: 'ap3', university: 'Harvard', details: { requirements: 'redação' } },
  ];
  const ensaios = [{ id: 'e1', application_id: 'ap1' }];

  const achou = sugestoesRedacaoDaMensagem('vou citar Yale, Stanford e Harvard', aplicacoes, ensaios);
  assert.deepEqual(achou.map((s) => s.id), ['ap3']);
});

test('sugestoesRedacaoDaMensagem: mensagem vazia ou nome curto demais não explodem', () => {
  assert.deepEqual(sugestoesRedacaoDaMensagem('', [], []), []);
  assert.deepEqual(sugestoesRedacaoDaMensagem(null, [], []), []);
  // nome < 2 letras normalizadas nunca casa
  const umaLetra = [{ id: 'ap1', university: 'A', details: { requirements: 'redação' } }];
  assert.deepEqual(sugestoesRedacaoDaMensagem('estou na A e quero aplicar', umaLetra, []), []);
});
