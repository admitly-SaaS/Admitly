import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bateBusca } from '../lib/busca.js';

const opp = (over = {}) => ({
  name: 'Programa X',
  provider: 'Org',
  country: 'Brasil',
  type: 'Olympiad',
  academic_focus: null,
  ...over,
});

const OBB = opp({ name: 'Olimpíada Brasileira de Biologia (OBB)', academic_focus: ['Biologia'] });
const OBI = opp({ name: 'Olimpíada Brasileira de Informática (OBI)' });
const OBF = opp({ name: 'Olimpíada Brasileira de Física (OBF)' });
const SSP = opp({ name: 'Summer Science Program (SSP)', country: 'USA', academic_focus: ['Astrobiologia / Bioquímica / Genômica'] });
const MATHCIRCLE = opp({ name: 'Stanford Math Circle', country: 'USA' });
const STANFORDPHYS = opp({ name: 'Stanford Pre-Collegiate University-Level Online Math & Physics', country: 'USA' });
const OMU = opp({ name: 'Olimpíada de Matemática da Unicamp (OMU)', academic_focus: ['Matemática'] });

test('termo vazio ou só espaços mostra tudo', () => {
  assert.equal(bateBusca(OBB, ''), true);
  assert.equal(bateBusca(OBB, '   '), true);
  assert.equal(bateBusca(OBB, null), true);
});

test('substring direto segue funcionando (comportamento atual preservado)', () => {
  assert.equal(bateBusca(OBB, 'olimpiada'), true);
  assert.equal(bateBusca(OBB, 'zzz'), false);
});

test('área de interesse: biologia acha OBB e Astrobiologia (SSP)', () => {
  assert.equal(bateBusca(OBB, 'biologia'), true);
  assert.equal(bateBusca(SSP, 'biologia'), true);
});

test('prefixos curtos casam via sinônimo: bio, mat, fis, quim', () => {
  assert.equal(bateBusca(OBB, 'bio'), true);
  assert.equal(bateBusca(SSP, 'bio'), true);
  assert.equal(bateBusca(OMU, 'mat'), true);
  assert.equal(bateBusca(OBF, 'fis'), true);
  assert.equal(bateBusca(opp({ academic_focus: ['Química'] }), 'quim'), true);
});

test('abreviação cs acha Computação e Informática', () => {
  assert.equal(bateBusca(opp({ academic_focus: ['Computação'] }), 'cs'), true);
  assert.equal(bateBusca(OBI, 'cs'), true);
});

test('sinônimos EN → PT: math, physics, brazil, estados unidos', () => {
  assert.equal(bateBusca(OMU, 'math'), true);
  assert.equal(bateBusca(OBF, 'physics'), true);
  assert.equal(bateBusca(OBB, 'brazil'), true);
  assert.equal(bateBusca(opp({ country: 'USA' }), 'estados unidos'), true);
  assert.equal(bateBusca(opp({ country: 'USA' }), 'eua'), true);
});

test('sinônimos PT → EN: matematica acha Math Circle, fisica acha Physics', () => {
  assert.equal(bateBusca(MATHCIRCLE, 'matematica'), true);
  assert.equal(bateBusca(STANFORDPHYS, 'fisica'), true);
});

test('tolerância a plural: olimpiadas acha Olimpíada', () => {
  assert.equal(bateBusca(OBB, 'olimpiadas'), true);
  assert.equal(bateBusca(OBB, 'olimpiadas brasileiras'), true);
});

test('plural curto não vira falso positivo (cs não é expandido para "c")', () => {
  // 'cs' tem 2 letras: o stem plural não pode transformar em 'c'
  const qualquer = opp({ name: 'Cultura e Arte' });
  assert.equal(bateBusca(qualquer, 'cs'), false);
});

test('termos ≤3 letras não casam no meio de palavras (cs ≠ physics/Academics/Mathematics)', () => {
  assert.equal(bateBusca(STANFORDPHYS, 'cs'), false);
  assert.equal(bateBusca(opp({ name: 'Pioneer Academics' }), 'cs'), false);
  assert.equal(bateBusca(opp({ name: 'Stanford University Mathematics Camp (SUMaC)' }), 'cs'), false);
});

test('termo curto casa como palavra inteira quando aparece sozinho', () => {
  assert.equal(bateBusca(opp({ name: 'CS Academy Summer Course' }), 'cs'), true);
  assert.equal(bateBusca(opp({ country: 'USA' }), 'usa'), true);
});

test('multi-palavra com semântica E: matematica olimpiada acha OMU; zzz veta', () => {
  assert.equal(bateBusca(OMU, 'matematica olimpiada'), true);
  assert.equal(bateBusca(OMU, 'olimpiada matematica'), true);
  assert.equal(bateBusca(OMU, 'matematica zzz'), false);
});

test('sem acentos: informatica acha Informática, linguistica acha Linguística', () => {
  assert.equal(bateBusca(OBI, 'informatica'), true);
  assert.equal(bateBusca(opp({ academic_focus: ['Linguística / Humanas'] }), 'linguistica'), true);
});

test('academic_focus null não quebra e outros campos continuam sendo buscados', () => {
  assert.equal(bateBusca(OBI, 'olimpiada'), true);
  assert.equal(bateBusca(opp({ provider: 'CERN' }), 'cern'), true);
  assert.equal(bateBusca(opp({ type: 'Research Program' }), 'research'), true);
});

test('stem (área) acha Pesquisa STEM e as ciências exatas', () => {
  assert.equal(bateBusca(opp({ academic_focus: ['Pesquisa STEM'] }), 'stem'), true);
  assert.equal(bateBusca(OMU, 'stem'), true);
  assert.equal(bateBusca(OBI, 'stem'), true);
});

test('busca não casa campo ausente ou objeto mínimo', () => {
  assert.equal(bateBusca({}, 'qualquer'), false);
  assert.equal(bateBusca(null, 'qualquer'), false);
});
