import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  inicioSemana,
  calcularStreak,
  linhaStreak,
  prontidao,
  gerarMissoes,
  proximoPrazo,
} = require('../lib/atividade.js');

// ---- âncora de semana -----------------------------------------------------

test('inicioSemana: âncora é sempre segunda-feira 00:00', () => {
  // Sábado 2026-10-10 → segunda 2026-10-05; domingo 2026-10-11 → mesma segunda.
  const sabado = inicioSemana(new Date(2026, 9, 10));
  const domingo = inicioSemana(new Date(2026, 9, 11));
  const segunda = inicioSemana(new Date(2026, 9, 5));
  assert.equal(sabado.getDate(), 5);
  assert.equal(sabado.getMonth(), 9);
  assert.deepEqual(sabado, segunda);
  assert.deepEqual(domingo, segunda);
});

// ---- streak ---------------------------------------------------------------


test('calcularStreak: semana atual com ação e duas anteriores em sequência → 3', () => {
  // Datas fixas: quarta 14/10/2026; semanas começam na segunda.
  const agora = new Date(2026, 9, 14); // quarta
  const acoes = [new Date(2026, 9, 14), new Date(2026, 9, 7), new Date(2026, 8, 30)]; // 3ª dessa semana, 3ª da passada, 4ª da antepenúltima
  const s = calcularStreak(acoes, agora);
  assert.equal(s.semanas, 3);
  assert.equal(s.emRisco, false);
  assert.equal(s.semanaAtualComAcao, true);
});

test('calcularStreak: semana atual sem ação → corrida conta da passada e fica em risco', () => {
  const agora = new Date(2026, 9, 14);
  const acoes = [new Date(2026, 9, 7), new Date(2026, 8, 30)];
  const s = calcularStreak(acoes, agora);
  assert.equal(s.semanas, 2);
  assert.equal(s.emRisco, true);
  assert.equal(s.semanaAtualComAcao, false);
});

test('calcularStreak: lacuna de duas semanas no meio interrompe a contagem', () => {
  const agora = new Date(2026, 9, 14);
  const acoes = [new Date(2026, 9, 14), new Date(2026, 8, 24)]; // esta semana + duas semanas atrás
  const s = calcularStreak(acoes, agora);
  assert.equal(s.semanas, 1);
});

test('calcularStreak: sem ações nenhuma → zero e frase de primeiro passo', () => {
  const s = calcularStreak([]);
  assert.equal(s.semanas, 0);
  assert.equal(s.emRisco, false);
  assert.match(linhaStreak(s), /primeira semana começa/i);
});

test('linhaStreak: datas inválidas são ignoradas, não derrubam a conta', () => {
  const s = calcularStreak(['não é data', new Date(2026, 9, 14)], new Date(2026, 9, 14));
  assert.equal(s.semanas, 1);
});

test('linhaStreak: em risco encoraja, sem risco celebra', () => {
  assert.match(linhaStreak({ semanas: 2, emRisco: true }), /2 semanas|esta semana ainda não começou/);
  assert.match(linhaStreak({ semanas: 2, emRisco: false }), /2 semanas seguidas cuidando/);
});

// ---- prontidão --------------------------------------------------------------

const FORM_OK = {
  objetivo: 'graduacao', idade: '17', anoEscolar: '3º ano', areaInteresse: 'física',
  notas: 'média 8.5', atividades: 'olimpíadas', orcamento: 'X', paisPreferencia: 'EUA', nivelIngles: 'avançado',
};

test('prontidão: perfil completo + candidatura ativa sem tarefas = 20 + 25', () => {
  const p = prontidao({ formulario: FORM_OK, aplicacoes: [{ id: 'a', status: 'em andamento' }], tarefas: [], ensaios: [], atividades: [] });
  assert.equal(p.componentes.find((c) => c.chave === 'perfil').ganho, 20);
  assert.equal(p.componentes.find((c) => c.chave === 'candidaturas').ganho, 25); // clemência: sem tarefas, checklist não é cobrado
  assert.equal(p.score, 45);
});

test('prontidão: checklist 50% reduz a dimensão proporcionalmente', () => {
  const p = prontidao({
    formulario: FORM_OK,
    aplicacoes: [{ id: 'a', status: 'pesquisando' }],
    tarefas: [{ done: true }, { done: false }],
  });
  assert.equal(p.componentes.find((c) => c.chave === 'candidaturas').ganho, 18); // 10 + 8
});

test('prontidão: candidatura finalizada não conta como ativa', () => {
  const p = prontidao({ formulario: FORM_OK, aplicacoes: [{ id: 'a', status: 'enviado' }], tarefas: [] });
  assert.equal(p.componentes.find((c) => c.chave === 'candidaturas').ganho, 0);
});

test('prontidão: redações somam 10 em escrita, 25 com final', () => {
  const escrita = prontidao({ ensaios: [{ status: 'rascunho' }] });
  const final = prontidao({ ensaios: [{ status: 'final' }] });
  assert.equal(escrita.componentes.find((c) => c.chave === 'redacoes').ganho, 10);
  assert.equal(final.componentes.find((c) => c.chave === 'redacoes').ganho, 25);
});

test('prontidão: atividades 20 base, 30 com três prontas', () => {
  const base = prontidao({ atividades: [{ status: 'em_curso' }] });
  const pronta = prontidao({ atividades: [{ status: 'listagem_pronta' }, { status: 'em_curso' }, { status: 'enviada' }] });
  const cheio = prontidao({ atividades: [{ status: 'listagem_pronta' }, { status: 'usada_em_redacao' }, { status: 'enviada' }, { status: 'em_curso' }] });
  assert.equal(base.componentes.find((c) => c.chave === 'atividades').ganho, 10);
  assert.equal(pronta.componentes.find((c) => c.chave === 'atividades').ganho, 20);
  assert.equal(cheio.componentes.find((c) => c.chave === 'atividades').ganho, 30);
});

test('prontidão: perfil em branco = 20 < total; componentes posson nota legível', () => {
  const p = prontidao({});
  assert.equal(p.score, 0);
  assert.match(p.componentes.find((c) => c.chave === 'perfil').nota, /9 campos/);
});

// ---- missões ----------------------------------------------------------------

test('missões: perfil vazio entra como missão nº 1 com contagem de campos', () => {
  const m = gerarMissoes({});
  assert.equal(m[0].id, 'perfil');
  assert.match(m[0].detalhe, /9 campos/);
  assert.equal(m[0].done, false);
});

test('missões: candidatura com pendências vira missão do checklist', () => {
  const m = gerarMissoes({
    formulario: FORM_OK,
    aplicacoes: [{ id: 'a1', university: 'Yale', status: 'pesquisando' }],
    tarefas: [
      { application_id: 'a1', done: false },
      { application_id: 'a1', done: false },
      { application_id: 'a1', done: true },
    ],
  });
  const checklist = m.find((x) => x.id === 'checklist');
  assert.ok(checklist);
  assert.match(checklist.titulo, /Yale/);
  assert.match(checklist.detalhe, /2 tarefas/);
});

// tarefas órfãs (application_id nulo) não viram missão:
test('missões: tarefa sem candidatura (application_id nulo) é ignorada', () => {
  const m = gerarMissoes({
    formulario: FORM_OK,
    aplicacoes: [{ id: 'a1', university: 'Yale', status: 'pesquisando' }],
    tarefas: [{ application_id: null, done: false }],
  });
  assert.equal(m.find((x) => x.id === 'checklist'), undefined);
});

test('missões: checklist completo não vira missão; perfil completo + sem candidatura = radar', () => {
  const m = gerarMissoes({
    formulario: FORM_OK,
    aplicacoes: [],
    tarefas: [{ application_id: 'a1', done: true }],
  });
  assert.equal(m.find((x) => x.id === 'checklist'), undefined);
  assert.equal(m.find((x) => x.id === 'radar')?.href, '/oportunidades');
});

test('missões: redação não-final e atividade em_curso entram com títulos reais', () => {
  const m = gerarMissoes({
    formulario: FORM_OK,
    aplicacoes: [{ id: 'a1', university: 'Yale', status: 'pesquisando' }],
    tarefas: [],
    ensaios: [{ title: 'Por que Yale', status: 'rascunho' }],
    atividades: [{ nome: 'Robótica', status: 'em_curso' }],
  });
  const red = m.find((x) => x.id === 'redacao');
  const atv = m.find((x) => x.id === 'atividade');
  assert.match(red.titulo, /Por que Yale/);
  assert.match(atv.titulo, /Robótica/);
});

test('missões: no máximo 3 saem, prioridade em cima', () => {
  const m = gerarMissoes({
    aplicacoes: [],
    tarefas: [],
    ensaios: [{ title: 'X', status: 'ideia' }],
    atividades: [{ nome: 'Y', status: 'em_curso' }],
  });
  assert.equal(m.length, 3);
  assert.deepEqual(m.map((x) => x.id), ['perfil', 'redacao', 'atividade']);
});

// ---- próximo prazo ------------------------------------------------------------

test('proximoPrazo: candidatura ativa mais urgente, finalizada não conta', () => {
  const alvo = new Date();
  alvo.setDate(alvo.getDate() + 5);
  const dataCerta = `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`;
  const futuro = new Date();
  futuro.setDate(futuro.getDate() + 20);
  const dataLongo = `${futuro.getFullYear()}-${String(futuro.getMonth() + 1).padStart(2, '0')}-${String(futuro.getDate()).padStart(2, '0')}`;

  const p = proximoPrazo([
    { university: 'Yale', status: 'enviado', deadline: dataCerta },
    { university: 'Stanford', status: 'pesquisando', deadline: dataLongo },
    { university: 'MIT', status: 'em andamento', deadline: dataCerta },
  ]);
  assert.equal(p.nome, 'MIT');
  assert.equal(p.dias, 5);
  assert.match(p.data, /2026|2027/);
});
