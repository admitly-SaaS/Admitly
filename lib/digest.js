// lib/digest.js
//
// Conteúdo dos dois e-mails de retenção:
//   digest semanal  → prazos que fecham + progresso real + catálogo próximo
//   alerta de prazo → candidatura ativa fechando em D-7 ou D-2
//
// Divisão que os testes exigem: toda a DECISÃO (o que entra no e-mail, em que
// ordem, com que rótulo) é função pura que recebe as linhas do banco prontas.
// A COLETA (queries + admin client) fica embaixo, isolada, e nunca é testada
// contra dados reais.
//
// Vocabulário de prazo vem de lib/prazos.js (paraData/diasAte/formatarData) —
// o mesmo das telas, então "fecha em 7 dias" no e-mail é literalmente o que
// o aluno vê no site. Candidatura "ativa" = status fora de enviado/aceito/
// recusado (mesma régua da aba /aplicacoes, STATUS_OPCOES).

import { diasAte, formatarData } from './prazos.js'
import { montarEmailBase, urlDoSite } from './email.js'

// 'yale university ' e 'Yale University' são a mesma coisa (o nome veio do
// catálogo e pode ter sido digitado de novo na candidatura).
const normalizarNome = (nome) => String(nome || '').trim().toLowerCase()

export const STATUS_FINAIS = ['enviado', 'aceito', 'recusado']
export const ALVOS_ALERTA = [7, 2]

const ehAtiva = (ap) => !STATUS_FINAIS.includes(String(ap?.status || 'pesquisando').toLowerCase())

// ---- digest: prazos -------------------------------------------------------

/**
 * Candidaturas ativas com prazo dentro da janela (hoje até limiteDias).
 * Prazo nulo/expirado não entra; sem data é explícito quando curto.
 *
 * @returns {Array<{ application_id, university, dias, data, semData }>} ordenado por urgência
 */
export function prazosProximos(aplicacoes, { limiteDias = 14 } = {}) {
  return (aplicacoes || [])
    .filter(ehAtiva)
    .map((ap) => ({ ap, dias: diasAte(ap?.deadline) }))
    .filter(({ dias }) => dias != null && dias >= 0 && dias <= limiteDias)
    .sort((a, b) => a.dias - b.dias)
    .map(({ ap, dias }) => ({
      application_id: ap.id,
      university: ap.university || 'Candidatura sem nome',
      dias,
      data: formatarData(ap.deadline),
      semData: false,
    }))
}

// ---- digest: progresso ----------------------------------------------------

/**
 * Números reais do aluno — o que o e-mail mostra como "seu progresso".
 * Checklist: % de tarefas marcadas sobre o total de tarefas do aluno
 * (todas as candidaturas juntas; zero tarefas = null, sem percentual falso).
 */
export function progressoDaSemana({ aplicacoes = [], tarefas = [], ensaios = [], atividades = [] } = {}) {
  const ativas = (aplicacoes || []).filter(ehAtiva).length
  const totalTarefas = (tarefas || []).length
  const feitas = (tarefas || []).filter((t) => t?.done).length

  const ensaiosPorStatus = { ideia: 0, rascunho: 0, revisao: 0, final: 0 }
  ;(ensaios || []).forEach((e) => {
    if (e?.status in ensaiosPorStatus) ensaiosPorStatus[e.status] += 1
  })

  const prontasAtividades = (atividades || []).filter((a) => a?.status !== 'em_curso').length

  return {
    candidaturas: { ativas, total: (aplicacoes || []).length },
    checklist: totalTarefas > 0 ? { feitas, total: totalTarefas, pct: Math.round((feitas / totalTarefas) * 100) } : null,
    redacoes: { total: (ensaios || []).length, ...ensaiosPorStatus },
    atividades: { total: (atividades || []).length, listagemPronta: prontasAtividades },
  }
}

/** A linha de progresso, como texto para o e-mail ("3 candidaturas · checklist 60% · ..."). */
export function linhaProgresso(progresso) {
  const partes = []
  if (progresso.candidaturas.ativas > 0) partes.push(`${progresso.candidaturas.ativas} candidatura${progresso.candidaturas.ativas === 1 ? '' : 's'} em andamento`)
  if (progresso.checklist) partes.push(`checklist ${progresso.checklist.pct}% (${progresso.checklist.feitas}/${progresso.checklist.total})`)
  if (progresso.redacoes.total > 0) {
    const prontas = progresso.redacoes.final
    partes.push(prontas > 0 ? `${progresso.redacoes.total} redaç${progresso.redacoes.total === 1 ? 'ão' : 'ões'}, ${prontas} final` : `${progresso.redacoes.total} redaç${progresso.redacoes.total === 1 ? 'ão' : 'ões'} em escrita`)
  }
  if (progresso.atividades.total > 0) partes.push(`${progresso.atividades.total} atividade${progresso.atividades.total === 1 ? '' : 's'} no dossiê`)
  return partes.join(' · ')
}

// ---- digest: foto semanal (o Δ da semana) ----------------------------------
// O gancho do "por que abrir": o digest de hoje não mostra só a FOTO atual —
// mostra a MUDANÇA desde o digest da segunda anterior. A foto fica gravada
// por aluno (migration digest_foto, escrita pela service role) e é o que
// permite comparar semana a semana à prova de restart/deploy.

/** Foto compacta do progresso: os números que atravessam semanas na mesma régua. */
export function fotoDaSemana(progresso) {
  const p = progresso || {}
  return {
    tarefasFeitas: p.checklist?.feitas || 0,
    tarefasTotal: p.checklist?.total || 0,
    candidaturasAtivas: p.candidaturas?.ativas || 0,
    redacoesFinal: p.redacoes?.final || 0,
    redacoesTotal: p.redacoes?.total || 0,
    atividadesProntas: p.atividades?.listagemPronta || 0,
  }
}

/**
 * O Δ da semana: hoje menos a foto de uma semana atrás. photoAnterior
 * nula/quebrada = primeira semana (ou snapshot perdido) → null, e o digest
 * fica sem linha de delta — nunca inventamos progresso. Deltas podem ser
 * negativos (aluno apagou tarefa/remarcou) e são reais, não retoque.
 */
export function deltaDaSemana(fotoAnterior, fotoHoje) {
  if (!fotoAnterior || typeof fotoAnterior !== 'object') return null
  const dv = (antes, agora) => (agora || 0) - (antes || 0)
  return {
    tarefasFeitas: dv(fotoAnterior.tarefasFeitas, fotoHoje.tarefasFeitas),
    candidaturasAtivas: dv(fotoAnterior.candidaturasAtivas, fotoHoje.candidaturasAtivas),
    redacoesFinal: dv(fotoAnterior.redacoesFinal, fotoHoje.redacoesFinal),
    atividadesProntas: dv(fotoAnterior.atividadesProntas, fotoHoje.atividadesProntas),
  }
}

/** Delta → texto legível ("+3 tarefas · +1 redação final"). '' quando nada mudou. */
export function linhaDelta(delta) {
  if (!delta) return ''
  const partes = []
  const a = (d, so, st) => {
    if (!d) return null
    // Singular por valor ABSOLUTO: -1 é “-1 tarefa”, não “-1 tarefas”.
    return (d > 0 ? '+' : '') + `${d} ${Math.abs(d) === 1 ? so : st}`
  }
  const tarefas = a(delta.tarefasFeitas, 'tarefa feita', 'tarefas feitas')
  if (tarefas) partes.push(tarefas)
  const redacoes = a(delta.redacoesFinal, 'redação final', 'redações finais')
  if (redacoes) partes.push(redacoes)
  const candidaturas = a(delta.candidaturasAtivas, 'candidatura em andamento', 'candidaturas em andamento')
  if (candidaturas) partes.push(candidaturas)
  const atividades = a(delta.atividadesProntas, 'listagem pronta', 'listagens prontas')
  if (atividades) partes.push(atividades)
  return partes.join(' · ')
}

/** A FRASE do título: "Você avançou N tarefas desde a última segunda".
 * Só existe com tarefa no delta (é o gancho pedido); outros números vão na nota.
 * null = sem tarefa no delta → o item usa o texto cru da linhaDelta. */
export function fraseDelta(delta) {
  if (!delta || !delta.tarefasFeitas) return null
  const n = delta.tarefasFeitas
  const abs = Math.abs(n) === 1 ? '1 tarefa' : `${Math.abs(n)} tarefas`
  return n > 0 ? `Você avançou ${abs} desde a última segunda` : `Você recuou ${abs} desde a última segunda`
}

/** O resto do delta (sem tarefas) + a nota de contexto para o item. */
export function notaDelta(delta) {
  if (!delta) return ''
  const resto = linhaDelta({ ...delta, tarefasFeitas: 0 })
  return resto ? `${resto}. A comparação é com o mesmo resumo de uma semana atrás.` : 'A comparação é com o mesmo resumo de uma semana atrás.'
}

// ---- digest: catálogo -----------------------------------------------------

/**
 * Oportunidades do catálogo com inscrição aberta na janela, que o aluno ainda
 * não favoritou — o gancho do "o radar ainda tem coisa para você". Sem
 * compatibilidade calculada aqui: o e-mail vende a lista, não a nota.
 *
 * @param {Array} oportunidade linhas de opportunities
 * @param {Array<number>} idsFavoritos opportunity_ids favoritados
 * @returns {Array<{ id, name, tipo, dias, data }>} ordenado por prazo, limitado
 */
export function catalogoProximo(oportunidades, idsFavoritos = [], { limite = 3, janelaDias = 21 } = {}) {
  const favoritos = new Set((idsFavoritos || []).map(String))
  return (oportunidades || [])
    .filter((o) => favoritos.has(String(o?.id)) === false)
    .map((o) => ({ o, dias: diasAte(o?.application_deadline) }))
    .filter(({ dias }) => dias != null && dias >= 0 && dias <= janelaDias)
    .sort((a, b) => a.dias - b.dias)
    .slice(0, limite)
    .map(({ o, dias }) => ({
      id: o.id,
      name: o.name || 'Oportunidade sem nome',
      tipo: o.type || '',
      dias,
      data: formatarData(o.application_deadline),
    }))
}

// ---- decisão de envio -----------------------------------------------------

/** Digest sem conteúdo nenhum (nem pessoal, nem catálogo) não é enviado. */
export function valeEnviarDigest({ prazos = [], progresso = null, catalogo = [] } = {}) {
  const temPessoal = prazos.length > 0 || (progresso && linhaProgresso(progresso).length > 0)
  return temPessoal || catalogo.length > 0
}

/**
 * Alertas para favoritos (o radar que virou plano): a candidatura protegida
 * por D-7/D-2 já cobre o que o aluno INICIOU; aqui os favoritos do radar
 * que ainda não viraram candidatura ganham o MESMO ritual. Regra da decisão:
 *   - só o alvo exato (D-7/D-2) — o favorito fora dos alvos espera o digest;
 *   - encerrado/sem prazo nunca dispara (fora dos alvos, sem data);
 *   - favorito cujo nome já é uma candidatura ATIVA do aluno NÃO dispara
 *     separado — o alerta de candidatura já cobre, evita dois e-mails do
 *     mesmo prazo. Candidatura finalizada não reserva nome (o favorito
 *     volta a ser alertado).
 *
 * @returns {Array<{ opportunity_id, university, dias, data, link }>}
 */
export function alertasDeFavoritos(oportunidades, idsFavoritos = [], { alvos = ALVOS_ALERTA, nomesReservados = [] } = {}) {
  const favoritos = new Set((idsFavoritos || []).map(String))
  const alvosConj = new Set(alvos)
  const reservados = new Set((nomesReservados || []).map(normalizarNome))
  return (oportunidades || [])
    .filter((o) => favoritos.has(String(o?.id)))
    .map((o) => ({ o, dias: diasAte(o?.application_deadline) }))
    .filter(({ dias }) => dias != null && alvosConj.has(dias))
    .filter(({ o }) => !reservados.has(normalizarNome(o?.name)))
    .sort((a, b) => a.dias - b.dias)
    .map(({ o, dias }) => ({
      opportunity_id: o.id,
      university: o.name || 'Oportunidade sem nome',
      dias,
      data: formatarData(o.application_deadline),
      link: urlDoSite('/oportunidades'),
    }))
}

// ---- alerta de prazo ------------------------------------------------------

/**
 * Candidaturas ativas cujo prazo cai exatamente em ALVOS_ALERTA dias (D-7/D-2).
 * Um e-mail por candidatura — o leitor abre, age, fecha.
 *
 * @returns {Array<{ application_id, university, dias, data, link }>}
 */
export function alertasDePrazo(aplicacoes, { alvos = ALVOS_ALERTA } = {}) {
  const conjunto = new Set(alvos)
  return (aplicacoes || [])
    .filter(ehAtiva)
    .map((ap) => ({ ap, dias: diasAte(ap?.deadline) }))
    .filter(({ dias }) => dias != null && conjunto.has(dias))
    .sort((a, b) => a.dias - b.dias)
    .map(({ ap, dias }) => ({
      application_id: ap.id,
      university: ap.university || 'Candidatura sem nome',
      dias,
      data: formatarData(ap.deadline),
      link: urlDoSite('/aplicacoes'),
    }))
}

export function valeEnviarAlerta(alertas) {
  return (alertas || []).length > 0
}

// ---- HTML -----------------------------------------------------------------

const DIAS_ROTULO = (dias) => (dias === 0 ? 'FECHA HOJE' : dias === 1 ? 'FECHA AMANHÃ' : `FALTAM ${dias} DIAS`)

const COR_URGENCIA = (dias) => (dias <= 2 ? '#A6301F' : dias <= 7 ? '#B98A2F' : '#1A4D3A')

/** HTML do digest semanal. `dados` é a saída combinada das funções puras acima. */
export function montarDigestHtml(dados) {
  const { primeiroNome = null, prazos = [], progresso = null, catalogo = [], delta = null } = dados || {}

  const secaoPrazos = {
    num: 'I',
    titulo: 'Prazos que fecham',
    itens: prazos.map((p) => ({
      rotulo: DIAS_ROTULO(p.dias),
      cor: COR_URGENCIA(p.dias),
      titulo: p.university,
      nota: p.data ? `Fecha em ${p.data}` : null,
      lado: 'ABRIR',
    })),
  }

  const secaoProgresso = progresso && {
    num: 'II',
    titulo: 'Sua semana',
    itens: [
      {
        rotulo: 'REAL',
        cor: '#1F3A5F',
        titulo: linhaProgresso(progresso) || 'Seu perfil ainda está em branco',
        nota: 'O checklist, as redações e as atividades estão no site — esta é a foto de hoje.',
      },
    ],
  }

  // O Δ da semana: a mudança desde o digest anterior. Só entra com números
  // reais contadas sobre a foto gravada — primeira semana ou foto perdida
  // significa SEM delta (nada de “+0 tarefas” inventado para caber).
  const textoDelta = linhaDelta(delta)
  if (secaoProgresso && textoDelta) {
    secaoProgresso.itens.push({
      rotulo: 'DESDE A ÚLTIMA',
      cor: '#1A4D3A',
      // Com tarefa no delta, o título é a frase natural; sem tarefa (só
      // redação/listagem), entra o texto crua da linha delta.
      titulo: fraseDelta(delta) || textoDelta,
      nota: notaDelta(delta),
    })
  }

  const secaoCatalogo = {
    num: 'III',
    titulo: 'No radar, com prazo em vista',
    itens: catalogo.map((o) => ({
      rotulo: o.tipo ? String(o.tipo).slice(0, 18).toUpperCase() : 'OPORTUNIDADE',
      titulo: o.name,
      nota: o.data ? `Inscrições fecham em ${o.data}` : null,
      lado: 'VER',
    })),
  }

  return montarEmailBase({
    preheader: 'Prazos, progresso e o que ainda cabe na sua candidatura.',
    cartucho: primeiroNomeDe(primeiroNome) ? `ADMITLY · PARA ${String(primeiroNome).toUpperCase()}` : 'ADMITLY · SUA SEMANA',
    titulo: 'Sua semana no caminho até a admissão',
    nota: 'Uma olhada leva dois minutos — e dois minutos hoje valem mais que uma tarde perdida na semana do prazo.',
    secoes: [secaoPrazos, secaoProgresso, secaoCatalogo].filter(Boolean),
    rodape: 'Você recebe este resumo porque tem candidaturas no Admitly. Para parar de receber, responda a este e-mail ou use as preferências no seu perfil.',
  })
}

/** HTML do alerta de prazo — um por candidatura, curto e urgente. */
export function montarAlertaHtml(alerta) {
  const a = alerta || {}
  const urgente = a.dias <= 2
  return montarEmailBase({
    preheader: a.dias === 0 ? 'O prazo é hoje.' : a.dias === 1 ? 'O prazo é amanhã.' : `Faltam ${a.dias} dias.`,
    cartucho: urgente ? 'ADMITLY · PRAZO CRÍTICO' : 'ADMITLY · AGENDADO',
    titulo: a.university || 'Candidatura',
    nota: `${DIAS_ROTULO(a.dias)} — inscrições fecham em ${a.data || 'data não informada'}. ${urgente ? 'Se a candidatura está em andamento, finalize hoje.' : 'Ainda há tempo para terminar o checklist com calma.'}`,
    secoes: [
      {
        num: 'I',
        titulo: 'O que fazer agora',
        itens: [
          {
            rotulo: 'AÇÃO',
            cor: urgente ? '#A6301F' : '#1A4D3A',
            titulo: urgente ? 'Confira o checklist e envie' : 'Reserve 30 minutos e confira o checklist',
            nota: 'Abra a candidatura no site: as tarefas pendentes estão lá, uma a uma.',
            lado: 'ABRIR',
          },
        ],
      },
    ],
    rodape: 'Este alerta acompanha as candidaturas que você registrou no Admitly. Prazos mudam — confirme sempre na página oficial da universidade.',
  })
}

function primeiroNomeDe(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || ''
}

// ---- coleta (nunca testada contra banco real) ##############################
//
// adminClient = client criado com SUPABASE_SERVICE_ROLE_KEY, no padrão do
// webhook-kiwify: bypassa RLS porque o cron lê e escreve por TODOS os alunos.
// Nada daqui vai para o navegador — só rotas de cron importam este bloco.

export async function coletarDadosDoUsuario(adminClient, userId) {
  const [aplicacoes, tarefas, ensaios, atividades, favoritos] = await Promise.all([
    adminClient.from('applications').select('id, university, status, deadline, created_at').eq('user_id', userId),
    adminClient.from('tasks').select('id, application_id, done').eq('user_id', userId),
    adminClient.from('essays').select('id, status').eq('user_id', userId),
    // A aba extracurriculares pode ainda não ter sido migrada no painel:
    // falha aqui degrada para lista vazia, nunca quebra o digest.
    adminClient.from('extracurriculares').select('id, status').eq('user_id', userId).then(
      (r) => r,
      () => ({ data: [] })
    ),
    adminClient.from('favorites').select('opportunity_id').eq('user_id', userId),
  ])

  return {
    aplicacoes: aplicacoes?.data || [],
    tarefas: tarefas?.data || [],
    ensaios: ensaios?.data || [],
    atividades: Array.isArray(atividades?.data) ? atividades.data : [],
    favoritos: (favoritos?.data || []).map((f) => f.opportunity_id),
  }
}

export async function catalogo(adminClient) {
  const { data } = await adminClient
    .from('opportunities')
    .select('id, name, type, application_deadline')
    .not('application_deadline', 'is', null)
    .order('application_deadline', { ascending: true })
  return data || []
}

/** Dados do digest já decididos, prontos para montarDigestHtml. */
export function decidirDigest(dadosColetados, catalogoAtual, { limiteDiasPrazo = 14, fotoAnterior = null } = {}) {
  const progresso = progressoDaSemana(dadosColetados)
  const prazos = prazosProximos(dadosColetados.aplicacoes, { limiteDias: limiteDiasPrazo })
  const opcoes = catalogoProximo(catalogoAtual, dadosColetados.favoritos)
  const fotoHoje = fotoDaSemana(progresso)
  const delta = deltaDaSemana(fotoAnterior, fotoHoje)
  return {
    prazos,
    progresso,
    catalogo: opcoes,
    delta,
    fotoHoje,
    vale: valeEnviarDigest({ prazos, progresso, catalogo: opcoes }),
  }
}
