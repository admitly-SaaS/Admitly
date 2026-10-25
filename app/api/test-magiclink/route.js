// app/api/test-magiclink/route.js — ROLES DE DESENVOLVIMENTO.
// Cria (se faltar) e devolve o link mágico de uma conta de teste, para
// automatizar o e2e do site sem digitar senha em nenhum lugar.
//
// OBSTÁCULOS QUE A IMPEDEM DE SUBIR EM PRODUÇÃO: só responde quando o
// servidor roda com TEST_MAGIC_LINK=1 E fora de NODE_ENV=production.
// Sem isso, responde 404 como qualquer rota inexistente.
import { createClient } from '@supabase/supabase-js'

export async function GET(request) {
  if (process.env.NODE_ENV === 'production' || process.env.TEST_MAGIC_LINK !== '1') {
    return Response.json({ erro: 'rota desativada' }, { status: 404 })
  }

  const url = new URL(request.url)
  // Segunda fechadura (auditoria 2026-10-23): a rota cria CONTAS reais — se
  // alguém subir o servidor com TEST_MAGIC_LINK=1 à frente de um tunnel
  // público, antes ela cunhava magic link para QUALQUER e-mail. Hosts
  // permitidos: só loopback.
  const host = url.hostname
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
  if (!local) {
    return Response.json({ erro: 'rota desativada (fora do loopback)' }, { status: 404 })
  }

  const email = url.searchParams.get('email')
  const redirectTo = url.searchParams.get('redirectTo') || url.origin + '/auth/callback'
  if (!email) return Response.json({ erro: 'email ausente' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existe = lista?.users?.find((u) => u.email === email)
  if (!existe) {
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (error) return Response.json({ erro: String(error.message) }, { status: 500 })
  }

  const { data, error: errLink } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  })
  if (errLink) return Response.json({ erro: String(errLink.message) }, { status: 500 })
  return Response.json({ actionLink: data?.properties?.action_link ?? null })
}
