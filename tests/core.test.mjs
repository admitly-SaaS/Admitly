// Testes do núcleo do Admitly.
// Runner: node --test (nativo, sem dependências novas).
// matching.js é CommonJS → acessado via createRequire.
// applications.js / favorites.js são ESM → import dinâmico.
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {
  calcularMatches,
  evaluateCompatibility,
  filterOpportunities,
  deadlineStatus,
  selectivityLabel,
  recommendationScore,
} = require('../lib/matching.js');

const { isUniversityOpportunity, createApplicationForUser, getApplicationsForUser } = await import('../lib/applications.js');
const { addFavoriteForUser, removeFavoriteForUser, listFavoritesForUser } = await import('../lib/favorites.js');

// ---------- Fábricas ----------

const PERFIL_9ANO = {
  school_year: '9th',
  area: 'Engenharia',
  budget: 'R$ 80 mil por ano',
  country_preference: 'Estados Unidos ou Europa',
  goals: 'Estudar fora',
};

const BASE_OPP = {
  name: 'Programa X',
  type: 'Summer Program',
  country: 'USA',
  location_type: 'online',
  program_cost: 3000,
  currency: 'USD',
  eligible_grades: ['9th', '10th', '11th', '12th'],
};

const opp = (over = {}) => ({ ...BASE_OPP, ...over });

function diasNoFuturo(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Mock mínimo do client Supabase: apenas a cadeia usada por applications/favorites.
function mockClient({ existente = null, insertResult = { id: 'app-1' }, insertError = null, listData = [], listError = null } = {}) {
  const calls = { from: [], select: [], eq: [], ilike: null, insert: null, deleted: false, order: null };
  const maybeSingle = async () => ({ data: existente });
  const single = async () => ({ data: insertResult, error: insertError });
  const build = (table) => {
    calls.from.push(table);
    const chain = {
      select: (cols) => { calls.select.push(cols); return chain; },
      eq: (col, val) => { calls.eq.push([col, val]); return chain; },
      ilike: (col, val) => { calls.ilike = [col, val]; return { maybeSingle }; },
      insert: (payload) => { calls.insert = payload; return { select: () => ({ single }) }; },
      delete: () => { calls.deleted = true; return chain; },
      order: (col, opts) => { calls.order = [col, opts]; return Promise.resolve({ data: listData, error: listError }); },
    };
    return chain;
  };
  return { client: { from: build }, calls };
}

// ---------- matching.js: regras de nível ----------

test('9º ano é elegível em programa 9-12 → Alta', () => {
  const r = evaluateCompatibility(opp(), PERFIL_9ANO);
  assert.equal(r.level, 'Alta');
  assert.ok(r.reasons.includes('Seu ano escolar é elegível'));
});

test('9º ano em programa só para 11º → Baixa (bloqueador de ano)', () => {
  const r = evaluateCompatibility(opp({ eligible_grades: ['11th'] }), PERFIL_9ANO);
  assert.equal(r.level, 'Baixa');
  assert.ok(r.warnings.some((w) => w.toLowerCase().includes('ano escolar')));
});

test('GPA abaixo do mínimo → Baixa', () => {
  const r = evaluateCompatibility(opp({ minimum_gpa: 3.5 }), { ...PERFIL_9ANO, gpa: 3.0 });
  assert.equal(r.level, 'Baixa');
});

test('requisitos (essay/recomendação/testes) são informativos, não rebaixam', () => {
  const r = evaluateCompatibility(
    opp({ requires_essay: true, requires_recommendation: true, requires_test: true, required_tests: ['TOEFL'] }),
    PERFIL_9ANO
  );
  assert.equal(r.level, 'Alta');
  assert.ok(r.notes.some((n) => n.startsWith('Requer:')));
});

test('orçamento "R$ 80 mil" é interpretado como 80000 (R$ 80 → custo 80000 BRL dentro)', () => {
  // Se "80 mil" fosse lido como 80, R$ 80.000 estouraria o orçamento e viraria Baixa.
  const r = evaluateCompatibility(
    opp({ program_cost: 80000, currency: 'BRL', location_type: 'presencial' }),
    PERFIL_9ANO
  );
  assert.equal(r.level, 'Alta');
  assert.ok(r.reasons.includes('Está dentro do seu orçamento aproximado'));
});

test('moeda diferente (USD vs BRL) não é comparada numericamente → sem bloqueador', () => {
  const r = evaluateCompatibility(opp({ program_cost: 99999, currency: 'USD' }), PERFIL_9ANO);
  assert.notEqual(r.level, 'Baixa');
  assert.ok(r.notes.some((n) => n.includes('USD')));
});

test('custo BRL até 1,5x acima do orçamento → Média (ressalva)', () => {
  const r = evaluateCompatibility(opp({ program_cost: 100000, currency: 'BRL', location_type: 'presencial' }), PERFIL_9ANO);
  assert.equal(r.level, 'Média');
});

test('custo BRL muito acima sem bolsa → Baixa; com bolsa integral → continua Alta', () => {
  const semBolsa = evaluateCompatibility(opp({ program_cost: 200000, currency: 'BRL', location_type: 'presencial' }), PERFIL_9ANO);
  assert.equal(semBolsa.level, 'Baixa');
  const comBolsa = evaluateCompatibility(
    opp({ program_cost: 200000, currency: 'BRL', location_type: 'presencial', full_scholarship_available: true }),
    PERFIL_9ANO
  );
  assert.equal(comBolsa.level, 'Alta');
});

test('país na preferência (USA em "Estados Unidos ou Europa") → motivo de combinação', () => {
  const r = evaluateCompatibility(opp(), PERFIL_9ANO);
  assert.ok(r.reasons.includes('Combina com sua região de interesse'));
});

test('Brasil presencial fica fora da preferência → Média; online não gera ressalva', () => {
  const presencial = evaluateCompatibility(opp({ country: 'Brasil', location_type: 'presencial' }), PERFIL_9ANO);
  assert.equal(presencial.level, 'Média');
  const online = evaluateCompatibility(opp({ country: 'Brasil', location_type: 'online' }), PERFIL_9ANO);
  assert.equal(online.level, 'Alta');
});

test('perfil vazio não gera veto (dados ausentes nunca bloqueiam)', () => {
  const r = evaluateCompatibility(opp(), {});
  assert.equal(r.level, 'Alta');
});

// ---------- matching.js: deadline, filtros e ordenação ----------

test('deadlineStatus: passada, sem data e aberta', () => {
  const passada = deadlineStatus(opp({ application_deadline: '2000-01-01' }));
  assert.equal(passada.text, 'Deadline encerrada');
  assert.equal(passada.date, undefined);

  assert.equal(deadlineStatus(opp({ application_deadline: null })).text, 'Sem data de inscrição');

  const aberta = deadlineStatus(opp({ application_deadline: diasNoFuturo(90) }));
  assert.equal(aberta.text, 'Inscrições abertas');
  assert.ok(aberta.date, 'status aberto precisa expor a data (filtro Prazo próximo depende disso)');
});

test('filtro Grátis inclui custo 0 e bolsa integral, não inclui pago só com auxílio', () => {
  const lista = [
    opp({ name: 'A', program_cost: 0 }),
    opp({ name: 'B', program_cost: 3000, full_scholarship_available: true }),
    opp({ name: 'C', program_cost: 3000, financial_aid_available: true }),
  ];
  const gratis = filterOpportunities(lista, 'Grátis', PERFIL_9ANO);
  assert.deepEqual(gratis.map((o) => o.name).sort(), ['A', 'B']);
});

test('filtro Prazo próximo só pega deadlines abertas em até 60 dias', () => {
  const lista = [
    opp({ name: 'perto', application_deadline: diasNoFuturo(14) }),
    opp({ name: 'longe', application_deadline: diasNoFuturo(90) }),
    opp({ name: 'passou', application_deadline: '2000-01-01' }),
    opp({ name: 'sem data', application_deadline: null }),
  ];
  const r = filterOpportunities(lista, 'Prazo próximo', PERFIL_9ANO);
  assert.deepEqual(r.map((o) => o.name), ['perto']);
});

test('calcularMatches ordena Alta → Média → Baixa', () => {
  const lista = [
    opp({ name: 'BAIXA-ano12', eligible_grades: ['10th', '11th'] }),
    opp({ name: 'MEDIA', country: 'Brasil', location_type: 'presencial' }),
    opp({ name: 'ALTA' }),
  ];
  const r = calcularMatches(lista, PERFIL_9ANO);
  assert.deepEqual(r.map((o) => o.name), ['ALTA', 'MEDIA', 'BAIXA-ano12']);
});

test('calcularMatches com argumentos invertidos (padrão do bug da rota) dava resultado errado', () => {
  // Documenta o bug corrigido: (perfil, oportunidades) em vez de (oportunidades, perfil).
  const lista = [opp({ name: 'X', eligible_grades: ['10th', '11th'] })];
  const errado = calcularMatches(PERFIL_9ANO, lista);
  assert.equal(errado.length, 0, 'invertido: a "lista de oportunidades" é o perfil e não passa nos filtros');
});

// ---------- matching.js: labels e scores ----------

test('selectivityLabel e recommendationScore', () => {
  assert.equal(selectivityLabel(1), 'Acessível');
  assert.equal(selectivityLabel(3), 'Competitiva');
  assert.equal(selectivityLabel(5), 'Muito concorrida');
  assert.equal(selectivityLabel(null), null);

  const leve = recommendationScore(opp({}));
  assert.equal(leve.score, 0);

  const pesado = recommendationScore(
    opp({ requires_essay: true, requires_recommendation: true, requires_test: true, required_tests: ['TOEFL'], selectivity: 5 })
  );
  // dificuldade: essay 1 + rec 1 + teste 1 + lista de testes 1 = 4; seletividade 2 → 6
  assert.equal(pesado.difficulty, 4);
  assert.equal(pesado.score, 6);
});

// ---------- applications.js ----------

test('isUniversityOpportunity: University sim, Summer Program não', () => {
  assert.equal(isUniversityOpportunity('Summer Program'), false);
  assert.equal(isUniversityOpportunity('University'), true);
  assert.equal(isUniversityOpportunity(undefined), false);
});

test('REGRESSÃO conhecida: "College Prep" NÃO é modelo universidade', () => {
  // Prep Program (Fundação Estudar) é type "College Prep": deve usar o modelo
  // "program" (custo, requisitos etc.), não "university".
  assert.equal(isUniversityOpportunity('College Prep'), false);
});

test('createApplicationForUser: prefill de details no modelo programa', async () => {
  const { client, calls } = mockClient();
  const r = await createApplicationForUser('u1', 'o1', opp({ application_deadline: '2027-01-06' }), client);

  assert.equal(r.error, null);
  assert.deepEqual(calls.insert, {
    user_id: 'u1',
    university: 'Programa X',
    status: 'pesquisando',
    deadline: '2027-01-06',
    details: {
      model: 'program',
      programType: 'Summer Program',
      location: 'USA',
      locationType: 'online',
      cost: 'USD 3000',
    },
  });
});

test('createApplicationForUser: duplicata via ilike não insere de novo', async () => {
  const { client, calls } = mockClient({ existente: { id: 'app-9' } });
  const r = await createApplicationForUser('u1', 'o1', opp(), client);

  assert.equal(r.duplicate, true);
  assert.deepEqual(r.data, { id: 'app-9' });
  assert.deepEqual(calls.ilike, ['university', 'Programa X']);
  assert.equal(calls.insert, null, 'não deve chegar ao insert');
});

test('createApplicationForUser: sem nome pula checagem de duplicata', async () => {
  const { client, calls } = mockClient();
  await createApplicationForUser('u1', 'o1', { ...opp(), name: null }, client);
  assert.equal(calls.ilike, null);
  assert.ok(calls.insert);
});

test('createApplicationForUser: propaga erro de insert', async () => {
  const { client } = mockClient({ insertError: { message: 'boom' } });
  const r = await createApplicationForUser('u1', 'o1', opp(), client);
  assert.deepEqual(r.error, { message: 'boom' });
  assert.equal(r.data, null);
});

test('getApplicationsForUser: filtra por user_id e ordena por created_at desc', async () => {
  const { client, calls } = mockClient({ listData: [{ id: 'a' }] });
  const r = await getApplicationsForUser('u1', client);
  assert.deepEqual(r, { error: null, data: [{ id: 'a' }] });
  assert.ok(calls.eq.some(([col, val]) => col === 'user_id' && val === 'u1'));
  assert.deepEqual(calls.order, ['created_at', { ascending: false }]);
});

// ---------- favorites.js ----------

test('addFavoriteForUser insere par user/oportunidade', async () => {
  const { client, calls } = mockClient({ insertResult: { id: 'fav-1' } });
  const r = await addFavoriteForUser('u1', 'o1', client);
  assert.deepEqual(r, { error: null, data: { id: 'fav-1' } });
  assert.deepEqual(calls.insert, { user_id: 'u1', opportunity_id: 'o1' });
});

test('removeFavoriteForUser filtra por user E oportunidade', async () => {
  const { client, calls } = mockClient();
  const r = await removeFavoriteForUser('u1', 'o1', client);
  assert.equal(r.error, null);
  assert.equal(calls.deleted, true);
  assert.deepEqual(calls.eq, [['user_id', 'u1'], ['opportunity_id', 'o1']]);
});

test('listFavoritesForUser retorna erro do client quando houver', async () => {
  const { client } = mockClient({ listError: { message: 'rls' } });
  const r = await listFavoritesForUser('u1', client);
  assert.deepEqual(r, { error: { message: 'rls' }, data: null });
});
