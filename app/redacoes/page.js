'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import {
  criarEnsaioParaUsuario,
  listarEnsaiosParaUsuario,
  salvarRascunho,
  atualizarEnsaio as atualizarEnsaioDb,
  removerEnsaio as removerEnsaioDb,
  salvarVersao as salvarVersaoDb,
  listarVersoes,
  calcularSugestoes,
  dispensarSugestao,
  removerDispensa,
  segmentarAnalise,
} from '../../lib/redacoes.js'

const STATUS = ['ideia', 'rascunho', 'revisao', 'final']
const RÓTULO_STATUS = { ideia: 'ideia', rascunho: 'rascunho', revisao: 'revisão', final: 'final' }
const DOT_STATUS = { ideia: 'dot--tinta', rascunho: 'dot--vazado', revisao: 'dot--lacre', final: 'dot--acento' }

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

// Conta palavras do modo simples e estável (sequências sem espaço).
const contarPalavras = (texto) => (texto || '').trim() ? (texto || '').trim().split(/\s+/).length : 0

// Conteúdo de uma seção da análise: linhas com "- "/"• " viram lista,
// o resto vira parágrafo. Fica estável durante o streaming parcial.
function renderizarConteudoAnalise(conteudo) {
  const linhas = (conteudo || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const blocos = []
  let itens = []
  const descarregarItens = () => {
    if (itens.length > 0) {
      blocos.push(
        <ul key={`lista-${blocos.length}`}>
          {itens.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      )
      itens = []
    }
  }
  linhas.forEach((linha, i) => {
    const marcada = linha.match(/^[-•*][ \t]+(.*)/)
    if (marcada) {
      itens.push(marcada[1])
    } else {
      descarregarItens()
      blocos.push(<p key={`p-${i}`}>{linha}</p>)
    }
  })
  descarregarItens()
  return blocos
}

export default function Redacoes() {
  const router = useRouter()
  const [userId, setUserId] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [ensaios, setEnsaios] = useState([])
  const [aplicacoes, setAplicacoes] = useState([])
  const [abertaId, setAbertaId] = useState(null)
  const [filtro, setFiltro] = useState('todas')
  const [versoes, setVersoes] = useState({})      // ensaioId → versões carregadas
  const [analises, setAnalises] = useState({})    // ensaioId → texto da análise
  const [analiseCarregando, setAnaliseCarregando] = useState({})
  const [trash, setTrash] = useState(null)        // confirmação de remoção
  const [mensagem, setMensagem] = useState(null)
  const [menuAberto, setMenuAberto] = useState(false)
  const [salvoEm, setSalvoEm] = useState({})      // ensaioId → iso da última gravação ok
  const [dispensaRecem, setDispensaRecem] = useState([]) // ids em janela de desfazer


  const notificar = (texto, tipo = 'ok') => {
    setMensagem({ texto, tipo })
    setTimeout(() => setMensagem(null), 5000)
  }

  useEffect(() => {
    const iniciar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const [ens, aps] = await Promise.all([
        listarEnsaiosParaUsuario(user.id, supabase),
        supabase.from('applications').select('id, university, deadline, details').eq('user_id', user.id).order('created_at', { ascending: true }),
      ])

      const listaEnsaios = ens?.data || []
      setEnsaios(listaEnsaios)
      setAplicacoes(aps?.data || [])
      // abre a redação mais recente por padrão (o acordeão precisa de UMA aberta)
      if (listaEnsaios.length > 0) setAbertaId(listaEnsaios[0].id)
      setCarregando(false)
    }
    iniciar()
  }, [router])

  // ---- sugestões (banner) ----
  const sugestoes = useMemo(() => calcularSugestoes(aplicacoes, ensaios), [aplicacoes, ensaios])

  const criarDasSugestes = async (lista = sugestoes) => {
    if (!userId || lista.length === 0) return
    const criadas = []
    for (const s of lista) {
      const { data, error } = await criarEnsaioParaUsuario(userId, {
        title: `Redação de ${s.university}`,
        application_id: s.id,
        status: 'ideia',
      }, supabase)
      if (!error && data) criadas.push(data.id)
    }
    if (criadas.length > 0) {
      const { data: recarregados } = await listarEnsaiosParaUsuario(userId, supabase)
      const listaNova = recarregados || []
      setEnsaios(listaNova)
      setAbertaId(criadas[0])
      notificar(`${criadas.length === 1 ? 'Rascunho criado' : `${criadas.length} rascunhos criados`} — complete o prompt quando quiser.`)
    } else {
      notificar('Não foi possível criar os rascunhos agora.', 'erro')
    }
  }

  const dispensarSugestoes = async (lista = sugestoes) => {
    const ids = lista.map((s) => s.id)
    for (const s of lista) await dispensarSugestao(s.id, supabase)
    setAplicacoes((atual) => atual.map((ap) => (ids.includes(ap.id) ? { ...ap, details: { ...ap.details, redacao_dispensada: true } } : ap)))
    setDispensaRecem(ids)
    setTimeout(() => setDispensaRecem((atual) => atual.filter((id) => !ids.includes(id))), 8000)
    notificar('Ok — estas candidaturas não voltam a sugerir.')
  }

  const desfazerDispensa = async () => {
    const ids = dispensaRecem
    setDispensaRecem([])
    for (const id of ids) await removerDispensa(id, supabase)
    setAplicacoes((atual) => atual.map((ap) => {
      if (!ids.includes(ap.id)) return ap
      const { redacao_dispensada: _fora, ...details } = ap.details || {}
      return { ...ap, details }
    }))
    notificar('Pronto — a sugestão de redação voltou.')
  }

  // ---- CRUD da lista ----
  const criarEnsaio = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') || '').trim()
    const applicationId = String(form.get('application_id') || '')
    if (!title || !userId) return
    const { data, error } = await criarEnsaioParaUsuario(userId, {
      title,
      application_id: applicationId || null,
    }, supabase)
    if (error) { notificar('Não foi possível criar a redação agora.', 'erro'); return }
    const { data: recarregados } = await listarEnsaiosParaUsuario(userId, supabase)
    setEnsaios(recarregados || [])
    if (data) setAbertaId(data.id)
    event.currentTarget.reset()
  }

  const abrirOuFechar = (id) => setAbertaId((atual) => (atual === id ? null : id))

  const salvarTexto = (id, texto) => {
    salvarRascunho(id, texto, supabase)
      .then(({ error }) => {
        if (error) notificar('Falha ao salvar o rascunho, tente de novo.', 'erro')
        else setSalvoEm((atual) => ({ ...atual, [id]: new Date().toISOString() }))
      })
      .catch(() => notificar('Falha ao salvar o rascunho, tente de novo.', 'erro'))
    setEnsaios((atual) => atual.map((e) => (e.id === id ? { ...e, body: texto, updated_at: new Date().toISOString() } : e)))
  }

  const mudarStatus = async (id, status) => {
    setEnsaios((atual) => atual.map((e) => (e.id === id ? { ...e, status } : e)))
    const { error } = await atualizarEnsaioDb(id, { status }, supabase)
    if (error) notificar('Não foi possível mudar o status.', 'erro')
  }

  const mudarPrompt = async (id, prompt) => {
    setEnsaios((atual) => atual.map((e) => (e.id === id ? { ...e, prompt } : e)))
    const { error } = await atualizarEnsaioDb(id, { prompt }, supabase)
    if (error) notificar('Não foi possível salvar o prompt.', 'erro')
  }

  const mudarLimite = async (id, valor) => {
    const word_limit = valor === '' ? null : Number(valor)
    setEnsaios((atual) => atual.map((e) => (e.id === id ? { ...e, word_limit } : e)))
    const { error } = await atualizarEnsaioDb(id, { word_limit }, supabase)
    if (error) notificar('Não foi possível salvar o limite.', 'erro')
  }

  const remover = async (id) => {
    setTrash(null)
    setEnsaios((atual) => atual.filter((e) => e.id !== id))
    if (abertaId === id) setAbertaId(null)
    const { error } = await removerEnsaioDb(id, supabase)
    if (error) {
      notificar('Não foi possível remover agora.', 'erro')
      const { data } = await listarEnsaiosParaUsuario(userId, supabase)
      setEnsaios(data || [])
    }
  }

  // ---- versões ----
  const abrirVersoes = async (id) => {
    if (!versoes[id]) {
      const { data } = await listarVersoes(id, supabase)
      setVersoes((atual) => ({ ...atual, [id]: data || [] }))
    }
  }
  const salvarVersaoDa = async (id, body) => {
    if (!body?.trim()) { notificar('Escreva algo antes de congelar a versão.', 'erro'); return }
    const { data, error } = await salvarVersaoDb(id, body, supabase)
    if (error) { notificar('Não foi possível salvar a versão.', 'erro'); return }
    setVersoes((atual) => ({ ...atual, [id]: [data, ...(atual[id] || [])] }))
    notificar('Versão salva — você sempre pode voltar nela.')
  }
  const restaurar = async (id, versao) => {
    salvarTexto(id, versao.body)
    notificar(`Texto restaurado da versão de ${versao.label}.`)
  }

  // ---- análise IA ----
  const pedirAnalise = async (id, body) => {
    setAnaliseCarregando((atual) => ({ ...atual, [id]: true }))
    setAnalises((atual) => ({ ...atual, [id]: '' }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Sessão expirou. Entre de novo.')
      const resposta = await fetch('/api/redacoes/analise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ensaioId: id }),
      })
      if (!resposta.ok || !resposta.body) {
        let detalhe = ''
        try { detalhe = (await resposta.json())?.erro || '' } catch { /* sem json */ }
        throw new Error(detalhe || 'Análise não saiu agora.')
      }
      const reader = resposta.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const pedaco = decoder.decode(value, { stream: true })
        setAnalises((atual) => ({ ...atual, [id]: (atual[id] || '') + pedaco }))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Análise não saiu agora.'
      setAnalises((atual) => ({ ...atual, [id]: `Não consegui analisar: ${msg}` }))
    } finally {
      setAnaliseCarregando((atual) => ({ ...atual, [id]: false }))
    }
  }

  // ---- derivados ----
  const contadorPorStatus = useMemo(() => {
    const contagem = { todas: ensaios.length, ideia: 0, rascunho: 0, revisao: 0, final: 0 }
    ensaios.forEach((e) => { contagem[e.status] = (contagem[e.status] || 0) + 1 })
    return contagem
  }, [ensaios])

  const visiveis = useMemo(
    () => (filtro === 'todas' ? ensaios : ensaios.filter((e) => e.status === filtro)),
    [ensaios, filtro]
  )

  const candidatoNome = (id) => {
    const ap = aplicacoes.find((a) => a.id === id)
    return ap?.university || null
  }

  const prazoCandidato = (id) => aplicacoes.find((a) => a.id === id)?.deadline || null

  const dataCurtaPrazo = (iso) => {
    // "YYYY-MM-DD" vem como data em UTC; via Date o fuso local puxa para o dia
    // anterior. Extrai direto da string quando é o formato de data pura.
    if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(8, 10) + '/' + iso.slice(5, 7)
    try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) } catch { return '' }
  }

  const horaCurta = (iso) => {
    try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
  }

  const copiarTexto = async (id) => {
    const texto = ensaios.find((e) => e.id === id)?.body || ''
    const avisoOk = () => notificar('Texto copiado — cole no portal da universidade.')
    const avisoErro = () => notificar('Não foi possível copiar agora.', 'erro')
    // Alguns navegadores/contextos negam navigator.clipboard; o caminho legado
    // (textarea desviada + execCommand) cobre o restante.
    try {
      await navigator.clipboard.writeText(texto)
      avisoOk()
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = texto
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        ta.remove()
        ok ? avisoOk() : avisoErro()
      } catch {
        avisoErro()
      }
    }
  }

  if (carregando) {
    return (
      <main className="red-pagina">
        <style>{CSS}</style>
        <p className="carregando">Carregando suas redações...</p>
      </main>
    )
  }

  return (
    <main className="red-pagina">
      <style>{CSS}</style>

      {/* ===== topo (mesma anatomia das outras abas) ===== */}
      <header className="red-topo">
        <div className="marca-mini">{ESCUDO}<span>Admitly</span></div>
        <nav className="red-nav">
          <a href="/oportunidades">Oportunidades</a>
          <a href="/aplicacoes">Aplicações</a>
          <a href="/redacoes" className="ativo" aria-current="page">Redações</a>
          <a href="/perfil">Perfil</a>
          <div className="menu-conta">
            <button type="button" className="btn-conta" onClick={() => setMenuAberto((v) => !v)} aria-label="Menu da conta" aria-expanded={menuAberto}>
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
                  <button type="button" role="menuitem" className="menu-sair"onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>Sair da conta</button>
                </div>
              </>
            )}
          </div>
        </nav>
      </header>

      <div className="red-folha">
        <header className="red-cabecalho">
          <span className="caps-sec">Sua escrita</span>
          <h1>Minhas <em>redações</em>.</h1>
          <p className="red-intro">
            Cada redação vive dentro de uma candidatura, do prompt ao texto final. O rascunho
            salva sozinho ao sair do campo — e <code>Salvar versão</code> congela o que estava bom.
          </p>
          <p className="red-meta">
            <span>{ensaios.length} {ensaios.length === 1 ? 'REDAÇÃO' : 'REDAÇÕES'}</span>
            <span>{contadorPorStatus.revisao} EM REVISÃO{contadorPorStatus.final > 0 ? ` · ${contadorPorStatus.final} FINAL` : ''}</span>
          </p>
        </header>

        {/* ===== adicionar ===== */}
        <form className="red-adicionar" onSubmit={criarEnsaio}>
          <div className="campo">
            <label className="caps-sec" htmlFor="red-candidatura">Candidatura</label>
            <select id="red-candidatura" name="application_id">
              <option value="">Sem candidatura vinculada</option>
              {aplicacoes.map((ap) => (
                <option key={ap.id} value={ap.id}>{ap.university || 'Candidatura sem nome'}</option>
              ))}
            </select>
          </div>
          <div className="campo campo--cresce">
            <label className="caps-sec" htmlFor="red-titulo">Título da redação</label>
            <input id="red-titulo" name="title" placeholder="ex: Common App, supplemental de Yale..." autoComplete="off" />
          </div>
          <button type="submit" className="btn-primario">Criar</button>
        </form>

        {mensagem && (
          <p className={`red-mensagem ${mensagem.tipo === 'erro' ? 'red-mensagem--erro' : 'red-mensagem--ok'}`} role="status">
            {mensagem.texto}
          </p>
        )}

        {/* ===== banner de sugestão (1 clique, com dispensa) ===== */}
        {sugestoes.length > 0 && (
          <section className="red-sugestao" aria-label="Candidaturas pedindo redação">
            <div className="red-sugestao-cab">
              <span className="caps-sec">
                {sugestoes.length === 1 ? '1 CANDIDATURA PEDE REDAÇÃO' : `${sugestoes.length} CANDIDATURAS PEDEM REDAÇÃO`}
              </span>
              <button type="button" className="btn-link btn-link--discreto" onClick={() => dispensarSugestoes(sugestoes)}>
                Não me lembre
              </button>
            </div>
            <ul className="red-sugestao-lista">
              {sugestoes.map((s) => (
                <li key={s.id}><b>{s.university}</b> — requisitos: {s.details.requirements}</li>
              ))}
            </ul>
            <button type="button" className="btn-secundario" onClick={() => criarDasSugestes(sugestoes)}>
              {sugestoes.length === 1 ? 'Criar rascunho' : `Criar ${sugestoes.length} rascunhos`}
            </button>
          </section>
        )}

        {dispensaRecem.length > 0 && (
          <div className="red-undo" role="status">
            <span>Você dispensou {dispensaRecem.length === 1 ? 'esta sugestão' : 'estas sugestões'}.</span>
            <button type="button" className="btn-link" onClick={desfazerDispensa}>Desfazer</button>
          </div>
        )}

        {/* ===== filtros ===== */}
        <div className="red-filtros">
          {['todas', ...STATUS].map((f) => (
            <button
              type="button"
              key={f}
              className={`filtro ${filtro === f ? 'ativo' : ''}`}
              onClick={() => setFiltro(f)}
            >
              {f === 'todas' ? 'TODAS' : RÓTULO_STATUS[f].toUpperCase()} · {contadorPorStatus[f] ?? 0}
            </button>
          ))}
        </div>

        {/* ===== painel vazio ===== */}
        {ensaios.length === 0 && (
          <div className="red-painel">
            <p className="red-painel-titulo">Nenhuma redação por aqui ainda.</p>
            <p className="red-painel-texto">
              Comece pela candidatura que exige redação — o Common App pede um texto de até 650
              palavras sobre quem você é. Se travar, escreva no chat e peça um esboço de partida.
            </p>
            <div className="red-painel-acoes">
              <a className="btn-primario" href="/chat">Escrever no chat</a>
              <a className="btn-secundario" href="/aplicacoes">Ver aplicações pedindo redação</a>
            </div>
          </div>
        )}

        {/* ===== ACORDEÃO ===== */}
        {visiveis.map((ensaio) => {
          const aberta = abertaId === ensaio.id
          const palavras = contarPalavras(ensaio.body)
          const limite = ensaio.word_limit
          const estourada = limite != null && palavras > limite
          const candidato = candidatoNome(ensaio.application_id)
          const pct = limite ? Math.min(100, Math.round((palavras / limite) * 100)) : 0

          if (!aberta) {
            return (
              <article key={ensaio.id} className={`cartao fechado ${ensaio.status === 'final' ? 'cartao--final' : ''}`} onClick={() => abrirOuFechar(ensaio.id)}>
                <div className="cartao-topo">
                  <span className="vinculo">
                    {candidato ? (<>REDAÇÃO DE <b>{candidato}</b></>) : 'REDAÇÃO SOLTA'}
                    {prazoCandidato(ensaio.application_id) ? (<> · ENTREGA {dataCurtaPrazo(prazoCandidato(ensaio.application_id))}</>) : ''}
                    {' · '}{formatarAtualizado(ensaio.updated_at)}
                  </span>
                  <span className="abrir-hint">ABRIR ↓</span>
                </div>
                <div className="cartao-fechado">
                  <h2 className="nome-redacao">{ensaio.title || 'Redação sem título'}</h2>
                  <span className="tag-status">
                    <i className={`dot ${DOT_STATUS[ensaio.status]}`} aria-hidden="true" />
                    <span className="mono">{RÓTULO_STATUS[ensaio.status]?.toUpperCase()}</span>
                  </span>
                </div>
                <p className="resumo">
                  {limite != null ? `${palavras} / ${limite} PALAVRAS` : palavras > 0 ? `${palavras} palavras` : 'Ainda sem texto'}
                </p>
              </article>
            )
          }

          return (
            <article key={ensaio.id} className={`cartao aberto ${ensaio.status === 'final' ? 'cartao--final' : ''}`} onClick={() => {}} data-ensaio={ensaio.id} onMouseEnter={() => abrirVersoes(ensaio.id)}>
              <div className="cartao-topo">
                <span className="vinculo">{candidato ? (<>REDAÇÃO DE <b>{candidato}</b></>) : 'REDAÇÃO SOLTA'}</span>
                <button type="button" className="recoller-hint" onClick={(e) => { e.stopPropagation(); abrirOuFechar(ensaio.id) }}>
                  RECOLHER ↑
                </button>
                <span className="status">
                  <i className={`dot ${DOT_STATUS[ensaio.status]}`} aria-hidden="true" />
                  <select
                    value={ensaio.status}
                    onChange={(e) => mudarStatus(ensaio.id, e.target.value)}
                    aria-label={`Status da redação ${ensaio.title || ''}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {STATUS.map((s) => <option key={s} value={s}>{RÓTULO_STATUS[s]}</option>)}
                  </select>
                </span>
              </div>

              <h2 className="nome-redacao">{ensaio.title || 'Redação sem título'}</h2>
              <div className="caixa-prompt">
                <input
                  key={ensaio.prompt}
                  type="text"
                  defaultValue={ensaio.prompt || ''}
                  onBlur={(e) => { if (e.target.value !== ensaio.prompt) mudarPrompt(ensaio.id, e.target.value) }}
                  placeholder="Enunciado da redação (prompt) — cole aqui..."
                  aria-label="Prompt da redação"
                />
                <input
                  type="number"
                  min={0}
                  defaultValue={ensaio.word_limit ?? ''}
                  onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== ensaio.word_limit) mudarLimite(ensaio.id, v === null ? '' : String(v)) }}
                  placeholder="Limite"
                  aria-label="Limite de palavras"
                  className="limite"
                />
              </div>

              {/* Guia de estrutura opcional (feedback 15/10): fechado por padrão,
                  não atrapalha quem já sabe o que escrever. */}
              <details className="guia-estrutura" onClick={(e) => e.stopPropagation()}>
                <summary>Ferramentas de escrita · estrutura sugerida</summary>
                <div className="guia-corpo">
                  <p>Um ensaio de admissão quase sempre caminha assim:</p>
                  <ol>
                    <li><strong>Gancho</strong> — uma cena ou pergunta específica que seja SUA (nada de “Since I was a child”).</li>
                    <li><strong>Contexto</strong> — o que estava em jogo, em 2 a 3 frases.</li>
                    <li><strong>Desenvolvimento</strong> — o que você fez, como pensou, o que custou.</li>
                    <li><strong>Virada/mudança</strong> — como você (ou sua visão do problema) mudou.</li>
                    <li><strong>Ponte para o futuro</strong> — 1 frase ligando isso ao que você quer levar para a faculdade.</li>
                  </ol>
                  <p className="guia-exemplo">Regra de bolso: mostrar &gt; contar. Troque “sou apaixonado por biologia” por a cena em que você passou o domingo inteiro no mangue coletando amostras.</p>
                </div>
              </details>

              <div className="caixa-editor" onClick={(e) => e.stopPropagation()}>
                <textarea
                  key={ensaio.body === undefined ? 'x' : ensaio.body}
                  spellCheck="false"
                  defaultValue={ensaio.body || ''}
                  onBlur={(e) => { if (e.target.value !== ensaio.body) salvarTexto(ensaio.id, e.target.value) }}
                  placeholder="Comece a escrever — o rascunho salva sozinho quando você sai do campo."
                  aria-label="Texto da redação"
                />
              </div>

              <div className={`trilha-linha ${estourada ? 'trilha-linha--estourada' : ''}`}>
                {salvoEm[ensaio.id] && <span className="salvo-ok">SALVO {horaCurta(salvoEm[ensaio.id])}</span>}
                <span>{limite != null ? `${palavras} / ${limite} PALAVRAS` : `${palavras} PALAVRAS`}</span>
                {limite != null && (
                  <div className="trilha" role="presentation">
                    <div className={`trilha-fill ${ensaio.status === 'final' ? 'trilha-fill--ok' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
                <span>{RÓTULO_STATUS[ensaio.status]?.toUpperCase()}</span>
              </div>

              <div className="acoes" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn-secundario" onClick={() => copiarTexto(ensaio.id)}>Copiar texto</button>
                <button type="button" className="btn-secundario" onClick={() => salvarVersaoDa(ensaio.id, ensaio.body)}>Salvar versão</button>
                <button type="button" className="btn-secundario" disabled={analiseCarregando[ensaio.id]} onClick={() => { salvarTexto(ensaio.id, ensaio.body); pedirAnalise(ensaio.id) }}>
                  {analiseCarregando[ensaio.id] ? 'Analisando...' : 'Peça análise'}
                </button>
                <button type="button" className="btn-link btn-link--discreto" onClick={() => setTrash(ensaio.id)}>
                  Remover redação
                </button>
                {trash === ensaio.id && (
                  <>
                    <button type="button" className="btn-link btn-link--vermelho" onClick={() => remover(ensaio.id)}>Confirmar</button>
                    <button type="button" className="btn-link" onClick={() => setTrash(null)}>Cancelar</button>
                  </>
                )}
              </div>

              {(analises[ensaio.id] || analiseCarregando[ensaio.id]) && (
                <div className="analise">
                  <span className="caps-sec">Análise do Admitly</span>
                  <div className="analise-blocos">
                    {segmentarAnalise(analises[ensaio.id]).map((secao, si) => (
                      <div className="analise-bloco" key={si}>
                        <span className="caps-sec analise-rotulo">{secao.rotulo.toUpperCase()}</span>
                        {renderizarConteudoAnalise(secao.conteudo)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(versoes[ensaio.id]?.length || 0) > 0 && (
                <div className="versoes">
                  <span className="caps-sec">Versões</span>
                  {versoes[ensaio.id].map((versao) => (
                    <div className="versao" key={versao.id}>
                      <span className="mono">{versao.label}</span>
                      <span className="versao-trecho">{versao.body.slice(0, 80) || 'Texto vazio'}</span>
                      <button type="button" className="btn-link btn-link--discreto" onClick={() => restaurar(ensaio.id, versao)}>Restaurar</button>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </main>
  )
}

function formatarAtualizado(iso) {
  try {
    const d = new Date(iso)
    const hoje = new Date()
    const mesmoDia = d.toDateString() === hoje.toDateString()
    if (mesmoDia) return 'ATUALIZADO HOJE'
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1)
    if (d.toDateString() === ontem.toDateString()) return 'ONTEM'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch { return '' }
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');

.red-pagina{
  --papel:#F6F2EA; --papel-elev:#FCFAF5; --tinta:#191512; --tinta-sec:#5C554B; --hairline:#E2DACB;
  --lacre:#1A4D3A; --vermelho:#A6301F; --acento:#1F3A5F;
  --serif:'Instrument Serif',Georgia,serif; --corpo:'Libre Caslon Text',Georgia,serif;
  --sans:'Instrument Sans','Helvetica Neue',sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  min-height:100vh; background:var(--papel); color:var(--tinta);
  font-family:var(--corpo); -webkit-font-smoothing:antialiased;
}
.red-pagina h1,.red-pagina h2,.red-pagina p{ margin:0; }
.caps-sec{ font-family:var(--sans); text-transform:uppercase; letter-spacing:.16em; font-size:11px; font-weight:600; color:var(--tinta-sec); }
.carregando{ padding:72px 0; text-align:center; font-family:var(--mono); font-size:12px; letter-spacing:.08em; color:var(--tinta-sec); }
.red-topo{ display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 24px; border-bottom:1px solid var(--hairline); background:var(--papel); }
.marca-mini{ display:flex; align-items:center; gap:10px; }
.marca-mini-escudo{ width:22px; height:auto; }
.marca-mini span{ font:600 12px/1 var(--sans); text-transform:uppercase; letter-spacing:.18em; color:var(--acento); }
.red-nav{ display:flex; align-items:center; gap:20px; }
.red-nav > a{ font:600 13px/1 var(--sans); color:var(--tinta-sec); text-decoration:none; }
.red-nav > a:hover, .red-nav > a.ativo{ color:var(--acento); }
.menu-conta{ position:relative; }
.btn-conta{ width:30px; height:30px; border-radius:50%; border:1px solid var(--hairline); background:var(--papel-elev); color:var(--tinta-sec); cursor:pointer; display:grid; place-items:center; }
.btn-conta:hover{ border-color:var(--acento); color:var(--acento); }
.menu-scrim{ position:fixed; inset:0; z-index:20; background:transparent; border:0; cursor:default; }
.menu-popover{ position:absolute; top:38px; right:0; z-index:30; min-width:190px; background:var(--papel-elev); border:1px solid var(--hairline); border-radius:4px; overflow:hidden; }
.menu-popover a,.menu-sair{ display:block; width:100%; padding:11px 16px; text-align:left; font:600 13px/1 var(--sans); color:var(--tinta); text-decoration:none; border:0; background:transparent; cursor:pointer; }
.menu-popover a:hover,.menu-sair:hover{ background:rgba(31,58,95,.06); }
.menu-sair{ color:var(--vermelho) !important; }

.red-folha{ max-width:880px; margin:0 auto; padding:44px 28px 90px; }
.red-cabecalho h1{ font:400 44px/1.1 var(--serif); letter-spacing:-.005em; margin-top:12px; }
.red-cabecalho h1 em{ font-style:italic; }
.red-intro{ margin-top:16px; font-size:16.5px; line-height:1.75; color:var(--tinta-sec); max-width:54ch; }
.red-meta{ margin-top:24px; padding-top:14px; border-top:1px solid var(--tinta); display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; color:var(--tinta-sec); }

.red-adicionar{ margin-top:30px; display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap; }
.campo{ display:flex; flex-direction:column; gap:6px; }
.campo--cresce{ flex:1; min-width:220px; }
.campo input,.campo select{ border:1px solid var(--hairline); border-radius:3px; background:var(--papel); padding:9px 11px; font:400 15.5px var(--corpo); color:var(--tinta); }
.campo input::placeholder{ color:#B4AB9C; }
.campo input:focus,.campo select:focus{ outline:none; border-color:var(--lacre); box-shadow:0 1px 0 0 var(--lacre); }
.red-mensagem{ margin-top:16px; font-family:var(--mono); font-size:11.5px; letter-spacing:.04em; }
.red-mensagem--ok{ color:var(--lacre); }
.red-mensagem--erro{ color:var(--vermelho); }

.btn-primario{ font:600 15px/1 var(--sans); padding:13px 24px; border-radius:3px; cursor:pointer; background:var(--acento); color:var(--papel-elev); border:1px solid var(--acento); flex:none; }
.btn-primario:hover{ background:#19304E; border-color:#19304E; }
.btn-secundario{ font:600 13px/1 var(--sans); padding:10px 16px; border-radius:3px; cursor:pointer; background:transparent; color:var(--tinta); border:1px solid var(--hairline); }
.btn-secundario:hover{ border-color:var(--acento); color:var(--acento); }
.btn-secundario:disabled{ background:#DAD2C2; border-color:#DAD2C2; color:#8F8678; cursor:not-allowed; }
.btn-link{ font:600 13px/1 var(--sans); color:var(--acento); background:none; border:0; cursor:pointer; text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1.5px; padding:0; }
.btn-link:hover{ color:#19304E; }
.btn-link--discreto{ color:var(--tinta-sec); }
.btn-link--vermelho{ color:var(--vermelho); }

/* feedback de salvamento + desfazer dispensa */
.salvo-ok{ color:var(--lacre); font-weight:500; }

/* banner de sugestão */
.red-sugestao{ margin-top:22px; padding:18px 22px 16px; background:var(--papel-elev); border:1px solid var(--hairline); border-left:3px solid var(--lacre); border-radius:6px; }
.red-sugestao-cab{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.red-undo{ margin-top:12px; display:flex; align-items:center; gap:12px; font-size:14px; color:var(--tinta-sec); }
.red-sugestao-lista{ margin:10px 0 14px; padding:0 0 0 18px; display:flex; flex-direction:column; gap:6px; font-size:15px; line-height:1.6; }
.red-sugestao-lista b{ font-weight:700; color:var(--tinta); }

/* filtros */
.red-filtros{ margin-top:26px; display:flex; gap:10px; flex-wrap:wrap; }
.filtro{ font:600 10.5px/1 var(--mono); letter-spacing:.1em; color:var(--tinta-sec); padding:8px 12px; border:1px solid var(--hairline); border-radius:999px; background:transparent; cursor:pointer; }
.filtro:hover{ border-color:var(--acento); color:var(--acento); }
.filtro.ativo{ background:var(--tinta); border-color:var(--tinta); color:var(--papel-elev); }

.dot{ display:inline-block; width:8px; height:8px; border-radius:50%; flex:none; }
.dot--tinta{ background:var(--tinta-sec); opacity:.45; }
.dot--vazado{ background:transparent; border:1.5px solid var(--tinta-sec); }
.dot--lacre{ background:var(--lacre); box-shadow:0 0 0 3px rgba(26,77,58,.14); }
.dot--acento{ background:var(--acento); box-shadow:0 0 0 3px rgba(31,58,95,.14); }
.mono{ font-family:var(--mono); font-size:10px; letter-spacing:.1em; color:var(--tinta-sec); }

/* cartão */
.cartao{ margin-top:22px; padding:22px 26px 20px; background:var(--papel-elev); border:1px solid var(--hairline); border-radius:6px; }
.cartao--final{ border-left:3px solid var(--acento); }
.cartao-topo{ display:flex; align-items:center; justify-content:center; gap:14px; padding-bottom:14px; border-bottom:1px solid var(--hairline); font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; color:var(--tinta-sec); }
.cartao.fechado{ cursor:pointer; transition:border-color .15s ease; }
.cartao.fechado:hover{ border-color:var(--tinta-sec); }
.cartao.fechado .cartao-topo{ border-bottom:0; padding-bottom:0; }
.cartao.fechado .cartao-topo{ justify-content:space-between; }
.vinculo{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vinculo b{ font-weight:500; color:var(--tinta); }
.abrir-hint{ font:600 11px/1 var(--sans); letter-spacing:.08em; color:var(--acento); flex:none; }
.recoller-hint{ font:600 11px/1 var(--sans); letter-spacing:.08em; color:var(--tinta-sec); cursor:pointer; background:none; border:0; padding:0; flex:none; }
.recoller-hint:hover{ color:var(--acento); }

.cartao-fechado{ display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; margin-top:14px; }
.cartao-fechado .nome-redacao{ flex:1 1 240px; font-size:22px; }
.tag-status{ display:flex; align-items:center; gap:8px; flex:none; white-space:nowrap; }
.cartao.fechado > .resumo{ margin-top:6px; font-size:14px; color:var(--tinta-sec); font-style:italic; }

.nome-redacao{ margin-top:18px; font:400 26px/1.2 var(--serif); letter-spacing:-.005em; }
.status{ position:relative; display:inline-flex; align-items:center; }
.status .dot{ position:absolute; left:11px; pointer-events:none; }
.status select{ appearance:none; cursor:pointer; font:600 13px/1 var(--sans); color:var(--tinta); padding:9px 30px; border:1px solid var(--hairline); border-radius:3px; background:var(--papel); background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%235C554B' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 11px center; }
.caixa-prompt{ margin-top:14px; display:flex; gap:10px; flex-wrap:wrap; }
.caixa-prompt input[type="text"]{ flex:1; min-width:220px; border:0; border-bottom:1px solid var(--hairline); background:transparent; padding:9px 2px; font:italic 14px/1.5 var(--corpo); color:var(--tinta-sec); }
.caixa-prompt .limite{ width:110px; border:1px solid var(--hairline); border-radius:3px; padding:8px 10px; font:12px var(--mono); background:var(--papel); }
.guia-estrutura{ margin-top:14px; }
.guia-estrutura summary{ cursor:pointer; list-style:none; font:600 11px/1 var(--sans); text-transform:uppercase; letter-spacing:.14em; color:var(--tinta-sec); text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1px; }
.guia-estrutura summary::-webkit-details-marker{ display:none; }
.guia-estrutura summary:hover{ color:var(--tinta); }
.guia-corpo{ margin-top:10px; padding:14px 16px; border:1px solid var(--hairline); border-radius:4px; background:var(--papel); font-size:15px; line-height:1.7; color:var(--tinta-sec); }
.guia-corpo p{ margin:0; }
.guia-corpo ol{ margin:8px 0 0; padding-left:20px; display:flex; flex-direction:column; gap:4px; }
.guia-exemplo{ margin-top:8px !important; font-style:italic; }
.caixa-editor{ margin-top:16px; }
.caixa-editor textarea{ width:100%; min-height:260px; resize:vertical; border:1px solid var(--hairline); border-radius:4px; background:var(--papel); padding:18px 20px; font:400 16px/1.8 var(--corpo); color:var(--tinta); }
.caixa-editor textarea:focus{ outline:none; border-color:var(--lacre); box-shadow:0 1px 0 0 var(--lacre); }

.trilha-linha{ margin-top:10px; display:flex; align-items:center; gap:12px; font-family:var(--mono); font-size:10px; letter-spacing:.12em; color:var(--tinta-sec); }
.trilha-linha--estourada{ color:var(--vermelho); }
.trilha{ flex:1; height:3px; background:var(--hairline); overflow:hidden; }
.trilha-fill{ height:100%; background:var(--lacre); transition:width .25s ease; }
.trilha-fill--ok{ background:var(--acento); }
.acoes{ margin-top:16px; display:flex; gap:18px; flex-wrap:wrap; align-items:center; }

.analise{ margin-top:18px; padding:20px 22px 16px; background:var(--papel); border:1px solid var(--hairline); border-left:3px solid var(--lacre); border-radius:4px; }
.analise-blocos{ margin-top:12px; display:flex; flex-direction:column; gap:10px; }
.analise-bloco{ padding:12px 16px 11px; background:var(--papel-elev); border:1px solid var(--hairline); border-left:3px solid var(--lacre); border-radius:4px; }
.analise-rotulo{ font-size:10px; }
.analise-bloco p{ margin-top:7px; font-size:15px; line-height:1.7; }
.analise-bloco p:first-of-type{ margin-top:7px; }
.analise-bloco ul{ margin:7px 0 0; padding-left:18px; display:flex; flex-direction:column; gap:5px; font-size:15px; line-height:1.6; }

.versoes{ margin-top:16px; border-top:1px solid var(--hairline); padding-top:12px; }
.versao{ display:flex; align-items:center; gap:12px; padding:7px 0; border-bottom:1px solid var(--hairline); }
.versao:last-of-type{ border-bottom:0; }
.versao-trecho{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; color:var(--tinta-sec); font-style:italic; }

.red-painel{ margin-top:30px; padding:34px 32px 30px; background:var(--papel-elev); border:1px solid var(--hairline); border-radius:6px; }
.red-painel .red-painel-titulo{ font:400 24px/1.25 var(--serif); }
.red-painel .red-painel-texto{ margin-top:10px; font-size:15.5px; line-height:1.7; color:var(--tinta-sec); max-width:50ch; }
.red-painel-acoes{ margin-top:22px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }

@media (max-width:640px){
  .red-topo{ padding:6px 16px 2px; gap:2px 8px; flex-wrap:wrap; }
  .red-nav{ flex:1 1 100%; justify-content:space-between; gap:8px; }
  .red-nav > a{ font-size:13px; padding:15px 6px; }
  .btn-conta{ width:40px; height:40px; }
  .marca-mini-escudo{ width:18px; }
  .marca-mini span{ font-size:11px; letter-spacing:.14em; }
  .red-folha{ padding:32px 16px 60px; }
  .red-cabecalho h1{ font-size:34px; }
  .cartao{ padding:20px 20px 18px; }
  .red-adicionar{ flex-direction:column; align-items:stretch; }
}
`
