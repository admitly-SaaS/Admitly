// app/api/cron/alerta-prazo/route.js
//
// Disparo MANUAL/externo do alerta de prazo (host de cron, curl, ?token=).
// O automático vive no agendador interno (instrumentation.js); ambos usam o
// MESMO loop de lib/cron-executar.js. Proteção e filtro idênticos ao digest.

import { executarAlerta } from '../../../../lib/cron-executar.js'

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
  const { erroEstrutural, resumo } = await executarAlerta({ filtroEmail })

  if (erroEstrutural) {
    return Response.json({ error: erroEstrutural }, { status: resumo ? 500 : 404 })
  }
  return Response.json(resumo)
}
