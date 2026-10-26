'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { prazoStatus, formatarData } from '../../lib/prazos.js'
import { temAssinaturaAtiva } from '../../lib/subscriptions.js'
import { TIPOS, carregarDocumentos, gravarEstado, proximoEstado, desmarcarEstado, criticosFaltando } from '../../lib/documentos.js'

// Acompanhamento das candidaturas no design v3 (papel, Caslon, azul-tinta).
// A linguagem visual é a mesma do catálogo: dot de status, mono para dados,
// progresso em lacre e vermelho só para urgência real e erro.

const STATUS_OPCOES = ['pesquisando', 'em andamento', 'enviado', 'aceito', 'recusado']

// Um dot por status: neutro → em progresso → enviado → aceito (acento) / recusado.
const STATUS_DOT = {
  pesquisando: 'dot--tinta',
  'em andamento': 'dot--vazado',
  enviado: 'dot--lacre',
  aceito: 'dot--acento',
  recusado: 'dot--vermelho',
}

const GRUPOS_UNIVERSIDADE = [
  {
    titulo: 'Candidatura',
    campos: [
      { campo: 'course', label: 'Curso ou programa', placeholder: 'Ex: Engenharia' },
      { campo: 'location', label: 'País e cidade', placeholder: 'Ex: Boston, EUA' },
      { campo: 'intake', label: 'Período de entrada', placeholder: 'Ex: Fall 2027' },
      { campo: 'applicationType', label: 'Tipo de candidatura', placeholder: 'Ex: Graduação' },
    ],
  },
  {
    titulo: 'Dinheiro',
    campos: [
      { campo: 'tuition', label: 'Mensalidade ou tuition', placeholder: 'Ex: US$ 40 mil/ano' },
      { campo: 'livingCost', label: 'Moradia e custo de vida', placeholder: 'Ex: US$ 18 mil/ano' },
      { campo: 'applicationFee', label: 'Taxa de candidatura', placeholder: 'Ex: US$ 90' },
      { campo: 'scholarship', label: 'Bolsa ou auxílio', placeholder: 'Ex: Need-based' },
    ],
  },
  {
    titulo: 'Links e verificação',
    campos: [
      { campo: 'officialApplicationUrl', label: 'Link oficial de admissões', type: 'url', placeholder: 'https://...' },
      { campo: 'officialRequirementsUrl', label: 'Link oficial de requisitos', type: 'url', placeholder: 'https://...' },
      { campo: 'officialFinancialAidUrl', label: 'Link oficial de bolsas', type: 'url', placeholder: 'https://...' },
      { campo: 'lastVerifiedAt', label: 'Última verificação', type: 'date' },
    ],
  },
]

const GRUPOS_PROGRAMA = [
  {
    titulo: 'Programa',
    campos: [
      { campo: 'programType', label: 'Tipo de programa', placeholder: 'Ex: Summer Program' },
      { campo: 'provider', label: 'Instituição', placeholder: 'Ex: Yale University' },
      { campo: 'location', label: 'Localização', placeholder: 'Ex: Estados Unidos' },
      { campo: 'locationType', label: 'Formato', placeholder: 'Ex: Presencial, Online, Híbrido' },
    ],
  },
  {
    titulo: 'Exigências e dinheiro',
    campos: [
      { campo: 'cost', label: 'Custo do programa', placeholder: 'Ex: US$ 6.500' },
      { campo: 'minimumGpa', label: 'GPA mínimo', placeholder: 'Ex: 3.5' },
      { campo: 'scholarship', label: 'Bolsa ou auxílio', placeholder: 'Ex: Bolsa integral disponível' },
      { campo: 'requirements', label: 'Requisitos', placeholder: 'Ex: redação, entrevista' },
    ],
  },
  {
    titulo: 'Links e verificação',
    campos: [
      { campo: 'officialUrl', label: 'Site oficial', type: 'url', placeholder: 'https://...' },
      { campo: 'lastVerifiedAt', label: 'Última verificação', type: 'date' },
    ],
  },
]

const ESCUDO = (
  <svg className="marca-mini-escudo" viewBox="-60 -74 120 158" role="img" aria-label="Escudo Admitly">
    <path d="M-56 -70 L56 -70 L56 5 C56 45 28 68 0 80 C-28 68 -56 45 -56 5 Z" fill="#F6F2EA" stroke="#1F3A5F" strokeWidth="5.5" />
    <g transform="translate(0 -10) scale(1.02)">
      <polygon points="-39,-9 39,-9 0,-36" fill="#1F3A5F" />
      <rect x="-35" y="-6" width="70" height="4.5" fill="#1F3A5F" />
      <rect x="-29" y="-1.5" width="10" height="25" fill="#1F3A5F" />
      <rect x="-5" y="-1.5" width="10" height="25" fill="#1F3A5F" />
      <rect x="19" y="-1.5" width="10" height="25" fill="#1F3A5F" />
      <rect x="-36" y="23.5" width="72" height="4" fill="#1F3A5F" />
      <rect x="-40" y="27.5" width="80" height="4.5" fill="#1F3A5F" />
    </g>
  </svg>
)

export default function Aplicacoes() {
  const router = useRouter()
  const [userId, setUserId] = useState(null)
  const [aplicacoes, setAplicacoes] = useState([])
  const [tarefas, setTarefas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [novaUniversidade, setNovaUniversidade] = useState('')
  const [novasTarefas, setNovasTarefas] = useState({})
  const [novaTarefaGeral, setNovaTarefaGeral] = useState('')
  const [detalhesAbertos, setDetalhesAbertos] = useState({})
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(null)
  const [mensagem, setMensagem] = useState(null)
  const [menuAberto, setMenuAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [documentos, setDocumentos] = useState(() => new Map())
  const [erroDocumentos, setErroDocumentos] = useState(false)

  const carregarDados = async (uid) => {
    const { data: aps } = await supabase
      .from('applications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true })

    const { data: tks } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true })

    setAplicacoes(aps || [])
    setTarefas(tks || [])

    // Mapa de documentos (feedback 15/10): degrada em aviso quando a migration
    // application_documents ainda não rodou — marcação desativada, sem fingir.
    const docs = await carregarDocumentos(uid, supabase)
    setDocumentos(docs.documentos || new Map())
    setErroDocumentos(docs.error?.code === 'TABELA_AUSENTE')

    setCarregando(false)
  }

  useEffect(() => {
    const iniciar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      // Assinatura obrigatória, como no /chat: sem ela, vai direto para o paywall.
      const ativa = await temAssinaturaAtiva(supabase, user.id)
      if (!ativa) {
        router.push('/assinar')
        return
      }
      setUserId(user.id)
      await carregarDados(user.id)
    }
    iniciar()
  }, [router])

  const avisar = (texto, tipo = 'ok') => {
    setMensagem({ texto, tipo })
    setTimeout(() => setMensagem(null), 5000)
  }

  const sair = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const adicionarUniversidade = async (event) => {
    event?.preventDefault()
    const nome = novaUniversidade.trim()
    if (!nome || !userId) return

    setSalvando(true)
    // Nome repetido cria uma segunda candidatura idêntica: avisa em vez de duplicar.
    const { data: existente } = await supabase
      .from('applications')
      .select('id')
      .eq('user_id', userId)
      .ilike('university', nome)
      .maybeSingle()

    if (existente) {
      setSalvando(false)
      avisar(`"${nome}" já está nas suas candidaturas.`, 'erro')
      return
    }

    const { error } = await supabase
      .from('applications')
      .insert({ user_id: userId, university: nome, details: { model: 'university' } })

    setSalvando(false)
    if (error) {
      avisar('Não foi possível adicionar agora. Tente de novo.', 'erro')
      return
    }
    setNovaUniversidade('')
    avisar(`"${nome}" entrou nas suas candidaturas.`)
    carregarDados(userId)
  }

  // O banco só desliga o vínculo das tarefas (application_id → null) quando a
  // candidatura sai; sem isto elas reapareceriam como metas gerais — o oposto
  // do que a confirmação promete. Some com o checklist junto.
  const removerUniversidade = async (id) => {
    setConfirmandoRemocao(null)

    const doChecklist = tarefas.filter((t) => t.application_id === id)
    setAplicacoes((prev) => prev.filter((a) => a.id !== id))
    setTarefas((prev) => prev.filter((t) => t.application_id !== id))

    const { error } = await supabase.from('applications').delete().eq('id', id)
    if (error) {
      avisar('Não foi possível remover agora. Tente de novo.', 'erro')
      carregarDados(userId)
      return
    }

    if (doChecklist.length > 0) {
      await supabase.from('tasks').delete().in('id', doChecklist.map((t) => t.id))
    }

    avisar('Candidatura e checklist removidos.')
  }

  const atualizarStatus = async (id, status) => {
    setAplicacoes((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
    await supabase.from('applications').update({ status }).eq('id', id)
  }

  const atualizarPrazo = async (id, deadline) => {
    setAplicacoes((prev) => prev.map((a) => (a.id === id ? { ...a, deadline } : a)))
    await supabase.from('applications').update({ deadline: deadline || null }).eq('id', id)
  }

  const atualizarDetalhe = async (id, campo, valor) => {
    const aplicacaoAtual = aplicacoes.find((ap) => ap.id === id)
    const details = { ...(aplicacaoAtual?.details || {}), [campo]: valor }
    setAplicacoes((prev) => prev.map((a) => (a.id === id ? { ...a, details } : a)))
    await supabase.from('applications').update({ details }).eq('id', id)
  }

  const adicionarTarefa = async (applicationId, titulo) => {
    const texto = titulo?.trim()
    if (!texto || !userId) return

    const { error } = await supabase
      .from('tasks')
      .insert({ user_id: userId, title: texto, application_id: applicationId })

    if (error) {
      avisar('Não foi possível salvar a tarefa.', 'erro')
      return
    }

    // Limpa o campo certo (o geral usa a chave 'geral').
    if (applicationId) setNovasTarefas((prev) => ({ ...prev, [applicationId]: '' }))
    else setNovaTarefaGeral('')

    carregarDados(userId)
  }

  const alternarTarefa = async (id, doneAtual) => {
    setTarefas((prev) => prev.map((t) => (t.id === id ? { ...t, done: !doneAtual } : t)))
    await supabase.from('tasks').update({ done: !doneAtual }).eq('id', id)
  }

  const removerTarefa = async (id) => {
    setTarefas((prev) => prev.filter((t) => t.id !== id))
    await supabase.from('tasks').delete().eq('id', id)
  }

  // Mapa de documentos: um toque cicla falta → pedindo → pronto → falta.
  // 'nao-pede' é escolhido pelo botão pequeno, para não atrapalhar o ciclo.
  // Otimista no Map local; erro de escrita volta ao estado anterior e avisa.
  const mudarDocumento = async (applicationId, tipo, novoEstado) => {
    const chave = `${applicationId}__${tipo}`
    const anterior = documentos.get(chave) || 'falta'
    setDocumentos((prev) => {
      const proximo = new Map(prev)
      proximo.set(chave, novoEstado)
      return proximo
    })

    const { error } = await gravarEstado(userId, applicationId, tipo, novoEstado, supabase)
    if (error) {
      setDocumentos((prev) => {
        const volta = new Map(prev)
        volta.set(chave, anterior)
        return volta
      })
      avisar(error.code === 'TABELA_AUSENTE'
        ? 'O mapa de documentos não está ativo ainda (migration pendente no painel).'
        : 'Não foi possível salvar a marcação.', 'erro')
    }
  }

  const ciclarDocumento = (applicationId, tipo) => {
    const estadoAtual = documentos.get(`${applicationId}__${tipo}`) || 'falta'
    mudarDocumento(applicationId, tipo, proximoEstado(estadoAtual))
  }

  const tarefasGerais = tarefas.filter((t) => !t.application_id)
  const tarefasAbertas = tarefas.filter((t) => !t.done).length

  // Candidaturas ordenadas por urgência: prazo aberto mais próximo primeiro,
  // sem data depois, encerradas por último (mesma lógica do catálogo).
  const ordenadas = useMemo(() => {
    const peso = (ap) => {
      const { tipo } = prazoStatus({ application_deadline: ap.deadline })
      if (tipo === 'urgente' || tipo === 'agendada' || tipo === 'aberta') return 0
      if (tipo === 'sem-data') return 1
      return 2
    }
    return [...aplicacoes].sort((a, b) => {
      const pa = peso(a)
      const pb = peso(b)
      if (pa !== pb) return pa - pb
      const da = prazoStatus({ application_deadline: a.deadline }).dias
      const db = prazoStatus({ application_deadline: b.deadline }).dias
      const semPrazo = Number.POSITIVE_INFINITY
      const va = da == null || da < 0 ? semPrazo : da
      const vb = db == null || db < 0 ? semPrazo : db
      if (va !== vb) return va - vb
      return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })
  }, [aplicacoes])

  const proximoPrazo = ordenadas[0] && pesoAberto(ordenadas[0]) ? prazoStatus({ application_deadline: ordenadas[0].deadline }) : null

  if (carregando) {
    return (
      <main className="apl-pagina">
        <style>{CSS}</style>
        <p className="carregando">Carregando suas candidaturas...</p>
      </main>
    )
  }

  return (
    <main className="apl-pagina">
      <style>{CSS}</style>

      {/* ===== topo (mesma anatomia de /chat, /perfil e /oportunidades) ===== */}
      <header className="apl-topo">
        <div className="marca-mini">
          {ESCUDO}
          <span>Admitly</span>
        </div>

        <nav className="apl-nav">
          <a href="/oportunidades">Oportunidades</a>
          <a href="/aplicacoes" className="ativo" aria-current="page">Aplicações</a>
          <a href="/redacoes">Redações</a>
          <a href="/extracurriculares">Extracurriculares</a>
          <a href="/perfil">Perfil</a>
          <a href="/chat">Voltar ao chat</a>
          <div className="menu-conta">
            <button
              type="button"
              className="btn-conta"
              onClick={() => setMenuAberto((v) => !v)}
              aria-label="Menu da conta"
              aria-expanded={menuAberto}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
            {menuAberto && (
              <>
                <button type="button" className="menu-scrim" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} />
                <div className="menu-popover" role="menu">
                  <a href="/perfil" role="menuitem">Meu perfil acadêmico</a>
                  <button type="button" role="menuitem" className="menu-sair" onClick={sair}>Sair da conta</button>
                </div>
              </>
            )}
          </div>
        </nav>
      </header>

      <div className="apl-folha">
        <header className="apl-cabecalho">
          <span className="caps-sec">Suas candidaturas</span>
          <h1>Minhas <em>candidaturas</em>.</h1>
          <p className="apl-intro">
            Cada candidatura reúne prazo, custo e o checklist dela. O que tem prazo mais próximo
            aparece primeiro — o resto espera a vez.
          </p>
          <p className="apl-meta">
            <span>
              {aplicacoes.length} {aplicacoes.length === 1 ? 'CANDIDATURA' : 'CANDIDATURAS'}
              {' · '}
              {tarefasAbertas} {tarefasAbertas === 1 ? 'TAREFA ABERTA' : 'TAREFAS ABERTAS'}
            </span>
            <span>{proximoPrazo ? `PRÓXIMO PRAZO: ${proximoPrazo.rotuloMono.replace('FECHA EM ', '')}` : 'SEM PRAZO DEFINIDO'}</span>
          </p>
        </header>

        {/* ===== adicionar candidatura ===== */}
        <form className="apl-adicionar" onSubmit={adicionarUniversidade}>
          <div className="campo">
            <label className="caps-sec" htmlFor="nova-candidatura">Adicionar candidatura</label>
            <input
              id="nova-candidatura"
              type="text"
              value={novaUniversidade}
              onChange={(e) => setNovaUniversidade(e.target.value)}
              placeholder="universidade ou programa — ex: Stanford, MIT, OBMEP"
              autoComplete="off"
            />
          </div>
          <button type="submit" className="btn-primario" disabled={salvando || !novaUniversidade.trim()}>
            {salvando ? 'Adicionando...' : 'Adicionar'}
          </button>
        </form>

        {mensagem && (
          <p className={`apl-mensagem ${mensagem.tipo === 'erro' ? 'apl-mensagem--erro' : 'apl-mensagem--ok'}`} role="status">
            {mensagem.texto}
          </p>
        )}

        {aplicacoes.length === 0 && tarefasGerais.length === 0 && (
          <div className="apl-painel">
            <p className="apl-painel-titulo">Nenhuma candidatura por aqui ainda.</p>
            <p className="apl-painel-texto">
              Peça um plano no chat — quando você menciona uma universidade ou um programa, o
              Admitly oferece adicionar à sua lista. Ou digite o nome acima.
            </p>
            <div className="apl-painel-acoes">
              <a className="btn-primario" href="/chat">Abrir o chat</a>
              <a className="btn-secundario" href="/oportunidades">Ver oportunidades</a>
            </div>
          </div>
        )}

        {/* ===== candidaturas ===== */}
        {ordenadas.map((ap) => {
          const tarefasDaAplicacao = tarefas.filter((t) => t.application_id === ap.id)
          const concluidas = tarefasDaAplicacao.filter((t) => t.done).length
          const progresso = tarefasDaAplicacao.length > 0 ? Math.round((concluidas / tarefasDaAplicacao.length) * 100) : 0
          const modelo = ap.details?.model === 'program' ? 'program' : 'university'
          const status = ap.status || 'pesquisando'
          const prazo = prazoStatus({ application_deadline: ap.deadline })
          // Sugestão automática (feedback 16/10): críticos em falta quando
          // o prazo entra na janela crítica (< 30 dias). Pura da lib.
          const criticos = criticosFaltando(documentos, ap.id, prazo.dias)
          const dados = linhaDados(ap, modelo)
          const custo = linhaCusto(ap, modelo)

          const links = (modelo === 'university'
            ? [
                ['Admissões', ap.details?.officialApplicationUrl],
                ['Requisitos', ap.details?.officialRequirementsUrl],
                ['Bolsas', ap.details?.officialFinancialAidUrl],
              ]
            : [['Site oficial', ap.details?.officialUrl]]
          ).filter(([, url]) => url)

          return (
            <article className="apl-cartao" key={ap.id}>
              <div className="apl-cartao-topo">
                <span>
                  {modelo === 'university' ? 'UNIVERSIDADE' : 'PROGRAMA'}
                  {ap.created_at ? ` · ADICIONADA EM ${formatarData(ap.created_at)}` : ''}
                </span>
                <span className="tag-status">
                  <i className={`dot ${prazo.dot}`} aria-hidden="true" />
                  {prazo.rotulo.toUpperCase()}
                </span>
              </div>

              <h2 className="apl-cartao-nome">{ap.university || 'Sem nome'}</h2>

              {dados && <p className="apl-cartao-dados">{dados}</p>}
              {custo && <p className="apl-cartao-dados apl-cartao-dados--custo">{custo}</p>}
              {modelo === 'program' && ap.details?.requirements && (
                <p className="apl-nota">
                  <i className="dot dot--tinta" aria-hidden="true" />
                  <span>Requer: {ap.details.requirements}</span>
                </p>
              )}

              {links.length > 0 && (
                <p className="apl-links">
                  {links.map(([label, url]) => (
                    <a key={label} href={url} target="_blank" rel="noreferrer" className="btn-link">
                      {label} ↗
                    </a>
                  ))}
                </p>
              )}

              {/* status e prazo: os dois campos que mudam */}
              <div className="apl-controles">
                <span className="apl-status">
                  <i className={`dot ${STATUS_DOT[status] || 'dot--tinta'}`} aria-hidden="true" />
                  <select
                    value={status}
                    onChange={(e) => atualizarStatus(ap.id, e.target.value)}
                    aria-label={`Status de ${ap.university || 'candidatura'}`}
                  >
                    {STATUS_OPCOES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </span>

                <span className="apl-prazo">
                  <input
                    type="date"
                    value={ap.deadline || ''}
                    onChange={(e) => atualizarPrazo(ap.id, e.target.value)}
                    aria-label={`Prazo de ${ap.university || 'candidatura'}`}
                  />
                  <span className={`apl-prazo-rotulo ${prazo.tipo === 'urgente' ? 'apl-prazo-rotulo--urgente' : ''}`}>
                    {prazo.data ? prazo.rotuloMono : 'SEM DATA DE INSCRIÇÃO'}
                  </span>
                </span>
              </div>

              <button
                type="button"
                className="apl-toggle"
                aria-expanded={!!detalhesAbertos[ap.id]}
                onClick={() => setDetalhesAbertos((prev) => ({ ...prev, [ap.id]: !prev[ap.id] }))}
              >
                {detalhesAbertos[ap.id] ? '− Ocultar detalhes da candidatura' : '+ Completar detalhes da candidatura'}
              </button>

              {detalhesAbertos[ap.id] && (
                <div className="apl-detalhes">
                  {/* Mapa de documentos (feedback 15/10): o que já tem, o que
                      está pedido e o que falta — por candidatura. */}
                  <section className="apl-docmaps" aria-label={`Mapa de documentos de ${ap.university || 'candidatura'}`}>
                    <div className="apl-docmaps-cabecalho">
                      <span className="caps-sec">Mapa de documentos</span>
                      {(() => {
                        const contam = TIPOS.filter((t) => documentos.get(`${ap.id}__${t.id}`) !== 'nao-pede')
                        const prontos = contam.filter((t) => documentos.get(`${ap.id}__${t.id}`) === 'pronto').length
                        return (
                          <span className="mono-linha">
                            {erroDocumentos
                              ? 'INDISPONÍVEL — MIGRATION PENDENTE'
                              : contam.length === 0
                                ? 'NENHUM DOCUMENTO EXIGIDO'
                                : `${prontos} DE ${contam.length} EM MÃOS`}
                          </span>
                        )
                      })()}
                    </div>

                    {erroDocumentos && (
                      <p className="apl-docmap-aviso">
                        O mapa de documentos depende da migration <code>application_documents</code> — aplique-a no painel do Supabase.
                      </p>
                    )}

                    <ul className="apl-docmap-lista">
                      {TIPOS.map((t) => {
                        const chave = `${ap.id}__${t.id}`
                        const estado = documentos.get(chave) || 'falta'
                        // Sugestão automática (feedback 16/10): prazo < 30 dias
                        // e crítico ainda em falta → destaque de urgência.
                        const critico = criticos.some((c) => c.id === t.id) && estado === 'falta'
                        return (
                          <li key={t.id} className={`apl-docmap-item apl-docmap-item--${estado} ${critico ? 'apl-docmap-item--critico' : ''}`}>
                            <button
                              type="button"
                              className="apl-docmap-nome"
                              onClick={() => ciclarDocumento(ap.id, t.id)}
                              disabled={erroDocumentos}
                              title={`Estado atual: ${estado}. Toque para avançar (falta → pedindo → pronto).`}
                            >
                              <i className={`dot dot--${estado}`} aria-hidden="true" />
                              <span>{t.nome}</span>
                              <em>
                                {critico
                                  ? `CRÍTICO · FECHA EM ${prazo.dias} ${prazo.dias === 1 ? 'DIA' : 'DIAS'}`
                                  : estado === 'falta'
                                    ? t.dica
                                    : estado === 'pedindo'
                                      ? 'pedindo…'
                                      : estado === 'pronto'
                                        ? 'em mãos ✓'
                                        : 'não pede'}
                              </em>
                            </button>
                            <button
                              type="button"
                              className="apl-docmap-nao-pede"
                              onClick={() => mudarDocumento(ap.id, t.id, estado === 'nao-pede' ? 'falta' : 'nao-pede')}
                              disabled={erroDocumentos}
                              aria-pressed={estado === 'nao-pede'}
                              title={estado === 'nao-pede' ? 'Voltar para “falta”' : 'Esta candidatura não pede esse documento'}
                            >
                              {estado === 'nao-pede' ? 'pede sim' : 'não pede'}
                            </button>
                            {(estado === 'pedindo' || estado === 'pronto') && (
                              <button
                                type="button"
                                className="apl-docmap-desmarcar"
                                onClick={() => mudarDocumento(ap.id, t.id, desmarcarEstado(estado))}
                                disabled={erroDocumentos}
                                title={`Desmarcar: “${estado === 'pedindo' ? 'pedindo' : 'em mãos'}” volta a “falta” num toque, sem passar pelo ciclo`}
                              >
                                desmarcar
                              </button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </section>

                  <DetalhesCandidatura ap={ap} modelo={modelo} atualizarDetalhe={atualizarDetalhe} />
                </div>
              )}

              <div className="apl-progresso">
                <span className="apl-progresso-rotulo">
                  {tarefasDaAplicacao.length === 0
                    ? 'SEM ITENS NO CHECKLIST AINDA'
                    : `CHECKLIST · ${concluidas} DE ${tarefasDaAplicacao.length} ${tarefasDaAplicacao.length === 1 ? 'ITEM' : 'ITENS'}`}
                </span>
                {tarefasDaAplicacao.length > 0 && (
                  <div className="apl-trilha" role="presentation">
                    <div className="apl-trilha-fill" style={{ width: `${progresso}%` }} />
                  </div>
                )}
              </div>

              {tarefasDaAplicacao.map((t) => (
                <div className="apl-tarefa" key={t.id}>
                  <input type="checkbox" checked={!!t.done} onChange={() => alternarTarefa(t.id, t.done)} />
                  <span className={`apl-tarefa-titulo ${t.done ? 'apl-tarefa-titulo--feita' : ''}`}>{t.title}</span>
                  <button type="button" className="apl-remover-tarefa" onClick={() => removerTarefa(t.id)} aria-label={`Remover ${t.title}`}>
                    ×
                  </button>
                </div>
              ))}

              <div className="apl-nova-tarefa">
                <input
                  type="text"
                  value={novasTarefas[ap.id] || ''}
                  onChange={(e) => setNovasTarefas((prev) => ({ ...prev, [ap.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && adicionarTarefa(ap.id, novasTarefas[ap.id])}
                  placeholder="Adicionar requisito ou tarefa..."
                  aria-label="Nova tarefa desta candidatura"
                />
                <button type="button" className="btn-secundario" onClick={() => adicionarTarefa(ap.id, novasTarefas[ap.id])}>
                  Adicionar
                </button>
              </div>

              <div className="apl-cartao-rodape">
                {confirmandoRemocao === ap.id ? (
                  <span className="apl-confirmar">
                    <span className="apl-confirmar-texto">
                      {tarefasDaAplicacao.length > 0
                        ? `Remover "${ap.university || 'esta candidatura'}" e ${tarefasDaAplicacao.length} ${tarefasDaAplicacao.length === 1 ? 'item do checklist' : 'itens do checklist'}?`
                        : `Remover "${ap.university || 'esta candidatura'}"?`}
                    </span>
                    <button type="button" className="btn-link btn-link--vermelho" onClick={() => removerUniversidade(ap.id)}>
                      Remover
                    </button>
                    <button type="button" className="btn-link" onClick={() => setConfirmandoRemocao(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn-link btn-link--discreto" onClick={() => setConfirmandoRemocao(ap.id)}>
                    Remover candidatura
                  </button>
                )}
              </div>
            </article>
          )
        })}

        {/* ===== metas gerais ===== */}
        {aplicacoes.length > 0 && (
          <section className="apl-metas">
            <div className="apl-metas-topo">
              <span className="caps-sec">Metas gerais</span>
              <span className="apl-metas-nota">TAREFAS QUE NÃO PERTENCEM A UMA CANDIDATURA</span>
            </div>

            {tarefasGerais.length === 0 && (
              <p className="apl-metas-vazio">
                Ainda não há metas soltas. Use para o que vale para todas as candidaturas — TOEFL, ensaio, pedir cartas.
              </p>
            )}

            {tarefasGerais.length > 0 && (
              <div className="apl-metas-lista">
                {tarefasGerais.map((t) => (
                  <div className="apl-tarefa" key={t.id}>
                    <input type="checkbox" checked={!!t.done} onChange={() => alternarTarefa(t.id, t.done)} />
                    <span className={`apl-tarefa-titulo ${t.done ? 'apl-tarefa-titulo--feita' : ''}`}>{t.title}</span>
                    <button type="button" className="apl-remover-tarefa" onClick={() => removerTarefa(t.id)} aria-label={`Remover ${t.title}`}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="apl-nova-tarefa">
              <input
                type="text"
                value={novaTarefaGeral}
                onChange={(e) => setNovaTarefaGeral(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adicionarTarefa(null, novaTarefaGeral)}
                placeholder="Nova meta geral — ex: agendar o TOEFL"
                aria-label="Nova meta geral"
              />
              <button type="button" className="btn-secundario" onClick={() => adicionarTarefa(null, novaTarefaGeral)}>
                Adicionar
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

// ---------- lógica de exibição ----------

function pesoAberto(aplicacao) {
  const { tipo } = prazoStatus({ application_deadline: aplicacao.deadline })
  return tipo === 'urgente' || tipo === 'agendada' || tipo === 'aberta'
}

function linhaDados(ap, modelo) {
  const d = ap.details || {}
  const partes = modelo === 'university'
    ? [d.course, d.location, d.intake, d.applicationType]
    : [d.programType, d.provider, d.location, d.locationType]
  return partes.filter(Boolean).join(' · ')
}

// "USD 2990" → "USD 2.990": só o agrupamento de milhar na exibição; o que está
// salvo continua exatamente como o aluno digitou.
function formatarValor(texto) {
  return String(texto).replace(/\b(\d{4,})\b/g, (numero) => Number(numero).toLocaleString('pt-BR'))
}

function linhaCusto(ap, modelo) {
  const d = ap.details || {}
  const partes = []

  if (modelo === 'university') {
    if (d.tuition) partes.push(`Mensalidade ${d.tuition}`)
    if (d.livingCost) partes.push(`moradia ${d.livingCost}`)
    if (d.applicationFee) partes.push(`taxa ${d.applicationFee}`)
    if (d.scholarship) partes.push(`bolsa ${String(d.scholarship).toLowerCase()}`)
  } else {
    if (d.cost) partes.push(`Custo ${d.cost}`)
    if (d.minimumGpa) partes.push(`GPA mínimo ${d.minimumGpa}`)
    if (d.scholarship) partes.push(String(d.scholarship))
  }

  return formatarValor(partes.join(' · '))
}

function DetalhesCandidatura({ ap, modelo, atualizarDetalhe }) {
  const grupos = modelo === 'university' ? GRUPOS_UNIVERSIDADE : GRUPOS_PROGRAMA

  return grupos.map((grupo) => (
    <div className="apl-grupo" key={grupo.titulo}>
      <span className="caps-sec">{grupo.titulo}</span>
      <div className="apl-grade-campos">
        {grupo.campos.map((config) => (
          <DetalheAplicacao
            key={config.campo}
            label={config.label}
            placeholder={config.placeholder}
            type={config.type || 'text'}
            value={ap.details?.[config.campo] || ''}
            onSalvar={(valor) => atualizarDetalhe(ap.id, config.campo, valor)}
          />
        ))}
      </div>
    </div>
  ))
}

// Campo de detalhe: campo livre (sem estado próprio) — o texto digitado vive no
// DOM e só vira gravação ao sair do campo, e apenas quando algo mudou. O `key`
// remonta o input se o valor salvo mudar por fora (refetch, troca de candidatura).
function DetalheAplicacao({ label, value, placeholder, type = 'text', onSalvar }) {
  return (
    <label className="campo">
      <span className="caps-sec">{label}</span>
      <input
        key={value}
        type={type}
        defaultValue={value}
        onBlur={(event) => {
          if (event.target.value !== value) onSalvar(event.target.value)
        }}
        placeholder={placeholder}
      />
    </label>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');

.apl-pagina{
  --papel:#F6F2EA; --papel-elev:#FCFAF5; --tinta:#191512; --tinta-sec:#5C554B; --hairline:#E2DACB;
  --lacre:#1A4D3A; --vermelho:#A6301F; --acento:#1F3A5F;
  --serif:'Instrument Serif',Georgia,serif; --corpo:'Libre Caslon Text',Georgia,serif;
  --sans:'Instrument Sans','Helvetica Neue',sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  min-height:100vh; background:var(--papel); color:var(--tinta);
  font-family:var(--corpo); -webkit-font-smoothing:antialiased;
}
.apl-pagina h1, .apl-pagina h2, .apl-pagina p{ margin:0; }

.caps-sec{
  font-family:var(--sans); text-transform:uppercase; letter-spacing:.16em;
  font-size:11px; font-weight:600; color:var(--tinta-sec);
}
.carregando{
  padding:72px 0; text-align:center;
  font-family:var(--mono); font-size:12px; letter-spacing:.08em; color:var(--tinta-sec);
}

/* ===== topo ===== */
.apl-topo{
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:14px 24px; border-bottom:1px solid var(--hairline); background:var(--papel);
}
.marca-mini{ display:flex; align-items:center; gap:10px; }
.marca-mini-escudo{ width:22px; height:auto; }
.marca-mini span{
  font-family:var(--sans); font-weight:600; font-size:12px;
  text-transform:uppercase; letter-spacing:.18em; color:var(--acento);
}
.apl-nav{ display:flex; align-items:center; gap:20px; }
.apl-nav > a{ font:600 13px/1 var(--sans); color:var(--tinta-sec); text-decoration:none; }
.apl-nav > a:hover{ color:var(--acento); }
.apl-nav > a.ativo{ color:var(--acento); }
.menu-conta{ position:relative; }
.btn-conta{
  width:30px; height:30px; border-radius:50%; border:1px solid var(--hairline);
  background:var(--papel-elev); color:var(--tinta-sec); cursor:pointer;
  display:grid; place-items:center; transition:border-color .15s ease, color .15s ease;
}
.btn-conta:hover{ border-color:var(--acento); color:var(--acento); }
.menu-scrim{ position:fixed; inset:0; z-index:20; background:transparent; border:0; cursor:default; }
.menu-popover{
  position:absolute; top:38px; right:0; z-index:30; min-width:190px;
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:4px; overflow:hidden;
}
.menu-popover a, .menu-sair{
  display:block; width:100%; padding:11px 16px; text-align:left;
  font:600 13px/1 var(--sans); color:var(--tinta); text-decoration:none;
  border:0; background:transparent; cursor:pointer;
}
.menu-popover a:hover, .menu-sair:hover{ background:rgba(31,58,95,.06); }
.menu-sair{ color:var(--vermelho) !important; }

/* ===== folha ===== */
.apl-folha{ max-width:820px; margin:0 auto; padding:44px 28px 80px; }

.apl-cabecalho h1{ font:400 44px/1.1 var(--serif); letter-spacing:-.005em; margin-top:12px; }
.apl-cabecalho h1 em{ font-style:italic; }
.apl-intro{ margin-top:16px; font-size:16.5px; line-height:1.75; color:var(--tinta-sec); max-width:54ch; }
.apl-meta{
  margin-top:24px; padding-top:14px; border-top:1px solid var(--tinta);
  display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap;
  font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; color:var(--tinta-sec);
}

/* ===== adicionar ===== */
.apl-adicionar{ margin-top:30px; display:flex; gap:16px; align-items:flex-end; }
.apl-adicionar .campo{ flex:1; }
.apl-adicionar .btn-primario{ flex:none; }

.campo{ display:flex; flex-direction:column; gap:6px; }
.campo input, .campo select, .campo textarea{
  border:0; border-bottom:1px solid var(--hairline); background:transparent; border-radius:0;
  padding:9px 2px; font:400 15.5px var(--corpo); color:var(--tinta);
  transition:border-color .15s ease, box-shadow .15s ease;
}
.campo input::placeholder{ color:#B4AB9C; }
.campo input:focus{ outline:none; border-bottom-color:var(--lacre); box-shadow:0 1px 0 0 var(--lacre); }

.apl-mensagem{ margin-top:16px; font-family:var(--mono); font-size:11.5px; letter-spacing:.04em; }
.apl-mensagem--ok{ color:var(--lacre); }
.apl-mensagem--erro{ color:var(--vermelho); }

/* ===== painéis ===== */
.apl-painel{
  margin-top:30px; padding:34px 32px 30px;
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:6px;
}
.apl-painel-titulo{ font:400 24px/1.25 var(--serif); }
.apl-painel-texto{ margin-top:10px; font-size:15.5px; line-height:1.7; color:var(--tinta-sec); max-width:50ch; }
.apl-painel-acoes{ margin-top:22px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }

/* ===== botões ===== */
.btn-primario{
  display:inline-block; font:600 15px/1 var(--sans); padding:13px 24px; border-radius:3px;
  cursor:pointer; text-decoration:none; text-align:center;
  background:var(--acento); color:var(--papel-elev); border:1px solid var(--acento);
  transition:background-color .15s ease, border-color .15s ease;
}
.btn-primario:hover{ background:#19304E; border-color:#19304E; }
.btn-primario:disabled{ background:#DAD2C2; border-color:#DAD2C2; color:#8F8678; cursor:not-allowed; }
.btn-secundario{
  display:inline-block; font:600 13px/1 var(--sans); padding:10px 16px; border-radius:3px;
  cursor:pointer; text-decoration:none; text-align:center;
  background:transparent; color:var(--tinta); border:1px solid var(--hairline);
  transition:border-color .15s ease, color .15s ease;
}
.btn-secundario:hover{ border-color:var(--acento); color:var(--acento); }
.btn-link{
  font:600 13px/1 var(--sans); color:var(--acento); background:none; border:0; cursor:pointer;
  text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1.5px; padding:0;
}
.btn-link:hover{ color:#19304E; }
.btn-link--vermelho{ color:var(--vermelho); }
.btn-link--discreto{ color:var(--tinta-sec); }

/* ===== dots ===== */
.dot{ display:inline-block; width:8px; height:8px; border-radius:50%; flex:none; }
.dot--lacre{ background:var(--lacre); box-shadow:0 0 0 3px rgba(26,77,58,.14); }
.dot--vazado{ background:transparent; border:1.5px solid var(--tinta-sec); }
.dot--acento{ background:var(--acento); box-shadow:0 0 0 3px rgba(31,58,95,.14); }
.dot--vermelho{ background:var(--vermelho); box-shadow:0 0 0 3px rgba(166,48,31,.14); }
.dot--tinta{ background:var(--tinta-sec); opacity:.45; }

/* ===== mapa de documentos (feedback 15/10) ===== */
.dot--falta{ background:transparent; border:1.5px solid var(--vermelho); }
.dot--pedindo{ background:transparent; border:1.5px solid var(--tinta-sec); }
.dot--pronto{ background:var(--lacre); box-shadow:0 0 0 3px rgba(26,77,58,.14); }
.dot--nao-pede{ background:transparent; border:1.5px dashed var(--hairline); }

.apl-docmaps{ margin-top:18px; padding:16px 18px 14px; border:1px solid var(--hairline); border-radius:6px; background:var(--papel); }
.apl-docmaps + .apl-campos,
.apl-docmaps + *{ margin-top:14px; }
.apl-docmaps-cabecalho{ display:flex; justify-content:space-between; align-items:baseline; gap:12px; padding-bottom:10px; border-bottom:1px solid var(--hairline); }
.apl-docmap-aviso{ margin:10px 0 0; font-size:13.5px; line-height:1.6; color:var(--vermelho); }
.apl-docmap-aviso code{ font:500 12px var(--mono); background:var(--papel-elev); padding:1px 5px; border-radius:3px; border:1px solid var(--hairline); }
.apl-docmap-lista{ list-style:none; margin:0; padding:0; }
.apl-docmap-item{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:9px 0; border-bottom:1px solid var(--hairline); }
.apl-docmap-item:last-child{ border-bottom:0; }
.apl-docmap-item--nao-pede .apl-docmap-nome{ opacity:.5; }
.apl-docmap-item--critico{ background:rgba(166,48,31,.05); }
.apl-docmap-item--critico .apl-docmap-nome em{ color:var(--vermelho); font-weight:500; }
.apl-docmap-item--pronto .apl-docmap-nome em{ color:var(--lacre); }
.apl-docmap-nome{ display:flex; align-items:center; gap:10px; flex:1; min-width:0; background:none; border:0; padding:2px 0; cursor:pointer; text-align:left; }
.apl-docmap-nome:hover span{ color:var(--lacre); }
.apl-docmap-nome em{ font-family:var(--mono, 'IBM Plex Mono', monospace); font-style:normal; font-size:10.5px; letter-spacing:.06em; color:var(--tinta-sec); margin-left:auto; white-space:nowrap; }
.apl-docmap-nome span{ font-size:15.5px; color:var(--tinta); }
.apl-docmap-nao-pede{ flex:none; font:600 10.5px/1 var(--sans); letter-spacing:.08em; text-transform:uppercase; color:var(--tinta-sec); background:none; border:1px solid var(--hairline); border-radius:3px; padding:5px 8px; cursor:pointer; }
.apl-docmap-nao-pede:hover{ border-color:var(--tinta-sec); }
.apl-docmap-nao-pede[aria-pressed="true"]{ color:var(--vermelho); border-color:var(--vermelho); }
.apl-docmap-desmarcar{ flex:none; font:600 10.5px/1 var(--sans); letter-spacing:.08em; text-transform:uppercase; color:var(--tinta-sec); background:none; border:1px dashed var(--hairline); border-radius:3px; padding:5px 8px; cursor:pointer; }
.apl-docmap-desmarcar:hover{ color:var(--vermelho); border-color:var(--tinta-sec); }

/* ===== cartão da candidatura ===== */
.apl-cartao{
  margin-top:22px; padding:22px 26px 20px;
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:6px;
}
.apl-cartao-topo{
  display:flex; align-items:center; justify-content:space-between; gap:14px;
  padding-bottom:14px; border-bottom:1px solid var(--hairline);
  font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; color:var(--tinta-sec);
}
.apl-cartao-topo > span:first-child{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tag-status{ display:flex; align-items:center; gap:8px; flex:none; white-space:nowrap; }

.apl-cartao-nome{ margin-top:18px; font:400 27px/1.15 var(--serif); letter-spacing:-.005em; }
.apl-cartao-dados{ margin-top:12px; font-size:15.5px; line-height:1.7; }
.apl-cartao-dados--custo{ color:var(--tinta-sec); }
.apl-nota{ margin-top:10px; display:flex; align-items:baseline; gap:10px; font-family:var(--mono); font-size:11px; letter-spacing:.03em; color:var(--tinta-sec); }
.apl-nota .dot{ margin-top:6px; }
.apl-links{ margin-top:14px; display:flex; flex-wrap:wrap; gap:18px; }

/* status + prazo */
.apl-controles{ margin-top:18px; display:flex; flex-wrap:wrap; gap:20px; align-items:flex-end; }
.apl-status{ position:relative; display:inline-flex; align-items:center; }
.apl-status .dot{ position:absolute; left:11px; pointer-events:none; }
.apl-status select{
  appearance:none; -webkit-appearance:none; cursor:pointer;
  font:600 13px/1 var(--sans); color:var(--tinta);
  padding:9px 30px 9px 30px; border:1px solid var(--hairline); border-radius:3px; background:var(--papel);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%235C554B' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 11px center; background-size:11px 7px;
  transition:border-color .15s ease;
}
.apl-status select:hover{ border-color:var(--acento); }
.apl-status select:focus{ outline:none; border-color:var(--lacre); box-shadow:0 1px 0 0 var(--lacre); }

.apl-prazo{ display:flex; flex-direction:column; gap:6px; }
.apl-prazo input[type="date"]{
  font-family:var(--mono); font-size:12px; letter-spacing:.04em; color:var(--tinta);
  padding:8px 11px; border:1px solid var(--hairline); border-radius:3px; background:var(--papel);
  transition:border-color .15s ease;
}
.apl-prazo input[type="date"]:hover{ border-color:var(--acento); }
.apl-prazo input[type="date"]:focus{ outline:none; border-color:var(--lacre); box-shadow:0 1px 0 0 var(--lacre); }
.apl-prazo-rotulo{ font-family:var(--mono); font-size:10px; letter-spacing:.1em; color:var(--tinta-sec); }
.apl-prazo-rotulo--urgente{ color:var(--vermelho); }

.apl-toggle{
  display:inline-block; margin-top:18px; padding:0; border:0; background:none; cursor:pointer;
  font:600 13px/1 var(--sans); color:var(--tinta-sec); text-align:left;
}
.apl-toggle:hover{ color:var(--acento); }

/* detalhes */
.apl-detalhes{
  margin-top:16px; padding:22px 22px 18px;
  background:var(--papel); border:1px solid var(--hairline); border-radius:4px;
  display:flex; flex-direction:column; gap:24px;
}
.apl-grupo{ display:flex; flex-direction:column; gap:14px; }
.apl-grade-campos{ display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px 22px; }

/* progresso */
.apl-progresso{ margin-top:22px; }
.apl-progresso-rotulo{ font-family:var(--mono); font-size:10px; letter-spacing:.12em; color:var(--tinta-sec); }
.apl-trilha{
  margin-top:8px; height:3px; background:var(--hairline); border-radius:0; overflow:hidden;
}
.apl-trilha-fill{ height:100%; background:var(--lacre); transition:width .25s ease; }

/* tarefas */
.apl-tarefa{ display:flex; align-items:center; gap:12px; padding:9px 0; border-bottom:1px solid var(--hairline); }
.apl-tarefa input[type="checkbox"]{ width:15px; height:15px; accent-color:var(--lacre); cursor:pointer; flex:none; }
.apl-tarefa-titulo{ flex:1; font-size:15px; line-height:1.5; }
.apl-tarefa-titulo--feita{ color:var(--tinta-sec); text-decoration:line-through; text-decoration-thickness:1px; }
.apl-remover-tarefa{
  flex:none; border:0; background:none; cursor:pointer; color:#B4AB9C;
  font:400 15px/1 var(--sans); padding:2px 4px;
}
.apl-remover-tarefa:hover{ color:var(--vermelho); }

.apl-nova-tarefa{ display:flex; gap:10px; margin-top:12px; }
.apl-nova-tarefa input{
  flex:1; min-width:0; font:400 14.5px var(--corpo); color:var(--tinta);
  padding:9px 11px; border:1px solid var(--hairline); border-radius:3px; background:var(--papel);
  transition:border-color .15s ease, box-shadow .15s ease;
}
.apl-nova-tarefa input::placeholder{ color:#B4AB9C; }
.apl-nova-tarefa input:focus{ outline:none; border-color:var(--lacre); box-shadow:0 1px 0 0 var(--lacre); }

.apl-cartao-rodape{ margin-top:18px; padding-top:14px; border-top:1px solid var(--hairline); }
.apl-confirmar{ display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
.apl-confirmar-texto{ font-size:14px; color:var(--tinta-sec); }

/* metas gerais */
.apl-metas{ margin-top:34px; }
.apl-metas-topo{
  display:flex; align-items:baseline; justify-content:space-between; gap:16px; flex-wrap:wrap;
  padding-top:14px; border-top:1px solid var(--tinta);
}
.apl-metas-nota{ font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; color:var(--tinta-sec); }
.apl-metas-vazio{ margin-top:16px; font-size:15px; line-height:1.7; color:var(--tinta-sec); max-width:52ch; }
.apl-metas-lista{ margin-top:14px; }

@media (max-width:640px){
  .apl-topo{ padding:6px 16px 2px; gap:2px 8px; flex-wrap:wrap; }
  .apl-nav{ flex:1 1 auto; min-width:0; flex-wrap:wrap; justify-content:space-between; gap:6px 14px; }
  /* alvos de toque: 44px de altura é o mínimo confortável no polegar */
  .apl-nav > a{ font-size:13px; padding:15px 6px; white-space:nowrap; }
  .btn-conta{ width:40px; height:40px; }
  /* marca compacta na linha de cima */
  .marca-mini-escudo{ width:18px; }
  .marca-mini span{ font-size:11px; letter-spacing:.14em; }
  .apl-folha{ padding:32px 16px 60px; }
  .apl-cabecalho h1{ font-size:34px; }
  .apl-adicionar{ flex-direction:column; align-items:stretch; }
  .apl-cartao{ padding:20px 20px 18px; }
  .apl-adicionar input, .apl-adicionar select{ font-size:16px; }
}
`;

