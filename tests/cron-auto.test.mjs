import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { intervaloAlvo, deveRodarAgora, JOBS } = require('../lib/cron-auto.js');

// Fábrica em horário BRT (UTC-3): new Date BRT→UTC.
function brt(ano, mes, dia, hora, min = 0) {
  return new Date(Date.UTC(ano, mes - 1, dia, hora + 3, min)); // BRT = UTC-3
}

// ---- âncoras ----------------------------------------------------------------

test('digest: alvo é segunda 9h BRT — terça e quarta não são o alvo da semana', () => {
  const segunda = intervaloAlvo(JOBS.digest, brt(2026, 10, 12, 9, 30));
  const terca = intervaloAlvo(JOBS.digest, brt(2026, 10, 13, 9, 30));
  assert.equal(segunda.inicioArred, terca.inicioArred); // mesma semana
  assert.equal(segunda.intervaloMin, 60);
});

test('digest: alvo é a MESMA segunda tanto 9h quanto 9h59 de BRT', () => {
  const t1 = intervaloAlvo(JOBS.digest, brt(2026, 10, 12, 9, 0));
  const t2 = intervaloAlvo(JOBS.digest, brt(2026, 10, 12, 9, 59));
  assert.equal(t1.inicioArred, t2.inicioArred);
});

test('alerta: alvo diário é o slot da 8h BRT do dia corrente', () => {
  const t1 = intervaloAlvo(JOBS.alerta, brt(2026, 10, 13, 8, 15));
  const t2 = intervaloAlvo(JOBS.alerta, brt(2026, 10, 13, 8, 59));
  const t3 = intervaloAlvo(JOBS.alerta, brt(2026, 10, 13, 7, 59));
  // 8:15 e 8:59 caem no mesmo slot; 7:59 também aponta para o slot de 8h do dia
  // (o alvo é por dia — o tick de 7:59 simplesmente não executa, pois fora da janela).
  assert.equal(t1.inicioArred, t2.inicioArred);
  assert.equal(t3.inicioArred, t1.inicioArred);
});

// ---- idempotência ----------------------------------------------------------------

test('deveRodarAgora: dentro do slot-alvo ainda não atendido → sim; já atendido → não', () => {
  const agora = brt(2026, 10, 12, 9, 30); // segunda 9:30 BRT
  // Nunca rodou: roda.
  assert.equal(deveRodarAgora(JOBS.digest, agora, null), true);
  // Rodou às 9:10 do MESMO slot: não roda de novo (anti-dobro).
  assert.equal(deveRodarAgora(JOBS.digest, agora, brt(2026, 10, 12, 9, 10).toISOString()), false);
  // Rodou 8:59 (fora do slot, hora cedo): o slot de 9h ainda não foi atendido → roda.
  assert.equal(deveRodarAgora(JOBS.digest, agora, brt(2026, 10, 12, 8, 59).toISOString()), true);
  // Rodou semana passada: roda.
  assert.equal(deveRodarAgora(JOBS.digest, agora, brt(2026, 10, 5, 9, 10).toISOString()), true);
});

test('deveRodarAgora: fora do slot-alvo o tick não dispara (mesmo sem rodada alguma)', () => {
  // Digest na quarta 15:00 BRT: o alvo é a SEGUNDA 9h, não este minuto.
  const quarta = brt(2026, 10, 14, 15, 0);
  const antes = brt(2026, 10, 12, 9, 10);
  // Se a rodada da última segunda existe (dentro do slot daquela segunda),
  // na quarta o alvo atual é a MESMA segunda (semana em curso) → já atendido.
  assert.equal(deveRodarAgora(JOBS.digest, quarta, antes.toISOString()), false);
  // Se NUNCA rodou, o slot da semana em curso segue pendente → na quarta roda (atrasado).
  assert.equal(deveRodarAgora(JOBS.digest, quarta, null), true);
});

test('deveRodarAgora: alerta diário — tick às 8:15 após rodada de ontem 8:20 → roda', () => {
  const hoje = brt(2026, 10, 13, 8, 15);
  const ontem = brt(2026, 10, 12, 8, 20);
  assert.equal(deveRodarAgora(JOBS.alerta, hoje, ontem.toISOString()), true);
  // e depois de rodar hoje às 8:05, não roda de novo às 8:15 nem às 8:59.
  const hojeCedo = brt(2026, 10, 13, 8, 5);
  assert.equal(deveRodarAgora(JOBS.alerta, brt(2026, 10, 13, 8, 15), hojeCedo.toISOString()), false);
  assert.equal(deveRodarAgora(JOBS.alerta, brt(2026, 10, 13, 8, 59), hojeCedo.toISOString()), false);
  // mas às 9:01 (fora do slot de 8h) também não é alvo.
  assert.equal(deveRodarAgora(JOBS.alerta, brt(2026, 10, 13, 9, 1), hojeCedo.toISOString()), false);
});
