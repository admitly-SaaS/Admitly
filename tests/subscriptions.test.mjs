// Testes de lib/subscriptions.js — a regra "tem assinatura ativa?".
// O caso de DUAS linhas é o bug real: o guard antigo (maybeSingle) devolvia erro
// e o app trancava quem pagou. Runner: node --test (nativo).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { temAssinaturaAtiva } = await import('../lib/subscriptions.js');

// Client mínimo: registra a cadeia usada e devolve o que o teste pedir no limit().
function mockClient({ data = [], error = null } = {}) {
  const chamadas = [];
  const chain = {
    select(colunas) {
      chamadas.push(['select', colunas]);
      return chain;
    },
    eq(coluna, valor) {
      chamadas.push(['eq', coluna, valor]);
      return chain;
    },
    async limit(quantidade) {
      chamadas.push(['limit', quantidade]);
      return { data, error };
    },
  };
  return {
    client: {
      from(tabela) {
        chamadas.push(['from', tabela]);
        return chain;
      },
    },
    chamadas,
  };
}

test('sem linhas → sem assinatura', async () => {
  const { client } = mockClient({ data: [] });
  assert.equal(await temAssinaturaAtiva(client, 'u1'), false);
});

test('uma linha ativa → assinatura válida', async () => {
  const { client } = mockClient({ data: [{ status: 'active' }] });
  assert.equal(await temAssinaturaAtiva(client, 'u1'), true);
});

test('DUAS linhas ativas (pagamento duplicado) → continua valendo', async () => {
  const { client } = mockClient({ data: [{ status: 'active' }, { status: 'active' }] });
  assert.equal(
    await temAssinaturaAtiva(client, 'u1'),
    true,
    'duplicata no banco não pode trancar quem pagou'
  );
});

test('a consulta filtra pelo aluno, pelo status ativo e limita a 1 linha', async () => {
  const { client, chamadas } = mockClient({ data: [{ status: 'active' }] });
  await temAssinaturaAtiva(client, 'aluno-42');

  assert.deepEqual(chamadas[0], ['from', 'subscriptions']);
  assert.deepEqual(chamadas[1], ['select', 'status']);
  assert.deepEqual(chamadas[2], ['eq', 'user_id', 'aluno-42']);
  assert.deepEqual(chamadas[3], ['eq', 'status', 'active']);
  assert.deepEqual(chamadas[4], ['limit', 1]);
});

test('erro do banco → nega o acesso sem lançar exceção', async () => {
  const { client } = mockClient({ data: null, error: { message: 'boom' } });
  assert.equal(await temAssinaturaAtiva(client, 'u1'), false);
});

test('sem usuário ou sem client → nega sem chamar o banco', async () => {
  const { client, chamadas } = mockClient({ data: [{ status: 'active' }] });
  assert.equal(await temAssinaturaAtiva(client, null), false);
  assert.equal(await temAssinaturaAtiva(null, 'u1'), false);
  assert.equal(chamadas.length, 0, 'não deve consultar o banco sem usuário');
});
