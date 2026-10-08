// Testes de lib/prazos.js — o vocabulário de prazo da interface (v3).
// Runner: node --test (nativo, sem dependências novas).
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { paraData, diasAte, prazoStatus, formatarData } = require('../lib/prazos.js');

function dataNoFuturo(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

test('data pura é lida no fuso local (sem o dia anterior)', () => {
  const d = paraData('2026-02-02');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 1);
  assert.equal(d.getDate(), 2, 'data pura não pode deslocar um dia para trás');
});

test('formatarData mostra o dia escrito no banco e o mês em caixa alta', () => {
  assert.equal(formatarData('2026-02-02'), '02 FEV 2026');
  assert.equal(formatarData('2026-10-14'), '14 OUT 2026');
  assert.equal(formatarData(null), null);
  assert.equal(formatarData('não é data'), null);
});

test('diasAte conta dias inteiros a partir de hoje', () => {
  assert.equal(diasAte(dataNoFuturo(0)), 0);
  assert.equal(diasAte(dataNoFuturo(1)), 1);
  assert.equal(diasAte(dataNoFuturo(14)), 14);
  assert.ok(diasAte('2000-01-01') < 0, 'data passada dá dias negativos');
  assert.equal(diasAte(null), null);
  assert.equal(diasAte('data inválida'), null);
});

test('prazoStatus: sem data, encerrada, hoje, amanhã, urgente, agendada e aberta', () => {
  const semData = prazoStatus({ application_deadline: null });
  assert.equal(semData.tipo, 'sem-data');
  assert.equal(semData.dot, 'dot--tinta');
  assert.equal(semData.data, null);

  const encerrada = prazoStatus({ application_deadline: '2000-01-01' });
  assert.equal(encerrada.tipo, 'encerrada');
  assert.equal(encerrada.dot, 'dot--tinta');
  assert.match(encerrada.rotuloMono, /^ENCERRADA EM \d{2} [A-Z]{3} \d{4}$/);

  const hoje = prazoStatus({ application_deadline: dataNoFuturo(0) });
  assert.equal(hoje.tipo, 'urgente');
  assert.equal(hoje.rotulo, 'Fecha hoje');
  assert.equal(hoje.dot, 'dot--vermelho');

  const amanha = prazoStatus({ application_deadline: dataNoFuturo(1) });
  assert.equal(amanha.tipo, 'urgente');
  assert.equal(amanha.rotulo, 'Fecha amanhã');
  assert.equal(amanha.dot, 'dot--vermelho');

  const sete = prazoStatus({ application_deadline: dataNoFuturo(7) });
  assert.equal(sete.tipo, 'urgente');
  assert.equal(sete.rotulo, 'Fecha em 7 dias');

  const quatorze = prazoStatus({ application_deadline: dataNoFuturo(14) });
  assert.equal(quatorze.tipo, 'agendada');
  assert.equal(quatorze.dot, 'dot--vazado');
  assert.equal(quatorze.dias, 14);

  const aberta = prazoStatus({ application_deadline: dataNoFuturo(60) });
  assert.equal(aberta.tipo, 'aberta');
  assert.equal(aberta.dot, 'dot--lacre');
  assert.equal(aberta.rotulo, 'Inscrições abertas');
});

test('rotuloMono do painel sempre diz "FECHA EM <data>" quando há data', () => {
  const s = prazoStatus({ application_deadline: dataNoFuturo(14) });
  assert.equal(s.rotuloMono, `FECHA EM ${formatarData(dataNoFuturo(14))}`);
  assert.match(s.rotuloMono, /^FECHA EM \d{2} [A-Z]{3} \d{4}$/);
  assert.equal(prazoStatus({ application_deadline: null }).rotuloMono, 'SEM DATA DE INSCRIÇÃO');
});

test('prazoStatus tolera objeto vazio ou nulo', () => {
  assert.equal(prazoStatus({}).tipo, 'sem-data');
  assert.equal(prazoStatus(null).tipo, 'sem-data');
  assert.equal(prazoStatus({ application_deadline: 'data inválida' }).tipo, 'sem-data');
});
