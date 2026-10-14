import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { temAssinaturaAtiva } from '../../../../lib/subscriptions.js'

// ===== Prompt de revisão (contrato igual ao do mentor no /chat) =====
// Mesma estrutura padrão de revisão: resumo → fortes citados → a melhorar
// com o porquê → UMA frase reescrita → pergunta final. A IA nunca reescreve
// a redação inteira.
const PROMPT_REVISAO = `Você é o Admitly, mentor de admissões internacionais de estudantes brasileiros. Revise o rascunho do ensaio de candidatura que o aluno mandou e responda EXATAMENTE nesta estrutura — CADA seção começa em LINHA NOVA com o prefixo exato entre aspas (o painel separa as seções por esses marcadores, então nunca os agrupe num parágrafo só):

1. "Sumário do texto:" uma frase com o que o texto comunica de fato (não o que o aluno acha que comunica). Tudo na mesma linha do rótulo.
2. "Pontos fortes:" 2–3 itens, CADA UM em linha própria começando com "- ", citando um trecho REAL do texto entre aspas.
3. "A melhorar:" 2–3 pontos honestos com o porquê — mesmo quando doer. Cada ponto em linha própria começando com "- ". NÃO elogie texto fraco por gentileza.
4. "Reescrita de exemplo:" reescreva UMA frase inteira como mostra do tom — nunca o parágrafo, nunca o ensaio todo. Na mesma linha do rótulo.
5. "Pergunta:" termine oferecendo aprofundar um dos pontos ou o prompt da universidade. Na mesma linha do rótulo.

Regras: aponte repetições de palavras e generalidades ("programa incrível", "great opportunities") sempre que existirem; se o texto estourar ou estiver longe do limite de palavras, diga isso no primeiro ponto a melhorar; se o prompt da redação for dado, julgue o texto contra ELE (o que a pergunta pede e o texto não entrega); responda no idioma do aluno; sem emojis; frases curtas.`

function montarPedido(ensaio) {
  const limite = ensaio.word_limit != null ? ` Limite de palavras: ${ensaio.word_limit}.` : ''
  const prompt = ensaio.prompt ? ` Enunciado da redação: "${ensaio.prompt}".${limite}` : ''
  return `Título da redação: ${ensaio.title || 'Redação sem título'}.${prompt}

RASCUNHO:
"""
${ensaio.body || '(em branco)'}
"""`
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

  // O texto analisado SEMPRE vem da tabela (não do cliente): o aluno não
  // consegue pedir análise de conteúdo que não é dele — RLS cobre a leitura.
  const ensaioId = typeof corpo?.ensaioId === 'string' ? corpo.ensaioId : ''
  if (!ensaioId) {
    return Response.json({ erro: 'ensaioId ausente' }, { status: 400 })
  }

  const { data: ensaio, error: errEnsaio } = await supabase
    .from('essays')
    .select('id, title, prompt, body, word_limit, user_id')
    .eq('id', ensaioId)
    .maybeSingle()

  if (errEnsaio || !ensaio || ensaio.user_id !== user.id) {
    return Response.json({ erro: 'redação não encontrada' }, { status: 404 })
  }
  if (!ensaio.body?.trim()) {
    return Response.json({ erro: 'rascunho vazio — escreva um parágrafo antes de pedir a análise' }, { status: 400 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ erro: 'mentor temporariamente indisponível' }, { status: 503 })
  }

  // Contexto do perfil só ajuda o tom de voz; se vazio, segue sem ele.
  const meta = user.user_metadata?.perfil_academico
  const contextoPerfil = meta?.objetivo
    ? ` (A candidatura do aluno: objetivo delas é ${meta.objetivo}.)`
    : ''

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-lite-latest',
    systemInstruction: PROMPT_REVISAO + contextoPerfil,
  })

  let resultado
  try {
    resultado = await model.generateContentStream(montarPedido(ensaio))
  } catch (err) {
    console.error('gemini análise falhou:', err?.message || err)
    return Response.json({ erro: 'análise não saiu agora, tente de novo' }, { status: 502 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of resultado.stream) {
          const texto = chunk.text()
          if (texto) controller.enqueue(new TextEncoder().encode(texto))
        }
      } catch (err) {
        console.error('stream da análise interrompido:', err?.message || err)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
