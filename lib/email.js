// lib/email.js
//
// Camada de ENVIO (Resend) e de template. Sem dependência nova: o Resend é
// uma API HTTP simples (POST /emails), e fetch já cobre tudo — nada de SDK
// para o que são dois endpoints.
//
// Toda montagem de CONTEÚDO (o que entra no e-mail) vive em lib/digest.js;
// aqui fica só o envelope: autenticar, abrir, estilar, fechar. Os dados de
// e-mail (RESEND_API_KEY, EMAIL_FROM, APP_URL) vêm do ambiente — sem valores
// no código, sem chaves versionadas.
//
// Remetente: sem domínio verificado, envia como onboarding@resend.dev (só
// entrega para o dono da conta Resend). Com domínio verificado, defina
// EMAIL_FROM="Admitly <semana@seudominio.com>" no ambiente e nada mais muda.

const RESEND_URL = 'https://api.resend.com/emails'

export function remetente() {
  return process.env.EMAIL_FROM || 'Admitly <onboarding@resend.dev>'
}

export function urlDoSite(caminho = '') {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  return `${base}${caminho}`
}

/**
 * Envia um e-mail pelo Resend. Não lança: devolve { error, data } no
 * padrão do projeto para o chamador decidir (rotas cron registram e seguem
 * para o próximo usuário — um e-mail falho não derruba o lote).
 */
export async function enviarEmail({ to, subject, html }) {
  if (!to || !subject || !html) return { error: { message: 'email incompleto (to/subject/html)' }, data: null }
  const chave = process.env.RESEND_API_KEY
  if (!chave) return { error: { message: 'RESEND_API_KEY ausente no ambiente' }, data: null }

  try {
    const resposta = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remetente(),
        to: [to],
        subject,
        html,
      }),
    })

    const dados = await resposta.json().catch(() => null)
    if (!resposta.ok) {
      return { error: { message: `Resend ${resposta.status}: ${dados?.message || resposta.statusText}` }, data: null }
    }
    return { error: null, data: dados }
  } catch (erro) {
    return { error: { message: String(erro) }, data: null }
  }
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
  return `
    <tr>
      <td style="padding:10px 0; border-top:1px solid ${CORES.borda}; vertical-align:top;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font:600 10px/16px 'Courier New',monospace; letter-spacing:.18em; text-transform:uppercase; color:${item.cor || CORES.dourado}; white-space:nowrap; padding-right:14px;">${esc(item.rotulo)}</td>
            <td>
              <div style="font:600 15px/1.45 Georgia,'Times New Roman',serif; color:${CORES.tinta};">${esc(item.titulo)}</div>
              ${item.nota ? `<div style="font:12px/1.5 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif; color:${CORES.tintaSec}; margin-top:2px;">${esc(item.nota)}</div>` : ''}
            </td>
            ${item.lado ? `<td align="right" style="font:600 11px/16px 'Courier New',monospace; letter-spacing:.08em; color:${CORES.tintaSec}; white-space:nowrap;">${esc(item.lado)}</td>` : ''}
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
      <div style="margin-top:26px;">
        <div style="font:600 10px/16px 'Courier New',monospace; letter-spacing:.2em; color:${CORES.dourado}; text-transform:uppercase;">${esc(s.num)} · ${esc(s.titulo)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
          ${s.itens.map((item, i) => linha(i, item)).join('')}
        </table>
      </div>`
    )
    .join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding:0; background:${CORES.fundo};">
  <div style="display:none; max-height:0; overflow:hidden;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CORES.fundo};">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%; background:${CORES.folha}; border:1px solid ${CORES.borda}; padding:30px 28px 24px;">
        <tr><td>
          <div style="font:600 10px/16px 'Courier New',monospace; letter-spacing:.22em; color:${CORES.acento};">${esc(cartucho)}</div>
          <h1 style="font:400 26px/1.3 Georgia,'Times New Roman',serif; color:${CORES.tinta}; margin:8px 0 0;">${esc(titulo)}</h1>
          ${nota ? `<p style="font:13px/1.6 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif; color:${CORES.tintaSec}; margin:10px 0 0;">${esc(nota)}</p>` : ''}
          ${secoesHtml}
          <div style="margin-top:30px; padding-top:14px; border-top:1px solid ${CORES.borda}; font:11px/1.7 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif; color:${CORES.tintaSec};">
            ${esc(rodape)}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
