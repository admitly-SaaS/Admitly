import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  prazosProximos,
  progressoDaSemana,
  linhaProgresso,
  catalogoProximo,
  valeEnviarDigest,
  alertasDePrazo,
  alertasDeFavoritos,
  valeEnviarAlerta,
  ALVOS_ALERTA,
  STATUS_FINAIS,
  montarDigestHtml,
  montarAlertaHtml,
  fotoDaSemana,
  deltaDaSemana,
  linhaDelta,
  fraseDelta,
  notaDelta,
} = require('../lib/digest.js');
const { enviarEmail, montarEmailBase, urlDoSite } = require('../lib/email.js');

// ---- prazo relativo a HOJE (mesma técnica dos testes da lib/prazos.js) ----

function dataFutura(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- fixtures ------------------------------------------------------------

const APL = (status, dias, nome = 'Yale University', id = 'ap1') =>
  dias == null
    ? { id, university: nome, status, deadline: null }
    : { id, university: nome, status, deadline: dataFutura(dias) };

const ESSAY = (status) => ({ id: Math.random().toString(), status });
const ATIV = (status) => ({ id: Math.random().toString(), status });

// ---- prazosProximos --------------------------------------------------------

test('prazosProximos: candidatura ativa a 7 dias entra, finalizada não', () => {
  const lista = prazosProximos([APL('em andamento', 7), APL('enviado', 1)]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].university, 'Yale University');
  assert.equal(lista[0].dias, 7);
  assert.match(lista[0].data, /\d{2} [A-Z]{3} \d{4}/);
});

test('prazosProximos: janela padrão corta prazo a 21 dias e aceita hoje (0)', () => {
  const lista = prazosProximos([APL('pesquisando', 21, 'Longe'), APL('pesquisando', 0, 'Hoje')]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].university, 'Hoje');
  const estendida = prazosProximos([APL('pesquisando', 21, 'Longe')], { limiteDias: 21 });
  assert.equal(estendida.length, 1);
});

test('prazosProximos: prazo expirado e sem deadline não entram', () => {
  const lista = prazosProximos([APL('em andamento', -1, 'Passou'), APL('em andamento', null, 'Sem data')]);
  assert.equal(lista.length, 0);
});

test('prazosProximos: ordena por urgência quando há vários', () => {
  const lista = prazosProximos([APL('pesquisando', 10, 'B'), APL('em andamento', 2, 'A')]);
  assert.deepEqual(lista.map((p) => p.university), ['A', 'B']);
});

// ---- progressoDaSemana ------------------------------------------------------

test('progressoDaSemana: conta candidaturas ativas, checklist e redações por status', () => {
  const p = progressoDaSemana({
    aplicacoes: [APL('pesquisando', 5), APL('enviado', null)],
    tarefas: [{ id: 't1', done: true }, { id: 't2', done: false }, { id: 't3', done: true }, { id: 't4', done: false }],
    ensaios: [ESSAY('final'), ESSAY('rascunho'), ESSAY('final')],
    atividades: [ATIV('em_curso'), ATIV('listagem_pronta')],
  });
  assert.equal(p.candidaturas.ativas, 1);
  assert.equal(p.candidaturas.total, 2);
  assert.equal(p.checklist.pct, 50);
  assert.equal(p.redacoes.total, 3);
  assert.equal(p.redacoes.final, 2);
  assert.equal(p.atividades.listagemPronta, 1);
});

test('progressoDaSemana: checklist sem tarefas é null (sem percentual falso)', () => {
  const p = progressoDaSemana({ aplicacoes: [APL('pesquisando', 5)] });
  assert.equal(p.checklist, null);
});

test('linhaProgresso: junta os números numa frase legível', () => {
  const texto = linhaProgresso(
    progressoDaSemana({
      aplicacoes: [APL('em andamento', 3), APL('enviado', null)],
      tarefas: [{ done: true }, { done: true }, { done: false }, { done: false }],
      ensaios: [ESSAY('final'), ESSAY('final')],
      atividades: [ATIV('listagem_pronta')],
    })
  );
  assert.match(texto, /1 candidatura em andamento/);
  assert.match(texto, /checklist 50% \(2\/4\)/);
  assert.match(texto, /2 redações, 2 final/);
  assert.match(texto, /1 atividade/);
});

// ---- catalogoProximo ---------------------------------------------------------

test('catalogoProximo: só oportunidades com prazo na janela e não favoritadas, limitado', () => {
  const opps = [
    { id: 1, name: 'W', type: 'university', application_deadline: dataFutura(5) },
    { id: 2, name: 'X', type: 'program', application_deadline: dataFutura(40) }, // fora da janela
    { id: 3, name: 'Y', type: 'university', application_deadline: dataFutura(10) },
    { id: 4, name: 'Z', type: 'university', application_deadline: dataFutura(2) }, // favoritada
  ];
  const lista = catalogoProximo(opps, [4, 3]); // 3 favoritada também: só W sobra
  assert.deepEqual(lista.map((o) => o.name), ['W']);

  const semFavorito = catalogoProximo(opps, [4]);
  assert.deepEqual(semFavorito.map((o) => o.name), ['W', 'Y']);
});

// ---- decisão de envio ---------------------------------------------------------

test('valeEnviarDigest: suprime quando não há prazos, progresso nem catálogo', () => {
  assert.equal(valeEnviarDigest({ prazos: [], progresso: progressoDaSemana({}), catalogo: [] }), false);
  const comTarefas = valeEnviarDigest({
    prazos: [],
    progresso: progressoDaSemana({ aplicacoes: [APL('pesquisando', 5)] }),
    catalogo: [],
  });
  assert.equal(comTarefas, true);
  assert.equal(
    valeEnviarDigest({ prazos: [], progresso: progressoDaSemana({}), catalogo: [{ id: 1, name: 'X', dias: 5, data: null, tipo: '' }] }),
    true
  );
});

test('ALVOS_ALERTA são 7 e 2, e STATUS_FINAIS é a régua da aba /aplicacoes', () => {
  assert.deepEqual(ALVOS_ALERTA, [7, 2]);
  assert.deepEqual([...STATUS_FINAIS].sort(), ['aceito', 'enviado', 'recusado']);
});

// ---- alertasDePrazo -------------------------------------------------------------

test('alertasDePrazo: dispara exatamente em D-7 e D-2, para candidaturas ativas', () => {
  const lista = alertasDePrazo([
    APL('em andamento', 7, 'A', 'a1'),
    APL('em andamento', 2, 'B', 'a2'),
    APL('em andamento', 3, 'C', 'a3'),
    APL('enviado', 1, 'D', 'a4'),
  ]);
  assert.deepEqual(
    lista.map((a) => [a.university, a.dias]),
    [
      ['B', 2],
      ['A', 7],
    ]
  );
  assert.ok(lista[0].link.length > 0);
});

test('alertasDePrazo: D-0/D-1/D-3 fora dos alvos não dispara (cobre D-7 e D-2 do cron diário)', () => {
  const zero = alertasDePrazo([APL('pesquisando', 0)], { alvos: [7, 2] });
  assert.equal(zero.length, 0);
  const tres = alertasDePrazo([APL('pesquisando', 3)], { alvos: [7, 2] });
  assert.equal(tres.length, 0);
});

test('valeEnviarAlerta: lista vazia não envia', () => {
  assert.equal(valeEnviarAlerta([]), false);
  assert.equal(valeEnviarAlerta([{ application_id: 'a' }]), true);
});

// ---- foto/Δ da semana ----------------------------------------------------------

test('Δ da semana: primeira semana (sem foto) é null — digest sai sem comparação', () => {
  const fotoHoje = fotoDaSemana(progressoDaSemana({
    tarefas: [{ done: true }, { done: false }],
    ensaios: [ESSAY('final')],
  }));
  assert.deepEqual(fotoHoje, {
    tarefasFeitas: 1,
    tarefasTotal: 2,
    candidaturasAtivas: 0,
    redacoesFinal: 1,
    redacoesTotal: 1,
    atividadesProntas: 0,
  });
  assert.equal(deltaDaSemana(null, fotoHoje), null, 'sem foto anterior não há delta (nada inventado)');
  assert.equal(deltaDaSemana('lixo', fotoHoje), null, 'foto quebrada também é sem comparação');
  assert.equal(linhaDelta(null), '');
});

test('Δ da semana: avanço real conta tarefas/redações; nada mudou é linha vazia', () => {
  const fotoAntes = fotoDaSemana(progressoDaSemana({ tarefas: [{ done: false }, { done: false }, { done: false }] }));
  const fotoDepois = fotoDaSemana(progressoDaSemana({ tarefas: [{ done: true }, { done: true }, { done: false }] }));
  const delta = deltaDaSemana(fotoAntes, fotoDepois);
  assert.equal(delta.tarefasFeitas, 2);
  assert.equal(delta.candidaturasAtivas, 0);
  assert.match(linhaDelta(delta), /\+2 tarefas feitas/);
  assert.match(fraseDelta(delta), /Você avançou 2 tarefas desde a última segunda/, 'frase natural no título do item');

  // Sem mudança: o digest NÃO mostra “+0” — a linha nem entra no e-mail.
  assert.equal(linhaDelta(deltaDaSemana(fotoAntes, fotoAntes)), '');
});

test('Δ da semana: recuo é real e legível (aluno apagou não inventa “+”)', () => {
  const fotoAntes = fotoDaSemana(progressoDaSemana({ tarefas: [{ done: true }, { done: true }] }));
  const delta = deltaDaSemana(fotoAntes, fotoDaSemana(progressoDaSemana({ tarefas: [{ done: true }] })));
  assert.equal(delta.tarefasFeitas, -1);
  assert.match(linhaDelta(delta), /-1 tarefa feita/);
  assert.match(fraseDelta(delta), /Você recuou 1 tarefa desde a última segunda/, 'recuo honesto, sem “ avanço” de marketing');
});

test('Δ da semana: sem tarefa no delta, o título cai para o texto cru (e a nota segue)', () => {
  const delta = deltaDaSemana(
    fotoDaSemana(progressoDaSemana({})),
    fotoDaSemana(progressoDaSemana({ ensaios: [ESSAY('final')] }))
  );
  assert.equal(delta.tarefasFeitas, 0);
  assert.equal(fraseDelta(delta), null, 'sem tarefa não há frase de avanço');
  const linha = linhaDelta(delta);
  assert.match(linha, /\+1 redação final/);
  const html = montarDigestHtml({ progresso: progressoDaSemana({ ensaios: [ESSAY('final')] }), delta });
  assert.match(html, /\+1 redação final/);
  assert.match(notaDelta(delta), /A comparação é com o mesmo resumo de uma semana atrás/);
});

test('Δ da semana: entra no HTML só quando há mudança, com rótulo próprio', () => {
  const delta = deltaDaSemana(
    fotoDaSemana(progressoDaSemana({})),
    fotoDaSemana(progressoDaSemana({ tarefas: [{ done: true }, { done: true }, { done: false }] }))
  );
  const html = montarDigestHtml({ progresso: progressoDaSemana({ tarefas: [{ done: true }, { done: false }] }), delta });
  assert.match(html, /DESDE A ÚLTIMA/);
  assert.match(html, /Você avançou 2 tarefas desde a última segunda/);

  // primeira semana (delta null): a seção fica só com a foto, sem inventar
  const htmlSem = montarDigestHtml({ progresso: progressoDaSemana({ tarefas: [{ done: true }] }), delta: null });
  assert.doesNotMatch(htmlSem, /DESDE A ÚLTIMA/);
});

test('decidirDigest repassa o Δ e a foto prontos para o cron', () => {
  const { decidirDigest } = require('../lib/digest.js');
  const dados = {
    aplicacoes: [APL('em andamento', 7)],
    tarefas: [{ done: true }, { done: false }],
    ensaios: [],
    atividades: [],
    favoritos: [],
  };
  const fotoAnterior = fotoDaSemana(progressoDaSemana({}));
  const decisao = decidirDigest(dados, [], { fotoAnterior });
  assert.equal(decisao.delta.tarefasFeitas, 1);
  assert.equal(decisao.fotoHoje.tarefasFeitas, 1);
  assert.equal(decisao.vale, true, 'com Δ real e prazo, vale enviar');
});

// ---- alertasDeFavoritos ---------------------------------------------------------

const OPP = (id, dias, nome = 'Programa X') =>
  dias == null
    ? { id, name: nome, type: 'program', application_deadline: null }
    : { id, name: nome, type: 'program', application_deadline: dataFutura(dias) };

test('alertasDeFavoritos: dispara só em D-7/D-2 e só para o que o aluno guardou', () => {
  const opps = [
    OPP(1, 7, 'D7'),
    OPP(2, 2, 'D2'),
    OPP(3, 3, 'D3 - fora'),
    OPP(4, null, 'SEM DATA'),
    OPP(5, -1, 'ENCERRADA'),
  ];
  const favoritos = [1, 2, 3, 4, 5]; // tudo favoritado; o sem alvo é o sistema que corta
  const lista = alertasDeFavoritos(opps, favoritos);
  assert.deepEqual(
    lista.map((a) => [a.university, a.dias]),
    [
      ['D2', 2],
      ['D7', 7],
    ]
  );
  assert.match(lista[0].link, /\/oportunidades$/, 'favorito aponta para o radar, não para aplicações');
});

test('alertasDeFavoritos: não favoritar = não alertar, mesmo preparado pelo cron', () => {
  const lista = alertasDeFavoritos([OPP(1, 7, 'Nunca favoritado')], []);
  assert.equal(lista.length, 0);
});

test('alertasDeFavoritos: candidatura ATIVA com mesmo nome reserva o aviso (sem e-mail duplo)', () => {
  const opps = [OPP(1, 2, 'Yale University')];
  const comReserva = alertasDeFavoritos(opps, [1], { nomesReservados: ['  Yale University '] });
  assert.equal(comReserva.length, 0, 'mesma universidade em aberto já tem alerta próprio');
  // candidatura FINALIZADA não reserva: favorito volta a receber o alerta
  const finalizadaNaoReserva = alertasDeFavoritos(opps, [1], { nomesReservados: [] });
  assert.equal(finalizadaNaoReserva.length, 1);
});

test('montarDigestHtml: prazos, progresso e catálogo viram seções com numeração', () => {
  const html = montarDigestHtml({
    primeiroNome: 'Ana',
    prazos: [{ application_id: 'a1', university: 'Yale', dias: 2, data: null, semData: false }],
    progresso: progressoDaSemana({ tarefas: [{ done: true }] }),
    catalogo: [{ id: 1, name: 'Programa X', tipo: 'program', dias: 9, data: '01 NOV 2026' }],
  });
  assert.match(html, /I · Prazos que fecham/);
  assert.match(html, /II · Sua semana/);
  assert.match(html, /III · No radar/);
  assert.match(html, /PARA ANA/);
  assert.match(html, /checklist 100% \(1\/1\)/);
  assert.match(html, /Inscrições fecham em/);
});

test('montarDigestHtml: seção vazia não é renderizada', () => {
  const html = montarDigestHtml({
    primeiroNome: null,
    prazos: [],
    progresso: progressoDaSemana({}),
    catalogo: [],
  });
  assert.doesNotMatch(html, /Prazos que fecham/);
  assert.match(html, /Seu perfil ainda está em branco/);
});

test('montarAlertaHtml: D-7 e D-2 têm tons e textos diferentes', () => {
  const calma = montarAlertaHtml({ university: 'Yale', dias: 7, data: '01 NOV 2026', application_id: 'a1', link: 'https://x' });
  const urgente = montarAlertaHtml({ university: 'Yale', dias: 2, data: '01 NOV 2026', application_id: 'a1', link: 'https://x' });
  assert.match(calma, /AGENDADO/);
  assert.match(calma, /FALTAM 7 DIAS/);
  assert.match(urgente, /PRAZO CRÍTICO/);
  assert.match(urgente, /finalize hoje\./i);
});

// ---- lib/email.js (sem rede nos testes) --------------------------------------------

test('montarEmailBase: escapa HTML malicioso no conteúdo', () => {
  const html = montarEmailBase({
    preheader: 'x',
    cartucho: 'ADMITLY',
    titulo: '<script>alert(1)</script>',
    secoes: [{ num: 'I', titulo: 'T', itens: [{ rotulo: 'R', titulo: '<img src=x onerror=alert(1)>', cor: '#fff', lado: 'L', nota: null }] }],
    rodape: 'fim',
  });
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('urlDoSite: cai para localhost e corta barra final da base', () => {
  const antes = process.env.APP_URL;
  try {
    process.env.APP_URL = 'https://admitly.com/';
    assert.equal(urlDoSite('/aplicacoes'), 'https://admitly.com/aplicacoes');
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(urlDoSite(), 'http://localhost:3000');
  } finally {
    if (antes != null) process.env.APP_URL = antes;
  }
});

test('enviarEmail: sem payload incompleto devolve erro sem chamar a rede', async () => {
  const { error } = await enviarEmail({});
  assert.match(error.message, /incompleto/);
});

test('enviarEmail: sem chave desiste cedo', async () => {
  const antes = process.env.RESEND_API_KEY;
  try {
    delete process.env.RESEND_API_KEY;
    const { error } = await enviarEmail({ to: 'a@b.c', subject: 's', html: '<p>h</p>' });
    assert.match(error.message, /RESEND_API_KEY ausente/);
  } finally {
    process.env.RESEND_API_KEY = antes;
  }
});
