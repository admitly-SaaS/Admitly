import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import { avisarFalha } from '../../../lib/alerta-ops.js'

// Webhook do checkout (Kiwify). O aluno paga lá; aqui o acesso é liberado ou
// revogado. O token chega na query string (?token=...), como a Kiwify envia.
//
// O que mudou para melhor:
// - acha o usuário pelo e-mail usando o filtro do endpoint de admin. Antes usava
//   auth.admin.listUsers(), que devolve só a PRIMEIRA página (50 usuários): a
//   partir do 51º cadastro, quem pagava não tinha o acesso liberado;
// - não cria mais linhas duplicadas. Antes fazia upsert sem chave de conflito e a
//   tabela não tem constraint única em user_id, então cada pagamento/renovação
//   inseria uma linha nova — e o app trancava o aluno (o guard antigo tratava
//   "mais de uma linha" como erro);
// - trata reembolso, chargeback e cancelamento, não só o pagamento aprovado:
//   antes quem cancelava continuava com acesso para sempre;
// - devolve 500 quando o banco falha, para a Kiwify reenviar o evento.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Status de pagamento reconhecidos como "acesso liberado".
const PAGO = /^(paid|approved|completed)$/i

// Família de reembolso/estorno/cancelamento: acesso revogado.
// Comparado por trecho porque os nomes variam entre eventos da Kiwify.
const REVOGADO = /refund|reembols|chargeback|chargedback|cancel|expir|reject|refus|recusad/i

async function acharUsuarioPorEmail(email) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`

  const resposta = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })

  if (!resposta.ok) return null

  const dados = await resposta.json().catch(() => null)
  const usuarios = Array.isArray(dados?.users) ? dados.users : []

  return usuarios.find((u) => String(u.email || '').toLowerCase() === email.toLowerCase()) || null
}

// Grava o status sem criar linha nova quando já existe uma para o aluno.
async function definirAssinatura(userId, status) {
  const { data: existente, error: erroBusca } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .limit(1)

  if (erroBusca) return erroBusca

  const linha = Array.isArray(existente) ? existente[0] : null

  if (linha) {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({ status, plan: 'basic' })
      .eq('id', linha.id)
    return error || null
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .insert({ user_id: userId, status, plan: 'basic' })
  return error || null
}

// Comparação em tempo constante: o JavaScript `===` desiste no primeiro byte
// diferente e, com tráfego suficiente, esse timing poderia refinar um
// ataque de descoberta do token byte a byte. O timingSafeEqual apaga a diferença.
function tokenValido(recebido, esperado) {
  const a = Buffer.from(String(recebido || ''))
  const b = Buffer.from(String(esperado || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request) {
  const tokenEsperado = process.env.KIWIFY_WEBHOOK_TOKEN
  const tokenRecebido = new URL(request.url).searchParams.get('token')

  if (!tokenEsperado || !tokenValido(tokenRecebido, tokenEsperado)) {
    // Chave fixa no throttle: um ataque de tokens errados vira no máximo um
    // alerta a cada 30 min, não uma enchente na caixa do dono.
    await avisarFalha('webhook-token-invalido', {
      assunto: 'Webhook Kiwify recusou token inválido',
      resumo:
        'Um POST chegou no /api/webhook-kiwify com token errado (401 devolvido). Pode ser ataque automatizado — ou a Kiwify perdendo o token configurado dela, o que bloquearia pagamentos futuros.',
      detalhes: [{ rotulo: 'Rota', titulo: '/api/webhook-kiwify?token=…', nota: 'COMPARE em tempo constante, nada gravado, evento descartado.' }],
    })
    return Response.json({ erro: 'token inválido' }, { status: 401 })
  }

  let dados
  try {
    dados = await request.json()
  } catch {
    return Response.json({ erro: 'corpo inválido' }, { status: 400 })
  }

  const email = dados?.Customer?.email
  const status = String(dados?.order_status || dados?.subscription_status || '')

  if (!email) {
    return Response.json({ erro: 'e-mail não encontrado' }, { status: 400 })
  }

  const usuario = await acharUsuarioPorEmail(email)

  if (!usuario) {
    // 404 faz a Kiwify reenviar: o aluno pode ter criado a conta depois do
    // pagamento. ALERTA mesmo assim: um cliente pagou e o acesso NÃO saiu —
    // o dono precisa conferir que o reenvio resolveu (chave por e-mail, então
    // pagamento diferente com o mesmo destino ainda avisa).
    await avisarFalha(`webhook-sem-conta:${String(email).toLowerCase()}`, {
      assunto: `Pagamento da Kiwify sem conta no app — ${email}`,
      resumo:
        'A Kiwify reportou um pagamento, mas nenhum usuário do Supabase tem esse e-mail (404 devolvido; ela reenvia sozinha). Dica: confira se o aluno criou a conta com ESTE e-mail — se criou menor, o pagamento ficou preso.',
      detalhes: [{ rotulo: 'Cliente', titulo: email, nota: `status da ordem: ${status || '(vazio)'}` }],
    })
    return Response.json({ erro: 'usuário não encontrado' }, { status: 404 })
  }

  if (PAGO.test(status)) {
    const erro = await definirAssinatura(usuario.id, 'active')
    if (erro) {
      await avisarFalha('webhook-gravar', {
        assunto: `Kiwify pagou e a gravação da assinatura falhou — ${email}`,
        resumo:
          'O pagamento entrou e a escrita no banco falhou (500 devolvido; a Kiwify reenvia o evento). Confira se o acesso saiu quando ela reenviar — senão, o cliente pagou sem receber.',
        detalhes: [
          { rotulo: 'Cliente', titulo: email, nota: `status da ordem: ${status}` },
          { rotulo: 'Erro do banco', titulo: erro.message || String(erro) },
        ],
      })
      return Response.json({ erro: 'falha ao salvar assinatura' }, { status: 500 })
    }
    return Response.json({ recebido: true, acesso: 'liberado' })
  }

  if (REVOGADO.test(status)) {
    const erro = await definirAssinatura(usuario.id, 'inactive')
    if (erro) {
      await avisarFalha('webhook-gravar', {
        assunto: `Cancelamento/reembolso falhou em gravar — ${email}`,
        resumo:
          'A Kiwify reportou revogação (reembolso/chargeback/cancelamento) e a escrita no banco falhou (500; ela reenvia). Enquanto não gravar, o aluno que reembolsou segue COM acesso.',
        detalhes: [
          { rotulo: 'Cliente', titulo: email, nota: `status da ordem: ${status}` },
          { rotulo: 'Erro do banco', titulo: erro.message || String(erro) },
        ],
      })
      return Response.json({ erro: 'falha ao revogar assinatura' }, { status: 500 })
    }
    return Response.json({ recebido: true, acesso: 'revogado' })
  }

  // Status fora do mapa (ex.: aguardando pagamento) não mexe no acesso.
  console.warn('webhook-kiwify: status sem tratamento', status || '(vazio)')
  return Response.json({ recebido: true, acesso: 'inalterado' })
}
