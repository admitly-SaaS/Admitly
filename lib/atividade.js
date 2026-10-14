// lib/atividade.js
//
// Os três blocos de RETENÇÃO da fase 2 — todos derivados de dados que o app
// JÁ grava, sem tabela nova e sem migration:
//
//   streak semanal  → semanas seguidas com pelo menos UMA ação real
//                     (salvar redação, tarefa criada, perfil salvo...)
//   prontidão       → nota 0–100 do "quão pronta está minha candidatura",
//                     desmembrada em 4 dimensões com pesos explicados
//   plano da semana → até 3 missões derivadas do estado real, que se
//                     completam sozinhas quando o estado muda — sem checkbox
//                     manual, sem "gestão de falso progresso"
//
// Tudo função pura e testada: a página só coleta (queries com o client de
// RLS do próprio usuário) e chama daqui.
//
// Semana = semana PAN (segunda a domingo), no fuso local do navegador —
// a mesma âncora que o digest usa (segunda-feira).

import { diasAte, formatarData } from './prazos.js'

const DIA_MS = 24 * 60 * 60 * 1000
const SEMANA_MS = 7 * DIA_MS

/** Segunda-feira 00:00 local da semana de `data`. */
export function inicioSemana(data) {
  const d = data instanceof Date ? new Date(data.getTime()) : new Date(data)
  if (Number.isNaN(d.getTime())) return null
  const alvo = new Date(d)
  alvo.setHours(0, 0, 0, 0)
  const desloc = (alvo.getDay() + 6) % 7 // seg=0 … dom=6
  alvo.setDate(alvo.getDate() - desloc)
  return alvo
}

const chaveSemana = (data) => Math.floor((inicioSemana(data)?.getTime() ?? 0) / SEMANA_MS)

// ---- streak ---------------------------------------------------------------

/**
 * Streak semanal: quantas semanas seguidas (terminando na semana atual ou
 * na anterior) têm ao menos uma ação. Semana atual SEM ação não quebra o
 * streak — só o coloca "em risco" (o aluno ainda pode voltar); semanas
 * anteriores vazias interrompem a contagem naquela semana.
 *
 * @param {Array<string|Date>} acoes  timestamps de ações do usuário
 * @param {Date} [agora=]             referência (default: agora do cliente)
 * @returns {{ semanas: number, emRisco: boolean, semanaAtualComAcao: boolean }}
 */
export function calcularStreak(acoes, agora = new Date()) {
  const semanas = new Set()
  for (const a of acoes || []) {
    const data = a instanceof Date ? a : new Date(a)
    if (!Number.isNaN(data?.getTime())) semanas.add(chaveSemana(data))
  }

  if (semanas.size === 0) {
    return { semanas: 0, emRisco: false, semanaAtualComAcao: false }
  }

  // Streak = corrida de semanas consecutivas terminando na semana atual
  // quando ela tem ação — ou terminando na semana passada, quando a atual
  // ainda está sem ação (aí a corrida está "em risco", não perdida).
  const semanaAtualComAcao = semanas.has(chaveSemana(agora))
  let contador = 0
  let cursor = semanaAtualComAcao ? chaveSemana(agora) : chaveSemana(agora) - 1

  for (;;) {
    if (!semanas.has(cursor)) break
    contador += 1
    cursor -= 1
  }

  return { semanas: contador, emRisco: !semanaAtualComAcao && contador > 0, semanaAtualComAcao }
}

/** Frase do streak ("3 semanas seguidas cuidando da sua candidatura"). */
export function linhaStreak(streak) {
  const s = streak || { semanas: 0, emRisco: false }
  if (!s.semanas) return 'Sua primeira semana começa com o próximo passo.'
  if (s.emRisco) {
    return `Você está há ${s.semanas} semana${s.semanas === 1 ? '' : 's'} seguidas — mas esta semana ainda não começou. Um passo recupera a sequência.`
  }
  return `${s.semanas} semana${s.semanas === 1 ? '' : 's'} seguidas cuidando da sua candidatura.`
}

// ---- prontidão -------------------------------------------------------------

// Pesos fixos e explicáveis. A régua é o que o Common App/coach espera:
// perfil contado, candidaturas em roda com checklist, redação finalizada e
// dossiê de atividades.
const PESOS = { perfil: 20, candidaturas: 25, redacoes: 25, atividades: 30 }

/**
 * Nota de prontidão. Clemência por design: checklist sem tarefas registradas
 * não pune (não existe "zero" onde nada foi pedido); sem ensaio, a dimensão
 * conta zero pois é requisito de quase toda candidatura.
 *
 * @param {{ formulario?: object, aplicacoes?: Array, tarefas?: Array, ensaios?: Array, atividades?: Array }} dados
 * @returns {{ score: number, componentes: Array<{ chave, rotulo, ganho, maximo, nota }> }}
 */
export function prontidao({ formulario = {}, aplicacoes = [], tarefas = [], ensaios = [], atividades = [] } = {}) {
  // PERFIL: campos preenchidos (exclui metadados) sobre os 9 canônicos.
  const chaves = ['objetivo', 'idade', 'anoEscolar', 'areaInteresse', 'notas', 'atividades', 'orcamento', 'paisPreferencia', 'nivelIngles']
  const preenchidos = chaves.filter((k) => String(formulario?.[k] ?? '').trim() !== '').length
  const ganhoPerfil = Math.round((preenchidos / chaves.length) * PESOS.perfil)

  // CANDIDATURAS: ativa (+10) + checklist done (% sobre o total; sem tarefas
  // registradas, os 15 pontos não são cobrados).
  const STATUS_FINAIS = new Set(['enviado', 'aceito', 'recusado'])
  const ativas = (aplicacoes || []).filter((ap) => !STATUS_FINAIS.has(String(ap?.status || '').toLowerCase()))
  const totalTarefas = (tarefas || []).length
  const feitas = (tarefas || []).filter((t) => t?.done).length
  let ganhoCandidaturas = 0
  if (ativas.length > 0) {
    ganhoCandidaturas = 10 + (totalTarefas > 0 ? Math.round((feitas / totalTarefas) * 15) : 15)
  }

  // REDAÇÕES: alguma no armário (+10), alguma final (+15).
  const temEnsaio = (ensaios || []).length > 0
  const temFinal = (ensaios || []).some((e) => e?.status === 'final')
  const ganhoRedacoes = temEnsaio ? 10 + (temFinal ? 15 : 0) : 0

  // ATIVIDADES: alguma catalogada (+10), alguma com listagem pronta (+10),
  // três prontas ou mais (+10 de bônus proporcional a 10 do Common App).
  const prontas = (atividades || []).filter((a) => a?.status !== 'em_curso')
  let ganhoAtividades = 0
  if ((atividades || []).length > 0) ganhoAtividades += 10
  if (prontas.length > 0) ganhoAtividades += 10
  if (prontas.length >= 3) ganhoAtividades += 10

  const componentes = [
    { chave: 'perfil', rotulo: 'Perfil', ganho: ganhoPerfil, maximo: PESOS.perfil, nota: `${preenchidos} de ${chaves.length} campos` },
    { chave: 'candidaturas', rotulo: 'Candidaturas', ganho: ganhoCandidaturas, maximo: PESOS.candidaturas, nota: ativas.length ? (totalTarefas ? `${feitas}/${totalTarefas} tarefas` : 'sem tarefas pendentes') : 'nenhuma em roda' },
    { chave: 'redacoes', rotulo: 'Redações', ganho: ganhoRedacoes, maximo: PESOS.redacoes, nota: temFinal ? 'há uma final' : temEnsaio ? 'em escrita' : 'nenhuma' },
    { chave: 'atividades', rotulo: 'Atividades', ganho: ganhoAtividades, maximo: PESOS.atividades, nota: prontas.length ? `${prontas.length} com listagem pronta` : (atividades || []).length ? 'em curso' : 'nenhuma' },
  ]

  const score = componentes.reduce((s, c) => s + c.ganho, 0)
  return { score, componentes }
}

// ---- plano da semana -------------------------------------------------------

/**
 * Até 3 missões derivadas do estado REAL, em ordem prioritária. `done`
 * vem do próprio estado — não de clique: a missão terminou quando o
 * mundo mudou, não quando a caixa foi marcada.
 *
 * @returns {Array<{ id, titulo, detalhe, href, done }>}
 */
export function gerarMissoes({ formulario = {}, aplicacoes = [], tarefas = [], ensaios = [], atividades = [] } = {}) {
  const missoes = []

  // 1 — perfil continha o básico: sem perfil o resto não funciona bem.
  const chaves = ['objetivo', 'idade', 'anoEscolar', 'areaInteresse', 'notas', 'atividades', 'orcamento', 'paisPreferencia', 'nivelIngles']
  const faltantes = chaves.filter((k) => String(formulario?.[k] ?? '').trim() === '')
  if (faltantes.length > 0) {
    missoes.push({
      id: 'perfil',
      titulo: 'Completar o perfil acadêmico',
      detalhe: `${faltantes.length} campo${faltantes.length === 1 ? '' : 's'} em branco — é o que orienta tudo o que vem depois.`,
      href: '/perfil',
      done: false,
    })
  }

  // 2 — candidatura ativa com mais tarefas pendentes.
  const porCandidatura = new Map()
  for (const t of tarefas || []) {
    if (t?.application_id == null) continue
    const atual = porCandidatura.get(t.application_id) || { pendentes: 0, nome: null }
    if (t.done) continue
    atual.pendentes += 1
    porCandidatura.set(t.application_id, atual)
  }
  const nomes = new Map((aplicacoes || []).map((ap) => [ap.id, ap.university || 'candidatura']))
  let melhor = null
  for (const [id, info] of porCandidatura) {
    if (!melhor || info.pendentes > melhor.info.pendentes) melhor = { id, info }
  }
  if (melhor) {
    missoes.push({
      id: 'checklist',
      titulo: `Concluir tarefas de ${nomes.get(melhor.id) || 'sua candidatura'}`,
      detalhe: `${melhor.info.pendentes} tarefa${melhor.info.pendentes === 1 ? '' : 's'} no checklist por fazer.`,
      href: '/aplicacoes',
      done: false,
    })
  }

  // 3 — redação que ainda não é final.
  const ensaioPendente = (ensaios || []).find((e) => e && e.status !== 'final')
  if (ensaioPendente) {
    missoes.push({
      id: 'redacao',
      titulo: `Avançar a redação “${ensaioPendente.title || 'sem título'}”`,
      detalhe: `Está em ${ensaioPendente.status || 'ideia'} — o próximo passo é movê-la em direção a final.`,
      href: '/redacoes',
      done: false,
    })
  }

  // 4 — atividade em curso que ainda não tem listagem pedida.
  const atividadeEmCurso = (atividades || []).find((a) => a?.status === 'em_curso')
  if (atividadeEmCurso) {
    missoes.push({
      id: 'atividade',
      titulo: `Pedir a listagem de “${atividadeEmCurso.nome || 'sua atividade'}”`,
      detalhe: 'A descrição polida do Common App sai da resposta bruta em um clique.',
      href: '/extracurriculares',
      done: false,
    })
  }

  // 5 — radar: para quem já tem perfil e não está em nenhuma candidatura.
  if ((aplicacoes || []).length === 0 && faltantes.length === 0) {
    missoes.push({
      id: 'radar',
      titulo: 'Explorar o radar de oportunidades',
      detalhe: 'Sem candidatura em roda: vale uma volta no catálogo com prazo na vista.',
      href: '/oportunidades',
      done: false,
    })
  }

  // As missões já entram na ordem de prioridade — pendentes primeiro;
  // o chamador corta em 3.
  return missoes.slice(0, 3)
}

/**
 * Uma linha de apoio ao plano: rotulo do próximo prazo ainda vivo entre as
 * candidaturas ativas — a "urgência honesta" do plano da semana.
 */
export function proximoPrazo(aplicacoes) {
  const STATUS_FINAIS = new Set(['enviado', 'aceito', 'recusado'])
  const vivos = (aplicacoes || [])
    .filter((ap) => !STATUS_FINAIS.has(String(ap?.status || '').toLowerCase()))
    .map((ap) => ({ nome: ap.university || 'Candidatura', dias: diasAte(ap?.deadline), data: formatarData(ap?.deadline) }))
    .filter((p) => p.dias != null && p.dias >= 0)
    .sort((a, b) => a.dias - b.dias)
  return vivos[0] || null
}
