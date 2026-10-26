// app/api/cron/onboarding/route.js
//
// Disparo MANUAL/externo da cadência de onboarding (host de cron, curl, ?token=).
// O automático (dev local) vive no agendador interno (instrumentation.js); em
// PRODUÇÃO este é o gatilho de verdade — serverless não sustenta relógio
// interno, então o cron da Vercel chama a rota no ENVELOPE diário. Ambos usam
// o MESMO loop de lib/cron-executar.js — respostas idênticas.
//
// Proteção: CRON_SECRET no header Bearer ou ?token=. Filtro: ?email= para
// testar com um usuário só. Este endpoint NÃO grava no cron_runs — a
// idempotência de envio é da tabela onboarding_mail (linha existe = já saiu),
// então rodar duas vezes na mesma janela não duplica nada.

import { executarOnboarding } from '../../../../lib/cron-executar.js'

function autorizado(request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const url = new URL(request.url)
  if (request.headers.get('authorization') === `Bearer ${segredo}`) return true
  return url.searchParams.get('token') === segredo
}

export async function GET(request) {
  if (!autorizado(request)) {
    return Response.json({ error: 'não autorizado' }, { status: 401 })
  }

  const filtroEmail = new URL(request.url).searchParams.get('email')?.trim().toLowerCase() || null
  const { erroEstrutural, resumo } = await executarOnboarding({ filtroEmail })

  if (erroEstrutural) {
    return Response.json({ error: erroEstrutural }, { status: resumo ? 500 : 404 })
  }
  return Response.json(resumo)
}
