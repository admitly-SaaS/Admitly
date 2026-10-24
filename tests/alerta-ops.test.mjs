// tests/alerta-ops.test.mjs
//
// Unitários do lib/alerta-ops.js: quem dispara o e-mail do dono nas falhas
// de operação (webhook Kiwify, cron dos e-mails) e quando — ou quando não,
// graças ao throttle anti-inundação por chave.

import test from 'node:test'
import assert from 'node:assert/strict'
import { avisarFalha, MINIMO_MS, _estado } from '../lib/alerta-ops.js'

// Epoch dos testes: um “agora” de 50 dias depois do epoch — longe o bastante
// do 0 para o estado vazio do throttle nunca engolir o primeiro disparo.
const T_BASE = MINIMO_MS * 100

// Envia falso em teste: conta chamadas e devolve resultado configurável.
function remetenteFalso({ resultado = 'ok' } = {}) {
  const chamadas = []
  const enviar = async (p) => {
    chamadas.push(p)
    if (resultado === 'ok') return { error: null, data: { id: 'x' } }
    return { error: { message: `falha simulada: ${resultado}` }, data: null }
  }
  return { enviar, chamadas }
}

test('sem ALERTA_EMAIL, nada dispara (módulo inofensivo por desenho)', async () => {
  const origem = process.env.ALERTA_EMAIL
  delete process.env.ALERTA_EMAIL
  try {
    const { enviar, chamadas } = remetenteFalso()
    _estado.clear()

    const r = await avisarFalha('k', { assunto: 'x' }, { enviar })
    assert.equal(r.disparado, false)
    assert.equal(r.motivo, 'sem ALERTA_EMAIL')
    assert.equal(chamadas.length, 0)
  } finally {
    if (origem !== undefined) process.env.ALERTA_EMAIL = origem
  }
})

test('sem destinatário, mesmo evento repetido nunca tira o throttle do lugar', async () => {
  // cenário: ALERTA_EMAIL definido — flow completo abaixo cobre throttle; este
  // garante que o PRIMEIRO disparo em estado limpo passa reto.
  const origem = process.env.ALERTA_EMAIL
  process.env.ALERTA_EMAIL = 'dono@admitly.com'
  try {
    _estado.clear()
    const { enviar } = remetenteFalso()

    const r = await avisarFalha('throttle-1', { assunto: 'a' }, { enviar, agora: T_BASE + 1_000 })
    assert.equal(r.disparado, true)

    // Dentro da janela: bloqueado.
    const r2 = await avisarFalha('throttle-1', { assunto: 'a' }, { enviar, agora: T_BASE + 1_000 + MINIMO_MS - 1 })
    assert.equal(r2.disparado, false)
    assert.equal(r2.motivo, 'throttle')

    // Fora da janela: dispara de novo.
    const r3 = await avisarFalha('throttle-1', { assunto: 'a' }, { enviar, agora: T_BASE + 1_000 + MINIMO_MS })
    assert.equal(r3.disparado, true)
  } finally {
    if (origem !== undefined) process.env.ALERTA_EMAIL = origem
  }
})

test('cada chave tem sua própria janela', async () => {
  const origem = process.env.ALERTA_EMAIL
  process.env.ALERTA_EMAIL = 'dono@admitly.com'
  try {
    _estado.clear()
    const { enviar } = remetenteFalso()

    const a = await avisarFalha('chave-a', { assunto: 'a' }, { enviar, agora: T_BASE + 500 })
    const b = await avisarFalha('chave-b', { assunto: 'b' }, { enviar, agora: T_BASE + 500 })
    assert.equal(a.disparado, true)
    assert.equal(b.disparado, true) // chave diferente, mesmo instante: passou
  } finally {
    if (origem !== undefined) process.env.ALERTA_EMAIL = origem
  }
})

test('envio falho libera a chave: próximo evento re-tenta de vez', async () => {
  const origem = process.env.ALERTA_EMAIL
  process.env.ALERTA_EMAIL = 'dono@admitly.com'
  try {
    _estado.clear()
    const falha = remetenteFalso({ resultado: 'resend-fora' })
    const r = await avisarFalha('libera', { assunto: 'a' }, { enviar: falha.enviar, agora: T_BASE + 10_000 })
    assert.equal(r.disparado, false)
    assert.match(r.motivo, /resend-fora/)
    assert.equal(_estado.has('libera'), false) // não travou a janela

    const ok = remetenteFalso()
    const r2 = await avisarFalha('libera', { assunto: 'a' }, { enviar: ok.enviar, agora: T_BASE + 10_000 })
    assert.equal(r2.disparado, true)
    assert.equal(_estado.get('libera'), T_BASE + 10_000)
  } finally {
    if (origem !== undefined) process.env.ALERTA_EMAIL = origem
  }
})

test('e-mail sai endereçado ao dono, com assunto associado e corpo do template', async () => {
  const origem = process.env.ALERTA_EMAIL
  process.env.ALERTA_EMAIL = 'dono@admitly.com'
  try {
    _estado.clear()
    const { enviar, chamadas } = remetenteFalso()

    await avisarFalha('formato', {
      assunto: 'Webhook Kiwify recusou token inválido',
      resumo: 'POST com token errado.',
      detalhes: [{ rotulo: 'Rota', titulo: '/api/webhook-kiwify', nota: 'evento descartado.' }],
    }, { enviar, agora: T_BASE + 2_000 })

    assert.equal(chamadas.length, 1)
    const p = chamadas[0]
    assert.equal(p.to, 'dono@admitly.com')
    assert.equal(p.subject, 'ADMITLY OPS — Webhook Kiwify recusou token inválido')
    assert.match(p.html, /Alerta operacional/)
    assert.match(p.html, /POST com token errado\./)
    assert.match(p.html, /\/api\/webhook-kiwify/)
  } finally {
    if (origem !== undefined) process.env.ALERTA_EMAIL = origem
  }
})

test('detalle vai truncado (teto de 8 itens) e sem linha vazia', async () => {
  const origem = process.env.ALERTA_EMAIL
  process.env.ALERTA_EMAIL = 'dono@admitly.com'
  try {
    _estado.clear()
    const { enviar, chamadas } = remetenteFalso()

    const detalhes = Array.from({ length: 15 }, (_, i) => ({ rotulo: 'CLIENTE', titulo: `aluno${i}@x.com`, nota: 'falha' }))
    detalhes.push(null) // linha suja não entra
    detalhes.push({ rotulo: '', titulo: '', nota: '' }) // sem conteúdo: não entra

    await avisarFalha('truncado', { assunto: 'a', detalhes }, { enviar, agora: T_BASE + 3_000 })
    const html = chamadas[0].html
    assert.match(html, /aluno7@x\.com/)
    assert.doesNotMatch(html, /aluno8@x\.com/) // teto de 8
  } finally {
    if (origem !== undefined) process.env.ALERTA_EMAIL = origem
  }
})

test('remetente lança → nada estoura, chave liberada', async () => {
  const origem = process.env.ALERTA_EMAIL
  process.env.ALERTA_EMAIL = 'dono@admitly.com'
  try {
    _estado.clear()
    const reventar = async () => { throw new Error('boom') }

    const r = await avisarFalha('lanca', { assunto: 'a' }, { enviar: reventar, agora: T_BASE + 9_000 })
    assert.equal(r.disparado, false)
    assert.match(r.motivo, /boom/)
    assert.equal(_estado.has('lanca'), false)
  } finally {
    if (origem !== undefined) process.env.ALERTA_EMAIL = origem
  }
})
