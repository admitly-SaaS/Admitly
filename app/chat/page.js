'use client'

import { useState, useEffect, useCallback, useReducer, useRef, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { temAssinaturaAtiva } from '../../lib/subscriptions.js'
import { criarEnsaioParaUsuario } from '../../lib/redacoes.js'
import { gerarMissoes } from '../../lib/atividade.js'

const PASSOS_ONBOARDING = [
  {
    titulo: 'Bem-vindo ao Admitly',
    texto: 'Aqui você conversa com seu mentor de IA para admissões internacionais. Conte seu objetivo, idade e perfil, e o Admitly te guia passo a passo.',
  },
  {
    titulo: 'Minhas aplicações',
    texto: 'Quando você mencionar uma universidade de interesse, o Admitly te oferece adicionar ela à sua lista de aplicações — com status, prazo e checklist próprio.',
  },
  {
    titulo: 'Peça um checklist',
    texto: 'Peça pro Admitly montar um cronograma ou lista de próximos passos, e adicione os itens direto à sua lista de tarefas com um clique.',
  },
]

// Chips clicáveis: linhas "TAREFA: ...", "UNIVERSIDADE: ..." e
// "SUGESTÃO_REDAÇÃO: id | Nome" (gerada pelo /api/chat) viram ações.
// O chip do rascunho é um componente próprio: componente ≠ render inline, então
// o lint do React Compiler encerra o trace nele e não acusa acesso a ref
// através do callback recebido.
function ChipRascunho({ applicationId, nome, criado, aoCriarRascunho }) {
  return (
    <div className="chip-linha chip-linha--redacao">
      <span className="chip-univ-nome">Redação de {nome}</span>
      <button
        type="button"
        className="chip-btn chip-btn--primario"
        disabled={criado}
        onClick={() => aoCriarRascunho(applicationId, nome)}
      >
        {criado ? 'Rascunho criado' : '+ Criar rascunho'}
      </button>
    </div>
  )
}

// Componente (não helper invocado durante o render): o compilador do React
// exige que a função que lê a ref chegue ao DOM por uma borda de componente —
// passá-la como prop de <MensagemAdmitly /> encerra o trace nele.
function MensagemAdmitly({ texto, aoAdicionarTarefa, aoAdicionarUniversidade, aoCriarRascunho, rascunhosCriados }) {
  const linhas = texto.split('\n')
  return linhas.map((linha, i) => {
    if (linha.startsWith('TAREFA: ')) {
      const tarefaTexto = linha.replace('TAREFA: ', '')
      return (
        <div key={i} className="chip-linha">
          <span>{tarefaTexto}</span>
          <button type="button" className="chip-btn" onClick={() => aoAdicionarTarefa(tarefaTexto)}>
            + Adicionar
          </button>
        </div>
      )
    }
    if (linha.startsWith('SUGESTÃO_REDAÇÃO: ')) {
      const [id, nome] = linha.replace('SUGESTÃO_REDAÇÃO: ', '').split(' | ')
      return (
        <ChipRascunho
          key={`chip-red-${i}`}
          applicationId={id}
          nome={nome}
          criado={rascunhosCriados.includes(id)}
          aoCriarRascunho={aoCriarRascunho}
        />
      )
    }
    if (linha.startsWith('UNIVERSIDADE: ')) {
      const nomeUniversidade = linha.replace('UNIVERSIDADE: ', '')
      return (
        <div key={i} className="chip-linha chip-linha--univ">
          <span className="chip-univ-nome">{nomeUniversidade}</span>
          <button type="button" className="chip-btn" onClick={() => aoAdicionarUniversidade(nomeUniversidade)}>
            + Minhas aplicações
          </button>
        </div>
      )
    }
    return <div key={i}>{linha || '\u00A0'}</div>
  })
}

// Subscrição ao evento 'storage' para o useSyncExternalStore do onboarding:
// cobre mudanças vindas de outras abas; na mesma aba quem força a releitura é
// o re-render manual em fecharOnboarding.
const inscreverStorage = (aoMudar) => {
  window.addEventListener('storage', aoMudar)
  return () => window.removeEventListener('storage', aoMudar)
}
const lerOnboardingVisto = () => localStorage.getItem('admitly_onboarding_visto') !== null
const onboardingVistoNoServidor = () => true

export default function Chat() {
  const router = useRouter()
  const [mensagens, setMensagens] = useState([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [userId, setUserId] = useState(null)
  const [carregandoHistorico, setCarregandoHistorico] = useState(true)
  const [aviso, setAviso] = useState('')
  const [menuAberto, setMenuAberto] = useState(false)
  const [passoAtual, setPassoAtual] = useState(0)
  const [rascunhosCriados, setRascunhosCriados] = useState([])
  // Fonte de verdade síncrona dos rascunhos criados: o state sozinho fica
  // defasado entre render e await — dois cliques rápidos passavam pelo check
  // e criavam duas redações da mesma candidatura.
  const rascunhosRef = useRef(new Set())
  const [missoes, setMissoes] = useState([])
  const fimDasMensagens = useRef(null)

  useEffect(() => {
    fimDasMensagens.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  // O flag "já viu o onboarding" vive no localStorage — uma fonte externa ao React.
  // Em vez de um effect com setState (que causava render em cascata), derivamos a
  // visibilidade com useSyncExternalStore: sem estado duplicado e, como o snapshot
  // do servidor é "já visto", a hidratação nunca diverge do HTML renderizado.
  // Na mesma aba o evento 'storage' não dispara, então fecharOnboarding força a
  // releitura com um re-render manual.
  const [, relerStorage] = useReducer((x) => x + 1, 0)
  const onboardingVisto = useSyncExternalStore(inscreverStorage, lerOnboardingVisto, onboardingVistoNoServidor)
  const mostrarOnboarding = !onboardingVisto

  useEffect(() => {
    const iniciar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)

      // Plano da semana para a abertura da conversa: a MESMA lib do perfil
      // decide o que vale fazer agora — o chat só apresenta e aponta.
      const [aps, tks, ens, ats] = (
        await Promise.all([
          supabase.from('applications').select('id, university, status, deadline').eq('user_id', user.id),
          supabase.from('tasks').select('id, application_id, done').eq('user_id', user.id),
          supabase.from('essays').select('id, title, status, application_id').eq('user_id', user.id),
          supabase.from('extracurriculares').select('id, nome, status').eq('user_id', user.id).then(
            (r) => r,
            () => ({ data: [] }) // aba pode ainda não estar migrada; degrada sem quebrar
          ),
        ])
      ).map((r) => r.data || [])

      setMissoes(gerarMissoes({ formulario: user.user_metadata?.perfil_academico || {}, aplicacoes: aps, tarefas: tks, ensaios: ens, atividades: ats }))

      // Semeia o ref com candidaturas que já têm rascunho: linhas antigas da
      // conversa com "SUGESTÃO_REDAÇÃO" reaparecem no reload desabilitadas,
      // em vez de oferecer criação duplicada. Chave SEMPRE string — o id que
      // chega do texto do chip é string e o do banco chega número.
      for (const e of ens) {
        if (e.application_id != null) rascunhosRef.current.add(String(e.application_id))
      }
      if (ens.some((e) => e.application_id != null)) setRascunhosCriados([...rascunhosRef.current])

      const ativa = await temAssinaturaAtiva(supabase, user.id)

      if (!ativa) {
        router.push('/assinar')
        return
      }

      const { data: conversas } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)

      let convId
      if (conversas && conversas.length > 0) {
        convId = conversas[0].id
      } else {
        const { data: novaConversa } = await supabase
          .from('conversations')
          .insert({ user_id: user.id })
          .select()
          .single()
        convId = novaConversa.id
      }
      setConversationId(convId)

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })

      if (msgs) {
        setMensagens(msgs.map((m) => ({ remetente: m.sender, texto: m.content })))
      }

      setCarregandoHistorico(false)
    }

    iniciar()
  }, [router])

  const fecharOnboarding = () => {
    localStorage.setItem('admitly_onboarding_visto', '1')
    relerStorage()
    setPassoAtual(0)
  }

  const proximoPasso = () => {
    if (passoAtual < PASSOS_ONBOARDING.length - 1) {
      setPassoAtual((p) => p + 1)
    } else {
      fecharOnboarding()
    }
  }

  const sair = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const adicionarTarefa = async (titulo) => {
    if (!userId) return
    await supabase.from('tasks').insert({ user_id: userId, title: titulo })
    setAviso(`"${titulo}" adicionada às suas tarefas`)
    setTimeout(() => setAviso(''), 2500)
  }

  const adicionarUniversidade = async (nome) => {
    if (!userId) return
    const { data: existente } = await supabase
      .from('applications')
      .select('id')
      .eq('user_id', userId)
      .ilike('university', nome)
      .maybeSingle()

    if (existente) {
      setAviso(`${nome} já está nas suas aplicações`)
    } else {
      await supabase.from('applications').insert({ user_id: userId, university: nome })
      setAviso(`${nome} adicionada às suas aplicações`)
    }
    setTimeout(() => setAviso(''), 2500)
  }

  // Botão do chip "SUGESTÃO_REDAÇÃO": cria o rascunho já vinculado à candidatura.
  // Dois guardas: (1) ref síncrono tranca o segundo clique antes de qualquer
  // await — dois toques rápidos criavam duas redações; (2) antes de inserir,
  // confere no banco se a candidatura já tem rascunho — a linha fica gravada
  // na conversa e o chip volta por ela após o reload (o load inicial semeia o
  // ref com as candidaturas que já têm ensaio).
  const criarRascunhoRedacao = useCallback(async (applicationId, nome) => {
    const chaveId = String(applicationId)
    if (!userId || rascunhosRef.current.has(chaveId)) return
    rascunhosRef.current.add(chaveId)
    setRascunhosCriados([...rascunhosRef.current])

    const { data: existente } = await supabase
      .from('essays')
      .select('id')
      .eq('application_id', applicationId)
      .maybeSingle()
    if (existente) {
      setAviso(`Já existe um rascunho de ${nome} na aba Redações`)
    } else {
      const { error } = await criarEnsaioParaUsuario(userId, {
        title: `Redação de ${nome}`,
        application_id: applicationId,
        status: 'ideia',
      }, supabase)
      if (error) {
        // falhou: devolve o chip para o estado clicável — dá para tentar de novo
        rascunhosRef.current.delete(chaveId)
        setRascunhosCriados([...rascunhosRef.current])
        setAviso('Não foi possível criar o rascunho agora.')
      } else {
        setAviso(`Rascunho de ${nome} criado — veja na aba Redações`)
      }
    }
    setTimeout(() => setAviso(''), 2500)
  }, [userId])

  const enviarMensagem = async () => {
    if (!input.trim() || !conversationId || carregando) return

    const textoUsuario = input
    setMensagens((prev) => [...prev, { remetente: 'usuario', texto: textoUsuario }])
    setInput('')
    setCarregando(true)

    try {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender: 'usuario',
        content: textoUsuario,
      })

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Sua sessão expirou. Entre novamente para continuar.')
      }

      const resposta = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ mensagem: textoUsuario, historico: mensagens }),
      })

      if (!resposta.ok || !resposta.body) {
        let detalhe = ''
        try {
          const erroApi = await resposta.json()
          detalhe = erroApi.erro || ''
        } catch {
          // A resposta pode não conter JSON quando o servidor falha.
        }
        throw new Error(detalhe || 'O mentor não conseguiu responder agora.')
      }

      setMensagens((prev) => [...prev, { remetente: 'admitly', texto: '' }])

      const reader = resposta.body.getReader()
      const decoder = new TextDecoder()
      let textoCompleto = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const pedaco = decoder.decode(value, { stream: true })
        textoCompleto += pedaco
        setMensagens((prev) => {
          const copia = [...prev]
          const ultimaMensagem = copia[copia.length - 1]
          if (ultimaMensagem?.remetente === 'admitly') {
            copia[copia.length - 1] = { remetente: 'admitly', texto: ultimaMensagem.texto + pedaco }
          }
          return copia
        })
      }

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender: 'admitly',
        content: textoCompleto,
      })
    } catch (error) {
      const mensagemErro = error instanceof Error ? error.message : 'O mentor não conseguiu responder agora.'
      setMensagens((prev) => [...prev, { remetente: 'admitly', texto: `Não consegui responder: ${mensagemErro}` }])
    } finally {
      setCarregando(false)
    }
  }

  if (carregandoHistorico) {
    return (
      <main className="chat-pagina">
        <style>{CSS}</style>
        <p className="carregando">Carregando conversa...</p>
      </main>
    )
  }

  return (
    <div className="chat-pagina">
      <style>{CSS}</style>

      {mostrarOnboarding && (
        <div className="onb-fundo" role="dialog" aria-modal="true">
          <div className="onb-cartao">
            <svg className="onb-escudo" viewBox="-60 -74 120 158" aria-hidden="true">
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
            <h2>{PASSOS_ONBOARDING[passoAtual].titulo}</h2>
            <p>{PASSOS_ONBOARDING[passoAtual].texto}</p>

            <div className="onb-pontos">
              {PASSOS_ONBOARDING.map((_, i) => (
                <span key={i} className={i === passoAtual ? 'ponto ativo' : 'ponto'} />
              ))}
            </div>

            <div className="onb-botoes">
              <button type="button" className="btn-fantasma" onClick={fecharOnboarding}>Pular</button>
              <button type="button" className="btn-primario" onClick={proximoPasso}>
                {passoAtual < PASSOS_ONBOARDING.length - 1 ? 'Próximo' : 'Começar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== topo ===== */}
      <header className="chat-topo">
        <div className="marca-mini">
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
          <span>Admitly</span>
        </div>

        <nav className="chat-nav">
          <a href="/oportunidades">Oportunidades</a>
          <a href="/aplicacoes">Aplicações</a>
          <a href="/redacoes">Redações</a>
          <a href="/extracurriculares">Extracurriculares</a>
          <a href="/perfil">Perfil</a>
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
              <div className="menu-popover" role="menu">
                <a href="/perfil" role="menuitem">Meu perfil acadêmico</a>
                <button type="button" role="menuitem" className="menu-sair" onClick={sair}>Sair da conta</button>
              </div>
            )}
          </div>
        </nav>
      </header>

      {aviso && (
        <div className="chat-aviso" role="status">
          {aviso}
        </div>
      )}

      {/* ===== conversa ===== */}
      <div className="chat-fluxo">
        <div className="chat-coluna">
          {mensagens.length === 0 && (
            <div className="chat-vazio">
              <p className="caps-sec">Sua conversa com o Admitly</p>
              <h2>Por onde <em>começamos?</em></h2>
              <p className="chat-vazio-sub">
                Conte o que você procura — ou pergunte o que quiser saber sobre intercâmbios, universidades e candidaturas.
              </p>

              {missoes.length > 0 && (
                <div className="chat-missoes" aria-label="Plano da semana">
                  <p className="caps-sec">Ou comece por aqui — seu plano desta semana</p>
                  <ul>
                    {missoes.map((m) => (
                      <li key={m.id}>
                        <a href={m.href}>
                          <span className="misso-titulo">{m.titulo}</span>
                          <span className="misso-detalhe">{m.detalhe}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {mensagens.map((msg, i) => (
            <div key={i} className={`mensagem ${msg.remetente === 'usuario' ? 'mensagem--usuario' : 'mensagem--admitly'}`}>
              <div className="mensagem-de">{msg.remetente === 'usuario' ? 'VOCÊ' : 'ADMITLY'}</div>
              {msg.remetente === 'usuario' ? (
                <div className="balao-usuario">{msg.texto}</div>
              ) : (
                <div className="corpo-admitly">
                  <MensagemAdmitly
                    texto={msg.texto}
                    aoAdicionarTarefa={adicionarTarefa}
                    aoAdicionarUniversidade={adicionarUniversidade}
                    aoCriarRascunho={criarRascunhoRedacao}
                    rascunhosCriados={rascunhosCriados}
                  />
                </div>
              )}
            </div>
          ))}
          {carregando && <div className="digitando">Admitly está escrevendo<span className="pontos">...</span></div>}
          <div ref={fimDasMensagens} />
        </div>
      </div>

      {/* ===== composição ===== */}
      <div className="chat-composicao">
        <div className="composicao-interna">
          <div className="compositor">
            <textarea
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  enviarMensagem()
                }
              }}
              placeholder="Escreva para o Admitly..."
              rows={1}
            />
            <button
              type="button"
              className="btn-enviar"
              onClick={enviarMensagem}
              disabled={!input.trim() || carregando}
              aria-label="Enviar mensagem"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </div>
          <p className="disclaimer">Admitly é uma IA e pode cometer erros. Confirme informações importantes.</p>
        </div>
      </div>
    </div>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');

.chat-pagina{
  --papel:#F6F2EA; --papel-elev:#FCFAF5; --tinta:#191512; --tinta-sec:#5C554B; --hairline:#E2DACB;
  --lacre:#1A4D3A; --vermelho:#A6301F; --acento:#1F3A5F;
  --serif:'Instrument Serif',Georgia,serif; --corpo:'Libre Caslon Text',Georgia,serif;
  --sans:'Instrument Sans','Helvetica Neue',sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  display:flex; flex-direction:column; height:100vh; background:var(--papel); color:var(--tinta);
  font-family:var(--corpo); -webkit-font-smoothing:antialiased;
}
.chat-pagina h2, .chat-pagina p{ margin:0; }

.carregando{
  min-height:100vh; display:flex; align-items:center; justify-content:center;
  font-family:var(--mono); font-size:12px; letter-spacing:.08em; color:var(--tinta-sec);
}
.caps-sec{
  font-family:var(--sans); text-transform:uppercase; letter-spacing:.16em;
  font-size:11px; font-weight:600; color:var(--tinta-sec);
}

/* ===== topo ===== */
.chat-topo{
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:14px 24px; border-bottom:1px solid var(--hairline); background:var(--papel);
}
.marca-mini{ display:flex; align-items:center; gap:10px; }
.marca-mini-escudo{ width:22px; height:auto; }
.marca-mini span{
  font-family:var(--sans); font-weight:600; font-size:12px;
  text-transform:uppercase; letter-spacing:.18em; color:var(--acento);
}
.chat-nav{ display:flex; align-items:center; gap:20px; }
.chat-nav a{
  font:600 13px/1 var(--sans); color:var(--tinta-sec); text-decoration:none;
}
.chat-nav a:hover{ color:var(--acento); }
.menu-conta{ position:relative; }
.btn-conta{
  width:30px; height:30px; border-radius:50%; border:1px solid var(--hairline);
  background:var(--papel-elev); color:var(--tinta-sec); cursor:pointer;
  display:grid; place-items:center; transition:border-color .15s ease, color .15s ease;
}
.btn-conta:hover{ border-color:var(--acento); color:var(--acento); }
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

/* ===== aviso ===== */
.chat-aviso{
  padding:8px 20px; text-align:center;
  font-family:var(--mono); font-size:11.5px; letter-spacing:.04em;
  color:var(--lacre); background:rgba(26,77,58,.07); border-bottom:1px solid var(--hairline);
}

/* ===== conversa ===== */
.chat-fluxo{ flex:1; overflow-y:auto; padding:28px 0 16px; }
.chat-coluna{ max-width:680px; margin:0 auto; padding:0 20px; }

.chat-vazio{ padding:36px 0 44px; }
.chat-vazio h2{ font:400 38px/1.15 var(--serif); letter-spacing:-.005em; margin-top:10px; }
.chat-vazio h2 em{ font-style:italic; }  .chat-vazio-sub{ margin-top:12px; font-size:16px; line-height:1.7; color:var(--tinta-sec); max-width:48ch; }

  /* ===== plano da semana na abertura (mesma lib do perfil) ===== */
  .chat-missoes{ margin-top:30px; text-align:left; background:var(--papel-elev); border:1px solid var(--hairline); border-radius:8px; padding:22px 26px 18px; }
  .chat-missoes ul{ list-style:none; margin:10px 0 0; padding:0; }
  .chat-missoes li{ border-top:1px solid var(--hairline); }
  .chat-missoes li:first-child{ border-top:0; }
  .chat-missoes a{ display:block; padding:10px 2px; text-decoration:none; color:inherit; border-radius:4px; }
  .chat-missoes a:hover{ background:rgba(31,58,95,.05); }
  .chat-missoes .misso-titulo{ display:block; font:400 18px/1.35 var(--serif); color:var(--tinta); }
  .chat-missoes .misso-titulo::after{ content:' →'; color:var(--acento); font-family:var(--sans); font-size:15px; }
  .chat-missoes .misso-detalhe{ display:block; margin-top:2px; font:400 13px/1.55 var(--sans); color:var(--tinta-sec); }

.mensagem{ margin-bottom:26px; display:flex; flex-direction:column; }
.mensagem--usuario{ align-items:flex-end; }
.mensagem--admitly{ align-items:flex-start; }
.mensagem-de{
  font-family:var(--mono); font-size:10px; letter-spacing:.16em; color:var(--tinta-sec); margin-bottom:6px;
}
.balao-usuario{
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:6px 6px 2px 6px;
  padding:11px 16px; max-width:80%; font-size:15.5px; line-height:1.65; white-space:pre-wrap;
}
.corpo-admitly{ font-size:16px; line-height:1.75; max-width:58ch; }
.corpo-admitly .chip-linha{
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  border:1px solid var(--hairline); border-left:3px solid var(--acento); border-radius:3px;
  background:var(--papel-elev); padding:9px 12px; margin:8px 0; font-size:14.5px;
}
.chip-linha--univ{ border-left-color:var(--lacre); }
.chip-linha--redacao{ border-left-color:var(--lacre); }
.chip-btn--primario{ border-color:var(--lacre); color:var(--lacre); }
.chip-btn--primario:not(:disabled):hover{ background:var(--lacre); color:var(--papel-elev); }
.chip-btn:disabled{ border-color:var(--hairline); color:var(--tinta-sec); cursor:default; opacity:.7; }
.chip-univ-nome{ font-weight:700; }
.chip-btn{
  flex:none; font:600 12px/1 var(--sans); padding:6px 11px; border-radius:3px; cursor:pointer;
  border:1px solid var(--acento); background:transparent; color:var(--acento);
  transition:background-color .15s ease, color .15s ease;
}
.chip-btn:hover{ background:var(--acento); color:var(--papel-elev); }
.digitando{ font-family:var(--mono); font-size:11.5px; letter-spacing:.06em; color:var(--tinta-sec); }

/* ===== composição ===== */
.chat-composicao{ padding:14px 20px 10px; border-top:1px solid var(--hairline); background:var(--papel); }
.composicao-interna{ max-width:680px; margin:0 auto; }
.compositor{
  display:flex; align-items:flex-end; gap:8px;
  border:1px solid var(--hairline); border-radius:4px; background:var(--papel-elev);
  padding:10px 10px 10px 16px; transition:border-color .15s ease;
}
.compositor:focus-within{ border-color:var(--lacre); }
.chat-input{
  flex:1; border:0; outline:none; background:transparent; resize:none;
  font:400 15.5px/1.5 var(--corpo); color:var(--tinta); padding:6px 0; max-height:160px;
}
.chat-input::placeholder{ color:#B4AB9C; }
.btn-enviar{
  display:grid; place-items:center; width:34px; height:34px; border-radius:3px; flex:none;
  border:1px solid var(--acento); background:var(--acento); color:var(--papel-elev); cursor:pointer;
  transition:background-color .15s ease, border-color .15s ease, opacity .15s ease;
}
.btn-enviar:disabled{ background:transparent; border-color:var(--hairline); color:var(--tinta-sec); cursor:default; opacity:.7; }
.btn-enviar:not(:disabled):hover{ background:#19304E; border-color:#19304E; }
.disclaimer{
  text-align:center; margin:10px 0 4px;
  font-family:var(--mono); font-size:10.5px; letter-spacing:.05em; color:var(--tinta-sec);
}

/* ===== onboarding ===== */
.onb-fundo{
  position:fixed; inset:0; z-index:100; padding:20px;
  background:rgba(25,21,18,.35); display:flex; align-items:center; justify-content:center;
}
.onb-cartao{
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:8px;
  padding:36px 32px 28px; max-width:380px; width:100%; text-align:center;
  display:flex; flex-direction:column; align-items:center; gap:0;
}
.onb-escudo{ width:40px; height:auto; margin-bottom:16px; }
.onb-cartao h2{ font:400 24px/1.2 var(--serif); }
.onb-cartao p{ margin-top:12px; font-size:14.5px; line-height:1.65; color:var(--tinta-sec); }
.onb-pontos{ display:flex; gap:6px; margin:22px 0 20px; }
.onb-pontos .ponto{ width:6px; height:6px; border-radius:50%; background:var(--hairline); }
.onb-pontos .ponto.ativo{ background:var(--acento); }
.onb-botoes{ display:flex; gap:8px; width:100%; }
.btn-fantasma{
  flex:1; padding:11px 0; font:600 13px/1 var(--sans); cursor:pointer;
  border:1px solid var(--hairline); border-radius:3px; background:transparent; color:var(--tinta-sec);
}
.btn-fantasma:hover{ border-color:var(--tinta-sec); color:var(--tinta); }
.btn-primario{
  flex:1; padding:11px 0; font:600 13px/1 var(--sans); cursor:pointer;
  border:1px solid var(--acento); border-radius:3px; background:var(--acento); color:var(--papel-elev);
}
.btn-primario:hover{ background:#19304E; border-color:#19304E; }

@media (max-width:640px){
  .chat-topo{ padding:6px 16px 2px; gap:2px 8px; flex-wrap:wrap; }
  .chat-nav{ flex:1 1 100%; justify-content:space-between; gap:8px; }
  /* alvos de toque: 44px de altura é o mínimo confortável no polegar */
  .chat-nav a{ font-size:13px; padding:15px 6px; }
  .btn-conta{ width:40px; height:40px; }
  /* marca compacta na linha de cima */
  .marca-mini-escudo{ width:18px; }
  .marca-mini span{ font-size:11px; letter-spacing:.14em; }
  .chat-coluna{ padding:0 14px; }
  .composicao-interna{ padding:0; }
  .balao-usuario{ max-width:92%; }
  .chat-input{ font-size:16px; }
}
`
