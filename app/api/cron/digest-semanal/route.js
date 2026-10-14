// app/api/cron/digest-semanal/route.js
//
// Disparo MANUAL/externo do digest (host de cron, curl, navegador com ?token=).
// O envio automático de verdade vive no agendador interno (instrumentation.js);
// ambos usam o MESMO loop de lib/cron-executar.js — respostas idênticas.
//
// Proteção: CRON_SECRET no header Bearer ou ?token=. Filtro: ?email= para
// testar com um usuário só. Este endpoint NÃO grava no cron_runs — o registro
// de "já rodei nesta janela" é do agendador, para nunca enviar em dobro.

import { executarDigest } from '../../../../lib/cron-executar.js'

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
  const { erroEstrutural, resumo } = await executarDigest({ filtroEmail })

  if (erroEstrutural) {
    return Response.json({ error: erroEstrutural }, { status: resumo ? 500 : 404 })
  }
  return Response.json(resumo)
}
