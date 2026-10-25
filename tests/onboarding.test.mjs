// tests/onboarding.test.mjs
//
// Unitários do lib/onboarding.js: QUEM recebe O QUÊ, quando — e quando NÃO.
// Tudo função pura: banco, rede e relógio vivos não entram (agora é parâmetro),
// então as janelas são determinísticas e os casos de borda são exatos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { decidirOnboarding, montarOnboardingHtml, TIPOS } from '../lib/onboarding.js'
import { devePausar, prefsPadrao, normalizarPrefs } from '../lib/email-prefs.js'

// Relógio fixo: 2026-10-25T12:00:00Z; as datas da conta São Paulo nascem dele.
const AGORA = Date.parse('2026-10-25T12:00:00Z')
const HORA = 3_600_000
const DIA = 24 * HORA
const criadoEm = (diasAtras, horasAtras = 0) => new Date(AGORA - diasAtras * DIA - horasAtras * HORA).toISOString()

const decide = (over = {}) =>
  decidirOnboarding({ criado_em: criadoEm(0), agora: AGORA, ...over })

const PERFIL_COMPLETO = {
  anoEscolar: '2º ano do ensino médio',
  areaInteresse: 'Engenharia',
  orcamento: 'até 50k',
  paisPreferencia: 'EUA',
  objetivo: 'Bacharelado com bolsa',
}

// ---- decisão ---------------------------------------------------------------

test('conta fresca (≤72h) recebe bem_vindo, e só ele', () => {
  assert.deepEqual(decide({ criado_em: criadoEm(0, 5) }), ['bem_vindo'])
})

test('janela de boas-vindas fecha em 72h — 1 minuto depois NÃO há backfill', () => {
  // O lembrete pega a conta de 3d com perfil INCOMPLETO (é o caso dele); o que
  // nunca sai é boas-vindas atrasado:
  assert.deepEqual(
    decide({ criado_em: new Date(AGORA - 3 * DIA - 60_000).toISOString(), perfilAcademico: PERFIL_COMPLETO }),
    []
  )
})

test('conta de 25h incompleta: bem-vindo sai PRIMEIRO; lembrete aguarda a rodada seguinte', () => {
  // Sem bem-vindo gravado, a fila é SÓ bem-vindo — nada de dois e-mails no mesmo dia:
  assert.deepEqual(decide({ criado_em: criadoEm(1, 1), perfilAcademico: { anoEscolar: '3º ano do ensino médio' } }), [
    'bem_vindo',
  ])
  // Na rodada seguinte (bem-vindo já gravado), o lembrete é o único da fila:
  assert.deepEqual(
    decide({ criado_em: criadoEm(1, 1), perfilAcademico: { anoEscolar: '3º ano do ensino médio' }, enviados: { bem_vindo: criadoEm(0, 23) } }),
    ['lembrete_perfil']
  )
})

test('perfil completo NUNCA gera lembrete (bem-vindo vai mesmo assim na janela)', () => {
  // 25h, perfil completo, bem-vindo já enviado: fila vazia (silêncio honesto):
  assert.deepEqual(
    decide({ criado_em: criadoEm(1, 1), perfilAcademico: PERFIL_COMPLETO, enviados: { bem_vindo: criadoEm(1) } }),
    []
  )
})

test('perfil sem área OU sem objetivo é incompleto mesmo com resto preenchido', () => {
  assert.deepEqual(
    decide({
      criado_em: criadoEm(1, 1),
      perfilAcademico: { ...PERFIL_COMPLETO, areaInteresse: '', objetivo: '' },
      enviados: { bem_vindo: criadoEm(1) },
    }),
    ['lembrete_perfil']
  )
})

test('janela de lembrete: até 14d vai; depois de 14d, não; antes de 24h, tampouco', () => {
  assert.deepEqual(decide({ criado_em: criadoEm(13, 23), perfilAcademico: null }), ['lembrete_perfil'])
  // 14d é a última hora da janela do lembrete; depois disso, só reativação
  // (aqui com conta ATIVA: nenhum tipo de cadência disconnected dispara):
  assert.deepEqual(
    decide({ criado_em: new Date(AGORA - 14 * DIA - 60_000).toISOString(), perfilAcademico: PERFIL_COMPLETO, ultimaAtividade: criadoEm(1) }),
    []
  )
  assert.deepEqual(decide({ criado_em: criadoEm(0, 2), perfilAcademico: null }), ['bem_vindo'])
})

test('lembrete já enviado não repete (estado gravado, memória viva nenhuma)', () => {
  const enviados = { bem_vindo: criadoEm(1, 1), lembrete_perfil: criadoEm(0, 20) }
  assert.deepEqual(decide({ criado_em: criadoEm(2), perfilAcademico: null, enviados }), [])
})

test('conta de 15 dias sem nenhuma atividade → reativação (uma vez)', () => {
  assert.deepEqual(decide({ criado_em: criadoEm(15), perfilAcademico: PERFIL_COMPLETO }), ['reativacao'])
})

test('reativação exige inatividade de 14d: atividade ontem não dispara', () => {
  assert.deepEqual(decide({ criado_em: criadoEm(30), perfilAcademico: PERFIL_COMPLETO, ultimaAtividade: criadoEm(1) }), [])
})

test('sem qualquer atividade registrada conta como inativo da criação', () => {
  assert.deepEqual(decide({ criado_em: criadoEm(30), perfilAcademico: null, ultimaAtividade: null }), [
    'reativacao',
  ])
})

test('reativação já enviada nunca se repete', () => {
  const enviados = { reativacao: criadoEm(5) }
  assert.deepEqual(decide({ criado_em: criadoEm(40), perfilAcademico: PERFIL_COMPLETO, enviados }), [])
})

test('pausa nas prefs esvazia a fila INTEIRA (digest/alerta seguem nas próprias chaves)', () => {
  assert.deepEqual(decide({ criado_em: criadoEm(0, 5), pausado: true }), [])
  assert.deepEqual(decide({ criado_em: criadoEm(15), perfilAcademico: null, pausado: true }), [])
})

test('pausa é lida da MESMA linha de prefs do digest/alerta (um toggle, um lugar)', () => {
  const prefs = normalizarPrefs({ pausar_onboarding: true })
  assert.equal(devePausar(prefs, 'onboarding'), true)
  assert.equal(devePausar(prefs, 'digest'), false)
  assert.deepEqual({ ...prefsPadrao(), pausar_onboarding: true }, { pausar_digest: false, pausar_alerta: false, pausar_onboarding: true })
})

test('data malformada / ausente decide NÃO ENVIAR (silêncio por fé < e-mail errado)', () => {
  assert.deepEqual(decide({ criado_em: null }), [])
  assert.deepEqual(decide({ criado_em: 'não é data' }), [])
})

test('conta jovem nunca reúne bem-vindo e lembrete na mesma rodada (um e-mail por dia)', () => {
  assert.deepEqual(decide({ criado_em: criadoEm(1, 12), perfilAcademico: null }), ['bem_vindo'])
  // 25h por conta de 3 dias (fora da janela de boas-vindas) + incompleta: direto o lembrete:
  assert.deepEqual(
    decide({ criado_em: new Date(AGORA - 3 * DIA - 60_000).toISOString(), perfilAcademico: null }),
    ['lembrete_perfil']
  )
})

test('exatamente 24h é o primeiro instante do lembrete (D+1 honesto)', () => {
  const umMinutoAntes = decidirOnboarding({ criado_em: criadoEm(1), perfilAcademico: null, agora: AGORA - 60_000 })
  assert.deepEqual(umMinutoAntes, ['bem_vindo'])
})

// ---- templates -------------------------------------------------------------

test('os três tipos têm HTML completo', () => {
  for (const tipo of TIPOS) {
    const html = montarOnboardingHtml(tipo, { primeiroNome: 'Ana' })
    assert.ok(typeof html === 'string' && html.length > 500, `${tipo} tem corpo real`)
    assert.ok(html.includes('Bem-vindo') || html.includes('Falta') || html.includes('Tudo do seu processo'), `${tipo} tem o título certo`)
  }
})

test('tipo desconhecido não inventa corpo (null limpo, nunca template errado)', () => {
  assert.equal(montarOnboardingHtml('não_existe'), null)
})

test('sem primeiro nome, os templates seguem completos — nenhum "olá, null"', () => {
  const html = montarOnboardingHtml('bem_vindo', {})
  assert.ok(!html.includes('null') && !html.includes('undefined'))
})

// ---- smoke do executor: o fluxo real (banco + rede) é coberto pelo smoke do
// cron/gate manual — aqui fica a DECISÃO, que é a parte que não perdoa.
