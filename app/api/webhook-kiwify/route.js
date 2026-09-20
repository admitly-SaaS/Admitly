import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  const url = new URL(request.url)
  const tokenRecebido = url.searchParams.get('token')

  if (tokenRecebido !== process.env.KIWIFY_WEBHOOK_TOKEN) {
    return Response.json({ erro: 'token inválido' }, { status: 401 })
  }

  const dados = await request.json()
  const emailComprador = dados?.Customer?.email
  const status = dados?.order_status

  if (!emailComprador) {
    return Response.json({ erro: 'e-mail não encontrado' }, { status: 400 })
  }

  const { data: usuarios } = await supabaseAdmin.auth.admin.listUsers()
  const usuario = usuarios.users.find((u) => u.email === emailComprador)

  if (!usuario) {
    return Response.json({ erro: 'usuário não encontrado' }, { status: 404 })
  }

  if (status === 'paid') {
    await supabaseAdmin.from('subscriptions').upsert({
      user_id: usuario.id,
      status: 'active',
      plan: 'basic',
    })
  }

  return Response.json({ recebido: true })
}