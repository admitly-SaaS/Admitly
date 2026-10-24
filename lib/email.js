// lib/email.js
//
// Camada de ENVIO (Resend) e de template. Sem dependência nova: o Resend é
// uma API HTTP simples (POST /emails), e fetch já cobre tudo — nada de SDK
// para o que são dois endpoints.
//
// A parte de rede é à prova de mau tempo: timeout por tentativa, reenvio
// com recuo exponencial em 429/5xx e falha de rede (o que um cron que manda
// centenas de e-mails precisa), e uma chave de idempotência por envio — se
// a resposta se perde mas o e-mail SAIU, a tentativa repetida não cria cópia.
//
// Toda montagem de CONTEÚDO (o que entra no e-mail) vive em lib/digest.js;
// aqui fica só o envelope: autenticar, abrir, estilar, fechar. Os dados de
// e-mail (RESEND_API_KEY, EMAIL_FROM, APP_URL) vêm do ambiente — sem valores
// no código, sem chaves versionadas.
//
// Remetente: sem domínio verificado, envia como onboarding@resend.dev (só
// entrega para o dono da conta Resend). Com domínio verificado, defina
// EMAIL_FROM="Admitly <semana@seudominio.com>" no ambiente e nada mais muda.

import { randomUUID } from 'node:crypto'

const RESEND_URL = 'https://api.resend.com/emails'

// Disciplina de rede: 15s por tentativa (cortar cedo — o Resend responde
// em <1s), até 3 tentativas em 429/5xx/rede, e recuo exponencial — com
// teto de 4s e jitter, para o lote não marcar passo coletivo.
const TIMEOUT_MS = 15_000
const MAX_TENTATIVAS = 3
const RECUO_BASE_MS = 500
const RECUO_TETO_MS = 4_000

// Reenviar faz sentido só quando é uma falha DO SERVIÇO (rate limit ou
// instabilidade), não quando é o pedido que está errado: 4xx de validação
// reenviado vai falhar de novo — e dispende a cota.
function eRetentavel(status) {
  return status === 429 || status >= 500
}

function dormir(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

// Quanto esperar: Retry-After do Resend (em segundos) manda — até o teto de
// 4s — e, sem ele, recuo exponencial com jitter (evita todo o lote batendo
// de novo no mesmo milissegundo).
function calcularEspera(status, headers, tentativa) {
  const retryAfter = Number.parseFloat(headers?.get?.('retry-after') ?? '')
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1000, RECUO_TETO_MS)
  }
  const backoff = RECUO_BASE_MS * 2 ** (tentativa - 1)
  return Math.min(backoff + Math.floor(Math.random() * 250), RECUO_TETO_MS)
}

export function remetente() {
  return process.env.EMAIL_FROM || 'Admitly <onboarding@resend.dev>'
}

export function urlDoSite(caminho = '') {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  return `${base}${caminho}`
}

/**
 * Envia um e-mail pelo Resend, com reenvio em falha transitória. Não lança:
 * devolve { error, data } no padrão do projeto para o chamador decidir
 * (rotas cron registram e seguem para o próximo usuário — um e-mail falho
 * não derruba o lote).
 *
 * As tentativas compartilham uma única chave de idempotência: é o Resend que
 * garante que apenas a primeira delas efetivamente cria a mensagem.
 */
export async function enviarEmail({ to, subject, html }) {
  if (!to || !subject || !html) return { error: { message: 'email incompleto (to/subject/html)' }, data: null }
  const chave = process.env.RESEND_API_KEY
  if (!chave) return { error: { message: 'RESEND_API_KEY ausente no ambiente' }, data: null }

  // O corpo não muda entre tentativas — monta uma vez, fora do loop.
  const corpo = JSON.stringify({ from: remetente(), to: [to], subject, html })
  const chaveIdem = randomUUID()

  let ultimoErro = null

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    let resposta = null
    try {
      resposta = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${chave}`,
          'Content-Type': 'application/json',
          // Idempotência entre tentativas: uma resposta perdida atrás de um
          // 5xx não duplica o envio — o Resend trata a segunda chamada como
          // a mesma mensagem, com o mesmo id.
          'Idempotency-Key': chaveIdem,
        },
        body: corpo,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (erro) {
      // timeout ou rede calada: não é culpa do pedido. Vale insistir.
      const causa = erro?.cause?.message ? ` (${erro.cause.message})` : ''
      ultimoErro = `resposta perdida: rede ou timeout não responderam${causa}`
      if (tentativa < MAX_TENTATIVAS) {
        await dormir(calcularEspera(null, null, tentativa))
        continue
      }
      break
    }

    let dados = null
    try {
      dados = await resposta.json()
    } catch {
      // corpo vazio ou não-JSON: trata pelo HTTP status só.
    }

    if (resposta.ok) return { error: null, data: dados }

    const rotulo = `Resend ${resposta.status}: ${dados?.message || resposta.statusText}`
    if (!eRetentavel(resposta.status) || tentativa === MAX_TENTATIVAS) {
      return {
        error: { message: tentativa > 1 ? `${rotulo} (após ${tentativa} tentativas)` : rotulo },
        data: null,
      }
    }

    ultimoErro = rotulo
    await dormir(calcularEspera(resposta.status, resposta.headers, tentativa))
  }

  return { error: { message: `${ultimoErro} (esgotadas ${MAX_TENTATIVAS} tentativas)` }, data: null }
}

// ---- template ###############################################################

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Paleta do moodboard (carta de admissão v2/v3) — e-mail usa cores inline
// porque clientes de e-mail cortam <style> externo.
const CORES = {
  fundo: '#F6F2EA', // papel
  folha: '#FCFAF5',
  borda: '#E2DACB',
  tinta: '#191512',
  tintaSec: '#5C554B',
  dourado: '#B98A2F',
  vermelho: '#A6301F',
  laurel: '#1A4D3A',
  acento: '#1F3A5F',
}

function linha(i, item) {
  // O candidato com direito a link ganha o lado como âncora; sem href, vira
  // texto puro (como sempre). O rótulo e as cores continuam escapados/ligados.
  const lado = item.href
    ? `<a href="${esc(item.href)}" style="color:${CORES.acento}; text-decoration:none; border-bottom:1px solid ${CORES.borda};">${esc(item.lado)} →</a>`
    : esc(item.lado || '')
  return `
    <tr>
      <td bgcolor="${item.cor || CORES.dourado}" width="3" style="width:3px; padding:0;"></td>
      <td style="padding:12px 0 12px 14px; vertical-align:top;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font:600 10px/16px 'Courier New',monospace; letter-spacing:.18em; text-transform:uppercase; color:${item.cor || CORES.dourado}; white-space:nowrap; padding-right:14px;">${esc(item.rotulo)}</td>
            <td>
              <div style="font:600 16px/1.4 Georgia,'Times New Roman',serif; color:${CORES.tinta};">${esc(item.titulo)}</div>
              ${item.nota ? `<div style="font:12px/1.55 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif; color:${CORES.tintaSec}; margin-top:3px;">${esc(item.nota)}</div>` : ''}
            </td>
            ${item.lado ? `<td align="right" style="font:600 11px/16px 'Courier New',monospace; letter-spacing:.08em; white-space:nowrap;">${lado}</td>` : ''}
          </tr>
        </table>
      </td>
    </tr>`
}

/**
 * Envelope do e-mail: folha central sobre papel, cartucho de mono no topo,
 * seções numeradas, rodapé com preferências. Seções: [{ num, titulo, itens }]
 * onde itens seguem a forma da linha() acima. Um e-mail sem seções com
 * conteúdo (todas vazias) pode ser suprimido pelo chamador — aqui o template
 * sempre renderiza, cabe a quem monta decidir se vale enviar.
 */
export function montarEmailBase({ preheader = '', cartucho = '', titulo = '', nota = '', secoes = [], rodape = '' }) {
  const secoesHtml = secoes
    .filter((s) => s && Array.isArray(s.itens) && s.itens.length > 0)
    .map(
      (s) => `
      <div style="margin-top:24px;">
        <div style="font:600 10px/16px 'Courier New',monospace; letter-spacing:.2em; color:${CORES.dourado}; text-transform:uppercase; border-top:1px solid ${CORES.borda}; padding-top:12px;">${esc(s.num)} · ${esc(s.titulo)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
          ${s.itens.map((item, i) => linha(i, item)).join('')}
        </table>
      </div>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0; padding:0; background:${CORES.fundo}; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CORES.fundo};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px; width:100%; background:${CORES.folha}; border:1px solid ${CORES.borda};">
        <tr><td style="padding:28px 32px 0;">
          <!-- letterhead: o mesmo da carta do app — logo serifa com ponto de
          acento, cartucho mono e a regra dupla azul (grossa em cima, fina abaixo) -->
          <div style="height:5px; border-top:3px solid ${CORES.acento}; border-bottom:1px solid ${CORES.acento};">&nbsp;</div>
          <div style="padding-top:16px; font:400 28px/1 Georgia,'Times New Roman',serif; color:${CORES.tinta}; letter-spacing:-.01em;">
            Admit<em style="font-family:Georgia,'Times New Roman',serif;">ly</em><span style="display:inline-block; width:5px; height:5px; border-radius:50%; background:${CORES.acento}; margin-left:6px; vertical-align:4px;"></span>
          </div>
          <div style="padding-top:10px; font:600 10px/16px 'Courier New',monospace; letter-spacing:.22em; text-transform:uppercase; color:${CORES.acento};">${esc(cartucho)}</div>
          <h1 style="font:400 27px/1.3 Georgia,'Times New Roman',serif; color:${CORES.tinta}; margin:14px 0 0; letter-spacing:-.005em;">${esc(titulo)}</h1>
          ${nota ? `<p style="font:13.5px/1.65 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif; color:${CORES.tintaSec}; margin:10px 0 0;">${esc(nota)}</p>` : ''}
          ${secoesHtml}
          <div style="margin-top:28px; padding:16px 0 4px; border-top:1px solid ${CORES.borda}; font:11.5px/1.7 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif; color:${CORES.tintaSec};">
            ${esc(rodape)}
          </div>
        </td></tr>
        <tr><td style="padding:14px 32px 20px;">
          <div style="font:600 9.5px/16px 'Courier New',monospace; letter-spacing:.18em; text-transform:uppercase; color:${CORES.tintaSec}; text-align:center; border-top:1px solid ${CORES.borda}; padding-top:12px;">
            ADMITLY · SEU CAMINHO ATÉ UMA UNIVERSIDADE NO EXTERIOR
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
