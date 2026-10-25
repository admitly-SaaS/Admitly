// Webhook de EVENTOS do Resend (POST https://api.resend.com/webhooks lá no
// painel, endpoints → "Email opened" → este endpoint + RESEND_WEBHOOK_SECRET).
//
// O que faz: o evento 'email.opened' traz o message_id do envio; a cadência
// de onboarding gravou esse id em onboarding_mail.resend_id (cron-executar).
// Aqui a primeira abertura do e-mail vira aberto_em — a MÉTRICA de onboarding
// (botão clicado e contas sem abertura saem dos relatórios do próprio cron).
//
// Assinatura: o Resend assina via Svix — HMAC-SHA256 base64 de
// `svix-id.svix-timestamp.corpo` com o secret (whsec_...) do webhook.
// VERIFICA quando RESEND_WEBHOOK_SECRET existe no ambiente (produção: obrigatório)
// e, sem ele, aceita MAS registra o aviso — modo dev (a rota só toca
// aberto_em de linhas cujo resend_id já nasceu dos nossos envios; um pedido
// forjado no máximo marca abertura falsa, não escreve nada mais).

import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const sigVerdadeira = (assinatura, id, timestamp, corpo, secret) => {
  const chave = String(secret || '')
  const prefixo = chave.startsWith('whsec_') ? chave.slice(6) : chave
  const esperado = createHmac('sha256', prefixo).update(`${id}.${timestamp}.${corpo}`).digest('base64')
  const recebidas = String(assinatura || '').split(' ').filter(Boolean)
  return recebidas.some((r) => {
    const a = Buffer.from(r)
    const b = Buffer.from(esperado)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

export async function POST(request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) console.warn('[webhook-resend] RESEND_WEBHOOK_SECRET ausente — aceitando sem verificação de assinatura')

  const corpoBruto = await request.text()

  if (secret) {
    const id = request.headers.get('svix-id')
    const timestamp = request.headers.get('svix-timestamp')
    const assinatura = request.headers.get('svix-signature')
    if (!id || !timestamp || !assinatura || !sigVerdadeira(assinatura, id, timestamp, corpoBruto, secret)) {
      return Response.json({ erro: 'assinatura inválida' }, { status: 401 })
    }
  }

  let evento
  try {
    evento = JSON.parse(corpoBruto)
  } catch {
    return Response.json({ erro: 'corpo inválido' }, { status: 400 })
  }

  // Só abertura interessa nesta v1. Outros eventos são reconhecidos com 200
  // (o Resend pensa entregue e desiste de reenviar; nada é escrito).
  if (evento?.type !== 'email.opened') {
    return Response.json({ recebido: true, tratamento: 'ignorado' })
  }

  const messageId = evento?.data?.message_id
  if (!messageId) return Response.json({ erro: 'message_id ausente' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('onboarding_mail')
    .update({ aberto_em: new Date().toISOString() })
    .eq('resend_id', messageId)
    .is('aberto_em', null)

  if (error) {
    console.error('[webhook-resend] gravação falhou:', error.message)
    return Response.json({ erro: 'falha ao gravar abertura' }, { status: 500 })
  }

  return Response.json({ recebido: true })
}
