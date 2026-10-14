// Testes de lib/radar.js — o diff da última visita.
// Runner: node --test (nativo, sem dependências novas).
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { carregarSnapshot, salvarSnapshot, calcularRadar, porquesDoMatching } = require('../lib/radar.js');

// storage falso (o Radar só precisa de getItem/setItem tolerantes)
function storageFalso() {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, v),
  };
}

function dataFutura(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const OPP_A = { id: 'a', name: 'Alpha Program', application_deadline: dataFutura(30) };
const OPP_B = { id: 'b', name: 'Beta Scholarship', application_deadline: dataFutura(10) };

test('salvarSnapshot grava id → prazo e carregarSnapshot devolve o mesmo estado', () => {
  const storage = storageFalso();
  salvarSnapshot(storage, [OPP_A, OPP_B], new Date('2026-10-08T12:00:00Z'));

  const lido = carregarSnapshot(storage);
  assert.equal(lido.vistos['a'], OPP_A.application_deadline);
  assert.equal(lido.vistos['b'], OPP_B.application_deadline);
  assert.equal(lido.em, '2026-10-08T12:00:00.000Z');
});

test('carregarSnapshot tolera storage vazio, JSON inválido e formato errado', () => {
  assert.equal(carregarSnapshot(storageFalso()), null);

  const quebrado = storageFalso();
  quebrado.setItem('admitly:radar:v1', '{não é json');
  assert.equal(carregarSnapshot(quebrado), null);

  const errado = storageFalso();
  errado.setItem('admitly:radar:v1', JSON.stringify({ foo: 1 }));
  assert.equal(carregarSnapshot(errado), null);
});

test('calcularRadar sem snapshot = primeira visita, sem itens', () => {
  const r = calcularRadar([OPP_A, OPP_B], null);
  assert.equal(r.primeiraVisita, true);
  assert.deepEqual(r.itens, []);
});

test('nenhuma mudança desde a última visita → diff vazio (sem novidade, sem aviso)', () => {
  const storage = storageFalso();
  const snap = salvarSnapshot(storage, [OPP_A, OPP_B]);
  const r = calcularRadar([OPP_A, OPP_B], snap);
  assert.equal(r.primeiraVisita, false);
  assert.deepEqual(r.itens, []);
});

test('oportunidade nova no catálogo entra como tipo "novo"', () => {
  const storage = storageFalso();
  const snap = salvarSnapshot(storage, [OPP_A]);
  const OPP_C = { id: 'c', name: 'Gamma Olympiad', application_deadline: dataFutura(5) };
  const r = calcularRadar([OPP_A, OPP_C], snap);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].tipo, 'novo');
  assert.equal(r.itens[0].opp.id, 'c');
});

test('oportunidade que sempre esteve lá mas nunca foi vista também é "novo" para o usuário', () => {
  const storage = storageFalso();
  // snapshot semeado com apenas OPP_A: OPP_B existe no catálogo mas o usuário
  // nunca a viu — para ele é novidade.
  const snap = salvarSnapshot(storage, [OPP_A]);
  const r = calcularRadar([OPP_A, OPP_B], snap);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].tipo, 'novo');
  assert.equal(r.itens[0].opp.id, 'b');
});

test('prazo que muda de data vira tipo "prazo" com a data anterior', () => {
  const storage = storageFalso();
  const snap = salvarSnapshot(storage, [OPP_A]);
  const adiado = { ...OPP_A, application_deadline: dataFutura(45) };
  const r = calcularRadar([adiado], snap);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].tipo, 'prazo');
  assert.equal(r.itens[0].antes, OPP_A.application_deadline);
  assert.equal(r.itens[0].opp.id, 'a');
});

test('favorito nunca é novidade (a decisão já foi tomada)', () => {
  const storage = storageFalso();
  const snap = salvarSnapshot(storage, [OPP_A]);
  const OPP_C = { id: 'c', name: 'Gamma', application_deadline: dataFutura(5) };
  const r = calcularRadar([OPP_A, OPP_C], snap, new Set(['c']));
  assert.deepEqual(r.itens, []);

  // e um favorito que teve o prazo adiado também não vira alerta
  const adiado = { ...OPP_A, application_deadline: dataFutura(60) };
  const r2 = calcularRadar([adiado], snap, new Set(['a']));
  assert.deepEqual(r2.itens, []);
});

test('prazo-mudado vem antes de novidade (ação imediata primeiro)', () => {
  const storage = storageFalso();
  const snap = salvarSnapshot(storage, [OPP_A, OPP_B]);
  const adiadoB = { ...OPP_B, application_deadline: dataFutura(20) };
  const OPP_C = { id: 'c', name: 'Gamma', application_deadline: dataFutura(3) };
  const r = calcularRadar([OPP_A, adiadoB, OPP_C], snap);
  assert.equal(r.itens[0].tipo, 'prazo');
  assert.equal(r.itens[0].opp.id, 'b');
  assert.equal(r.itens[1].tipo, 'novo');
});

test('porquesDoMatching extrai reasons/warnings do compatibility, com limite', () => {
  const opp = {
    compatibility: {
      reasons: ['interesse em Física', '11º ano elegível', 'orçamento cobre'],
      warnings: ['custo acima do orçamento'],
    },
  };
  assert.deepEqual(porquesDoMatching(opp, 2), ['interesse em Física', '11º ano elegível']);
  assert.deepEqual(porquesDoMatching({ compatibility: null }), []);
  assert.deepEqual(porquesDoMatching(undefined), []);
});
