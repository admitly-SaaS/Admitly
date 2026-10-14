// Testes de lib/sync-favoritos.js — sincronização via Supabase Realtime.
// Runner: node --test (nativo). Falso cliente cobre o contrato
// channel/.on/subscribe/removeChannel sem rede.
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { sincronizarFavoritos, _tratarEvento } = require('../lib/sync-favoritos.js');

// Falso cliente: guarda o handler registrado para disparar eventos de teste.
function clienteFalso() {
  const estado = { filtroTabela: null, filtroEvento: null, filtroColuna: null, handler: null, removidos: 0, inscritos: 0 };
  return {
    estado,
    channel() {
      const canal = {
        on(tipo, filtro, handler) {
          estado.filtroTabela = filtro.table;
          estado.filtroEvento = filtro.event;
          estado.filtroColuna = filtro.filter;
          estado.handler = handler;
          return canal;
        },
        subscribe(cb) {
          estado.inscritos++;
          // dispara callback de status sem erro (idem supabase-js)
          cb?.('SUBSCRIBED');
          return canal;
        },
      };
      return canal;
    },
    removeChannel() {
      estado.removidos++;
    },
  };
}

test('sincronizarFavoritos: inscreve canal corretamente com nome e filtro por usuário', () => {
  const cliente = clienteFalso();
  const desinscrever = sincronizarFavoritos(cliente, 'u1', () => {});
  assert.equal(typeof desinscrever, 'function');
  assert.equal(cliente.estado.filtroTabela, 'favorites');
  assert.equal(cliente.estado.filtroEvento, '*');
  assert.equal(cliente.estado.filtroColuna, 'user_id=eq.u1');
  assert.ok(cliente.estado.inscritos === 1);
});

test('sincronizarFavoritos: INSERT dispara aoMudar(id, true)', () => {
  const cliente = clienteFalso();
  const eventos = [];
  sincronizarFavoritos(cliente, 'u1', (id, salvo) => eventos.push({ id, salvo }));
  cliente.estado.handler({ eventType: 'INSERT', new: { opportunity_id: 'o1', user_id: 'u1' }, old: {} });
  assert.deepEqual(eventos, [{ id: 'o1', salvo: true }]);
});

test('sincronizarFavoritos: DELETE dispara aoMudar(id, false)', () => {
  const cliente = clienteFalso();
  const eventos = [];
  sincronizarFavoritos(cliente, 'u1', (id, salvo) => eventos.push({ id, salvo }));
  cliente.estado.handler({ eventType: 'DELETE', old: { opportunity_id: 'o2' }, new: {} });
  assert.deepEqual(eventos, [{ id: 'o2', salvo: false }]);
});

test('sincronizarFavoritos: UPDATE tratado como INSERT (idempotente no Set)', () => {
  const cliente = clienteFalso();
  const eventos = [];
  sincronizarFavoritos(cliente, 'u1', (id, salvo) => eventos.push({ id, salvo }));
  cliente.estado.handler({ eventType: 'UPDATE', new: { opportunity_id: 'o3' }, old: { opportunity_id: 'o3' } });
  assert.deepEqual(eventos, [{ id: 'o3', salvo: true }]);
});

test('sincronizarFavoritos: ids numéricos do banco viram string (match com Set)', () => {
  const cliente = clienteFalso();
  const eventos = [];
  sincronizarFavoritos(cliente, 'u1', (id, salvo) => eventos.push({ id, salvo }));
  cliente.estado.handler({ eventType: 'INSERT', new: { opportunity_id: 42 } });
  assert.deepEqual(eventos, [{ id: '42', salvo: true }]);
});

test('sincronizarFavoritos: payload sem id não dispara callback', () => {
  const cliente = clienteFalso();
  const eventos = [];
  sincronizarFavoritos(cliente, 'u1', (id, salvo) => eventos.push({ id, salvo }));
  cliente.estado.handler({ eventType: 'INSERT', new: null });
  assert.equal(eventos.length, 0);
});

test('sincronizarFavoritos: desinscrever remove canal e é idempotente', () => {
  const cliente = clienteFalso();
  const desinscrever = sincronizarFavoritos(cliente, 'u1', () => {});
  desinscrever();
  desinscrever();
  desinscrever();
  assert.equal(cliente.estado.removidos, 1, 'removeChannel uma vez só');
});

test('sincronizarFavoritos: sem cliente, sem user ou sem callback → noop gracioso', () => {
  const a = sincronizarFavoritos(null, 'u1', () => {});
  const b = sincronizarFavoritos(clienteFalso(), null, () => {});
  const c = sincronizarFavoritos(clienteFalso(), 'u1', 'não é função');
  [a, b, c].forEach((fn) => assert.equal(typeof fn, 'function'));
});

test('_tratarEvento: eventType desconhecido retorna null (não dispara)', () => {
  assert.equal(_tratarEvento({ eventType: 'MISTÉRIO' }), null);
});
