import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { temAssinaturaAtiva } from '../../../../lib/subscriptions.js'

// ===== Prompt de listagem (contrato igual ao de análise das redações) =====
// O entregável é a descrição de atividade no formato que o Common App cobra:
// 150 caracteres, verbo forte no início, impacto + escala. Nunca inventa
// números nem premiações — só organiza o que o aluno contou.
const PROMPT_LISTAGEM = `Você é o Admitly, mentor de admissões internacionais de estudantes brasileiros. Vai escrever a descrição de UMA atividade extracurricular para o formulário "Activities" do Common App.

Regras do formato:
- No máximo 150 caracteres. Conte cada um.
- Comece com um verbo forte no presente ou no pretérito (Organizo, Liderei, Publiquei, Montei...). Nunca "Eu".
- Estrutura: verbo + o que faz + impacto/escala quando existir (tamanho do grupo, resultado, público).
- Use APENAS os fatos que o aluno informou. Nunca invente números, duração, prêmios ou resultado que não veio no texto. Se faltar número, descreva o papel sem número.
- Sem franze, sem emojis, sem cheiro de IA ("passionate", "incredible"). Português do Brasil.

Responda EXATAMENTE neste formato, sem linha extra:
DESCRICAO: <texto da descrição, até 150 caracteres>`

function montarPedido(atividade, meta) {
  const partes = []
  partes.push(`Nome da atividade: ${atividade.nome}`)
  if (atividade.papel) partes.push(`Função do aluno: ${atividade.papel}`)
  partes.push(`Categoria: ${atividade.categoria}`)
  if (atividade.horas_semana != null) partes.push(`Comprometimento: ${atividade.horas_semana} horas por semana`)
  if (atividade.semanas_ano != null) partes.push(`Duração anual: ${atividade.semanas_ano} semanas`)
  partes.push(`Período: ${atividade.inicio || '?'} a ${atividade.fim || 'atual'}`)
  if (atividade.descricao) partes.push(`O que o aluno contou (fonte dos fatos, só isso): ${atividade.descricao}`)
  if (meta?.objetivo) partes.push(`Objetivo do aluno: ${meta.objetivo}`)
  if (meta?.areaInteresse) partes.push(`Área de interesse: ${meta.areaInteresse}`)
  return partes.join('\n')
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return Response.json({ erro: 'não autenticado' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) {
    return Response.json({ erro: 'não autenticado' }, { status: 401 })
  }

  const ativa = await temAssinaturaAtiva(supabase, user.id)
  if (!ativa) {
    return Response.json({ erro: 'assinatura inativa' }, { status: 403 })
  }

  let corpo
  try {
    corpo = await request.json()
  } catch {
    return Response.json({ erro: 'corpo inválido' }, { status: 400 })
  }

  // A atividade SEMPRE vem da tabela (não do cliente) — RLS cobre a leitura e
  // o aluno não consegue pedir listagem de conteúdo que não é dele.
  const atividadeId = typeof corpo?.atividadeId === 'string' ? corpo.atividadeId : ''
  if (!atividadeId) {
    return Response.json({ erro: 'atividadeId ausente' }, { status: 400 })
  }

  const { data: atividade, error: errAtividade } = await supabase
    .from('extracurriculares')
    .select('*')
    .eq('id', atividadeId)
    .maybeSingle()

  if (errAtividade || !atividade || atividade.user_id !== user.id) {
    return Response.json({ erro: 'atividade não encontrada' }, { status: 404 })
  }
  if (!atividade.nome?.trim()) {
    return Response.json({ erro: 'atividade sem nome — preencha antes de listar' }, { status: 400 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ erro: 'mentor temporariamente indisponível' }, { status: 503 })
  }

  const meta = user.user_metadata?.perfil_academico ?? null

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-lite-latest',
    systemInstruction: PROMPT_LISTAGEM,
  })

  let resultado
  try {
    resultado = await model.generateContent(montarPedido(atividade, meta))
  } catch (err) {
    console.error('gemini listagem falhou:', err?.message || err)
    return Response.json({ erro: 'listagem não saiu agora, tente de novo' }, { status: 502 })
  }

  // O contrato é "DESCRICAO: <texto>"; tudo fora disso vira erro conhecido.
  const texto = resultado.response.text().trim()
  const m = texto.match(/DESCRICAO:\s*([\s\S]+)/i)
  if (!m || !m[1].trim()) {
    console.error('resposta fora do contrato de listagem:', texto.slice(0, 200))
    return Response.json({ erro: 'resposta inesperada do mentor, tente de novo' }, { status: 502 })
  }

  return Response.json({ descricao: m[1].trim() }, { headers: { 'Cache-Control': 'no-store' } })
}
