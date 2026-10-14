import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { calcularMatches } from '../../../lib/matching'
import { prazoStatus, diasAte } from '../../../lib/prazos'
import { temAssinaturaAtiva } from '../../../lib/subscriptions'
import { sugestoesRedacaoDaMensagem } from '../../../lib/redacoes'

// ===== Prompt do sistema =====
// Regras de ORAÇÕES FALSAS primeiro (saudação, tarefa espontânea) porque são o
// que mais degrada a conversa quando quebradas; depois capacidade, formato, estilo.
const PROMPT_SISTEMA = `Você é o Admitly, um mentor de admissões internacionais que ajuda estudantes brasileiros a conseguirem intercâmbio de curta duração ou uma graduação completa no exterior.

## Orações falsas (nunca faça, em hipótese alguma)
- Nunca comece uma resposta com saudação ("olá", "oi", "bem-vindo", "espero que esteja bem") — a única exceção é a primeira mensagem da conversa inteira, quando ainda não há nenhuma resposta do aluno.
- Nunca elogie a pergunta ("ótima pergunta", "excelente dúvida") nem repita o que o aluno acabou de dizer antes de responder.
- Nunca faça duas perguntas na mesma mensagem. Uma pergunta por vez, aguardando a resposta.
- Nunca gere linhas "TAREFA: " por conta própria — só quando o aluno pedir explicitamente um checklist/próximos passos, ou na primeira resposta a um tópico totalmente novo que exija lista de ações. Recusa ("depois eu vejo", "não quero agora") encerra o assunto: nenhuma tarefa alternativa.
- Nunca invente prazos, valores, bolsas ou requisitos específicos. Se não souber com segurança, diga o que sabe e mande o aluno confirmar no site oficial.
- Nunca repita perguntas que o Perfil do aluno já responde.

## Primeira mensagem
Cumprimente o aluno com boas-vindas e faça a primeira pergunta da entrevista: objetivo (intercâmbio de curta duração, graduação completa fora, ou ainda não decidiu). Depois, um tópico por vez, em ordem, sem explicar as opções em detalhe:
1. Objetivo. 2. Idade e ano escolar. 3. Área de interesse. 4. Notas/desempenho. 5. Atividades extracurriculares. 6. Orçamento aproximado. 7. País ou região de preferência.
Se o Perfil do aluno abaixo já traz respostas, pule esses tópicos — a entrevista já aconteceu.

## Personalização
- Intercâmbio de curta duração: foque em custo, duração, países acessíveis e processos simples.
- Graduação completa: exames (SAT, TOEFL, IELTS), bolsas, prazos por país/universidade.
- Filtre sempre pelo orçamento informado — nunca sugira algo claramente incompatível.
- Oportunidades listadas no contexto ("Oportunidades mais compatíveis") são verificadas e são suas melhores cartas: cite-as pelo nome quando responderem à pergunta do aluno, com prazo e custo. Não recomende oportunidades que não estejam aí nem na conversa.

## Ferramentas proativas
- Redação: quando o aluno falar de uma candidatura que pede redação e ainda não tiver o texto, lembre que ele pode começar o rascunho na aba Redações.
- Cronograma: calibre pelo ano escolar — 1º ano: construção de base, sem pressa; 2º ano: quando começar exames e pesquisa de bolsas; 3º ano/formado: urgente, ações críticas primeiro, direto sem gerar pânico.
- Simulador de competitividade: estimativa honesta com base em notas e atividades — pontos fortes, o que falta, sem prometer aprovação.
- Carta de motivação: rascunho de partida a partir do que o aluno contou; nunca a versão final.

## Formatos (só quando aplicável)
- "TAREFA: " + texto, um por linha, só quando pedido ou num tópico novo que exija ações — e nunca em resposta a confirmação simples ("ok", "entendi"). Exemplo:
TAREFA: Manter notas acima de 9,0 no 1º ano
TAREFA: Pesquisar o nível de inglês necessário para TOEFL ou IELTS
- "UNIVERSIDADE: Nome", em linha isolada, apenas quando o aluno demonstrar intenção real de aplicar — não para menção de passagem, e nunca para universidade que já está na Situação atual do aluno.
- Revisão de texto do aluno: (1) resumo do que o texto comunica, (2) 2–3 pontos fortes citando trechos reais, (3) 2–3 pontos a melhorar com o porquê, honestos mesmo quando doer, (4) reescrita de UMA frase como exemplo, (5) pergunta se quer aprofundar. Nunca elogie texto fraco só por gentileza.

## Idioma e precisão
- Responda no idioma do aluno e mantenha-o até ele trocar.
- Prazos, exigências e valores mudam: avise que é preciso confirmar no site oficial antes de decisões.

## Estilo
Fale como uma pessoa real: frases curtas, diretas, sem emojis em excesso, sem flores de cortesia. Quando discordar ou notar fraqueza no plano, diga com gentileza e sem rodeios. Seja honesto quando o perfil não for competitivo o bastante — sempre junto do que pode ser feito. Admita incerteza em vez de inventar. Trate o aluno como capaz, sem infantilizar.

## Encerramento
Reduza ansiedade com clareza e próximos passos concretos, nunca com promessas. Prefira respostas objetivas e ofereça aprofundar um tópico em vez de despejar tudo de uma vez. Para decisões finais de alto risco (escolha final de universidade, vistos), incentive apoio humano complementar.`

// Converte o perfil_academico (pt-BR, salvo no user_metadata) para o formato
// que o matching lê — mesma conversão feita em app/oportunidades/page.js.
function adaptarPerfil(meta) {
  if (!meta) return null
  return {
    school_year: converterAnoEscolar(meta.anoEscolar),
    area: meta.areaInteresse ?? null,
    budget: meta.orcamento ?? null,
    country_preference: meta.paisPreferencia ?? null,
    goals: meta.objetivo ?? null,
  }
}

function converterAnoEscolar(ano) {
  const mapa = {
    '8º ano do ensino fundamental': '8th',
    '9º ano do ensino fundamental': '9th',
    '1º ano do ensino médio': '9th',
    '2º ano do ensino médio': '10th',
    '3º ano do ensino médio': '11th',
    'já concluí o ensino médio': '12th',
  }
  return mapa[ano] || null
}

// Ordem de prioridade para o contexto do chat: prazo ainda aberto (mais próximo
// primeiro), depois as sem data, e as encerradas por último. Empates preservam
// a ordem por compatibilidade que o matching já calculou.
function priorizarPorPrazo(lista) {
  const peso = (opp) => {
    const { tipo } = prazoStatus(opp)
    if (tipo === 'urgente' || tipo === 'agendada' || tipo === 'aberta') return 0
    if (tipo === 'sem-data') return 1
    return 2
  }

  return [...lista].sort((a, b) => {
    const pa = peso(a)
    const pb = peso(b)
    if (pa !== pb) return pa - pb

    const da = diasAte(a.application_deadline)
    const db = diasAte(b.application_deadline)
    const semPrazo = Number.POSITIVE_INFINITY
    const va = da == null || da < 0 ? semPrazo : da
    const vb = db == null || db < 0 ? semPrazo : db
    return va - vb
  })
}

function montarContexto(perfil, aplicacoes, tarefas, matches) {
  let contexto = ''

  if (perfil && Object.values(perfil).some((v) => v)) {
    contexto += '\n\n## Perfil do aluno (já preenchido, não repita essas perguntas)\n'
    if (perfil.objetivo) contexto += `- Objetivo: ${perfil.objetivo}\n`
    if (perfil.idade) contexto += `- Idade: ${perfil.idade}\n`
    if (perfil.anoEscolar) contexto += `- Ano escolar: ${perfil.anoEscolar}\n`
    if (perfil.areaInteresse) contexto += `- Área de interesse: ${perfil.areaInteresse}\n`
    if (perfil.notas) contexto += `- Notas: ${perfil.notas}\n`
    if (perfil.atividades) contexto += `- Atividades extracurriculares: ${perfil.atividades}\n`
    if (perfil.orcamento) contexto += `- Orçamento: ${perfil.orcamento}\n`
    if (perfil.paisPreferencia) contexto += `- País de preferência: ${perfil.paisPreferencia}\n`
    if (perfil.nivelIngles) contexto += `- Nível de inglês: ${perfil.nivelIngles}\n`
  }

  if ((aplicacoes && aplicacoes.length > 0) || (tarefas && tarefas.length > 0)) {
    contexto += '\n## Situação atual do aluno (dados salvos, não repita perguntas sobre isso)\n'
    if (aplicacoes && aplicacoes.length > 0) {
      contexto += 'Universidades/programas que o aluno já está de olho:\n'
      aplicacoes.forEach((ap) => {
        contexto += `- ${ap.university} (status: ${ap.status || 'pesquisando'}${ap.deadline ? `, prazo: ${ap.deadline}` : ''})\n`
      })
    }
    const tarefasPendentes = (tarefas || []).filter((t) => !t.done)
    if (tarefasPendentes.length > 0) {
      contexto += 'Tarefas ainda pendentes:\n'
      tarefasPendentes.forEach((t) => {
        contexto += `- ${t.title}\n`
      })
    }
  }

  if (matches && matches.length > 0) {
    contexto += '\n## Oportunidades mais compatíveis com o perfil (use para recomendações)\n'
    matches.forEach((m) => {
      const custo =
        m.program_cost != null && m.program_cost !== ''
          ? `, custo ${m.program_cost} ${m.currency}`
          : ''
      contexto += `- ${m.name} (${m.type || 'programa'} · ${m.country || 'global'}) — compatibilidade ${m.compatibility?.level}, ${m.deadline?.text || 'sem prazo definido'}${custo}\n`
      const motivos = (m.compatibility?.reasons || []).slice(0, 2).join('; ')
      if (motivos) contexto += `  Por quê: ${motivos}\n`
    })
  }

  return contexto
}

function montarHistorico(historico, limite = 30) {
  if (!Array.isArray(historico)) return []
  const valido = historico
    .filter((m) => m && typeof m.texto === 'string' && m.texto.trim() !== '' && (m.remetente === 'usuario' || m.remetente === 'admitly'))
    .map((m) => ({
      role: m.remetente === 'usuario' ? 'user' : 'model',
      parts: [{ text: m.texto }],
    }))
  // O Gemini exige que o histórico comece com "user"; a API descarta o resto com erro.
  while (valido.length > 0 && valido[0].role !== 'user') {
    valido.shift()
  }
  return valido.slice(-limite)
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
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
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
  const mensagem = typeof corpo?.mensagem === 'string' ? corpo.mensagem.trim() : ''
  if (!mensagem || mensagem.length > 8000) {
    return Response.json({ erro: 'mensagem vazia ou longa demais' }, { status: 400 })
  }

  const { data: aplicacoes } = await supabase
    .from('applications')
    .select('id, university, status, deadline, details')
    .eq('user_id', user.id)

  // Ensaios servem para NÃO sugerir rascunho de candidatura que já tem redação.
  const { data: ensaios } = await supabase
    .from('essays')
    .select('application_id')
    .eq('user_id', user.id)

  const { data: tarefas } = await supabase
    .from('tasks')
    .select('title, done')
    .eq('user_id', user.id)

  const { data: oportunidades } = await supabase
    .from('opportunities')
    .select('*')

  const perfilAcademico = user.user_metadata?.perfil_academico ?? null
  // O mentor só vê cinco oportunidades: elas precisam ser as que dá para aplicar
  // AGORA. Ordem: prazo mais próximo primeiro, depois as sem data, e as encerradas
  // por último — antes, a ordem por dificuldade escondia justamente os prazos curtos.
  const matches = priorizarPorPrazo(
    calcularMatches(oportunidades || [], adaptarPerfil(perfilAcademico))
  ).slice(0, 6)


  // Quando a mensagem cita uma candidatura que pede redação e ainda sem rascunho,
  // a resposta do chat ganha, no fim, linhas "SUGESTÃO_REDAÇÃO: id | universidade"
  // que a página do chat transforma em chip de 1 clique para /redacoes.
  const sugestoesRedacao = sugestoesRedacaoDaMensagem(
    mensagem,
    aplicacoes || [],
    ensaios || []
  ).slice(0, 3)

  const promptComContexto = PROMPT_SISTEMA + montarContexto(perfilAcademico, aplicacoes, tarefas, matches)

  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ erro: 'mentor temporariamente indisponível' }, { status: 503 })
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-lite-latest',
    systemInstruction: promptComContexto,
  })

  const chat = model.startChat({ history: montarHistorico(corpo.historico) })

  let result
  try {
    result = await chat.sendMessageStream(mensagem)
  } catch (err) {
    console.error('gemini sendMessageStream falhou:', err?.message || err)
    return Response.json({ erro: 'mentor não conseguiu responder agora, tente de novo' }, { status: 502 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          const texto = chunk.text()
          if (texto) controller.enqueue(new TextEncoder().encode(texto))
        }
        if (sugestoesRedacao.length > 0) {
          const linhas = sugestoesRedacao
            .map((s) => `\nSUGESTÃO_REDAÇÃO: ${s.id} | ${s.university}`)
            .join('')
          controller.enqueue(new TextEncoder().encode(linhas))
        }
      } catch (err) {
        console.error('stream do gemini interrompido:', err?.message || err)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
