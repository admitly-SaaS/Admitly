'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import {
  criarAtividade,
  listarAtividades,
  atualizarAtividade as atualizarAtividadeDb,
  removerAtividade as removerAtividadeDb,
  contarAtividades,
  vagasComunsApp,
  CATEGORIAS,
  RÓTULO_CATEGORIA,
  RÓTULO_STATUS,
} from '../../lib/extracurriculares.js'

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

// ---- formulário de nova atividade (embutido, disciplina de 1 campo por vez) ----
const FORM_VAZIO = { nome: '', papel: '', categoria: 'outra', horas_semana: '', descricao: '' }

export default function Extracurriculares() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [atividades, setAtividades] = useState([])
  const [mensagem, setMensagem] = useState(null)
  const [menuAberto, setMenuAberto] = useState(false)
  const [form, setForm] = useState(FORM_VAZIO)
  const [formAberto, setFormAberto] = useState(false)
  const [trash, setTrash] = useState(null)
  const [listandoId, setListandoId] = useState(null)
  const [editandoId, setEditandoId] = useState(null)
  const [editForm, setEditForm] = useState(null)

  const notificar = (texto, tipo = 'ok') => {
    setMensagem({ texto, tipo })
    setTimeout(() => setMensagem(null), 5000)
  }

  useEffect(() => {
    const iniciar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await listarAtividades(user.id, supabase)
      setAtividades(data || [])
      setCarregando(false)
    }
    iniciar()
  }, [router])

  const criar = async (event) => {
    event.preventDefault()
    if (!form.nome.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await criarAtividade(user.id, form, supabase)
    if (error) { notificar('Não foi possível criar a atividade agora.', 'erro'); return }
    const { data: recarregadas } = await listarAtividades(user.id, supabase)
    setAtividades(recarregadas || [])
    setForm(FORM_VAZIO)
    setFormAberto(false)
    notificar(data ? 'Atividade criada.' : 'Atividade criada.')
  }

  const salvarEdicao = async () => {
    if (!editandoId || !editForm?.nome?.trim()) return
    const { error } = await atualizarAtividadeDb(editandoId, editForm, supabase)
    if (error) { notificar('Não foi possível salvar a edição.', 'erro'); return }
    setAtividades((atual) => atual.map((a) => (a.id === editandoId ? { ...a, ...editForm } : a)))
    setEditandoId(null)
    setEditForm(null)
    notificar('Atividade atualizada.')
  }

  const remover = async (id) => {
    setTrash(null)
    setAtividades((atual) => atual.filter((a) => a.id !== id))
    const { error } = await removerAtividadeDb(id, supabase)
    if (error) {
      notificar('Não foi possível remover agora.', 'erro')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await listarAtividades(user.id, supabase)
      setAtividades(data || [])
    } else {
      notificar('Atividade removida.')
    }
  }

  // IA no clique: rota /api/extracurriculares/descricao, texto volta pronto
  // para o formulário do Common App — o aluno edita antes de aceitar.
  const pedirListagem = async (id) => {
    setListandoId(id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Sessão expirou. Entre de novo.')
      const resposta = await fetch('/api/extracurriculares/descricao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ atividadeId: id }),
      })
      if (!resposta.ok) {
        let detalhe = ''
        try { detalhe = (await resposta.json())?.erro || '' } catch { /* sem json */ }
        throw new Error(detalhe || 'Listagem não saiu agora.')
      }
      const { descricao } = await resposta.json()
      if (!descricao || !descricao.trim()) throw new Error('Listagem não saiu agora.')
      await atualizarAtividadeDb(id, { descricao_polida: descricao.trim(), status: 'listagem_pronta' }, supabase)
      setAtividades((atual) => atual.map((a) => (a.id === id ? { ...a, descricao_polida: descricao.trim(), status: 'listagem_pronta' } : a)))
      notificar('Listagem pronta — revise e edite se quiser.')
    } catch (err) {
      notificar(err instanceof Error ? err.message : 'Listagem não saiu agora.', 'erro')
    } finally {
      setListandoId(null)
    }
  }

  const salvarDescricaoPolida = async (id, descricao_polida) => {
    setAtividades((atual) => atual.map((a) => (a.id === id ? { ...a, descricao_polida } : a)))
    const { error } = await atualizarAtividadeDb(id, { descricao_polida }, supabase)
    if (error) notificar('Não foi possível salvar a listagem.', 'erro')
  }

  const mudarStatus = async (id, status) => {
    setAtividades((atual) => atual.map((a) => (a.id === id ? { ...a, status } : a)))
    const { error } = await atualizarAtividadeDb(id, { status }, supabase)
    if (error) notificar('Não foi possível mudar o status.', 'erro')
  }

  const contagem = contarAtividades(atividades)
  const vagas = vagasComunsApp(atividades)

  if (carregando) {
    return (
      <main className="ext-pagina">
        <style>{CSS}</style>
        <p className="carregando">Carregando suas atividades...</p>
      </main>
    )
  }

  return (
    <main className="ext-pagina">
      <style>{CSS}</style>

      {/* ===== topo (mesma anatomia das outras abas) ===== */}
      <header className="ext-topo">
        <div className="marca-mini">{ESCUDO}<span>Admitly</span></div>
        <nav className="ext-nav">
          <a href="/oportunidades">Oportunidades</a>
          <a href="/aplicacoes">Aplicações</a>
          <a href="/redacoes">Redações</a>
          <a href="/extracurriculares" className="ativo" aria-current="page">Extracurriculares</a>
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
                  <button type="button" role="menuitem" className="menu-sair" onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>Sair da conta</button>
                </div>
              </>
            )}
          </div>
        </nav>
      </header>

      <div className="ext-folha">
        <header className="ext-cabecalho">
          <span className="caps-sec">Sua trajetória</span>
          <h1>Minhas <em>extracurriculares</em>.</h1>
          <p className="ext-intro">
            Cada atividade aqui vira uma linha do formulário de candidatura. Peça a
            listagem pronta (até 150 caracteres, verbo forte — o formato do Common App)
            e marque o que já foi enviado.
          </p>
          <p className="ext-meta">
            <span>{contagem.total} {contagem.total === 1 ? 'ATIVIDADE' : 'ATIVIDADES'}</span>
            <span>{contagem.listagem_pronta} COM LISTAGEM PRONTA · {contagem.enviada} ENVIADA{contagem.enviada === 1 ? '' : 'S'}</span>
            <span>VAGAS COMUNS APP: {vagas.usadas}/10</span>
          </p>
        </header>

        {mensagem && (
          <p className={`ext-mensagem ${mensagem.tipo === 'erro' ? 'ext-mensagem--erro' : 'ext-mensagem--ok'}`} role="status">
            {mensagem.texto}
          </p>
        )}

        {/* ===== adicionar ===== */}
        {formAberto ? (
          <form className="ext-adicionar ext-adicionar--aberto" onSubmit={criar}>
            <div className="ext-form-linha">
              <div className="campo campo--cresce">
                <label className="caps-sec" htmlFor="ext-nome">Nome da atividade</label>
                <input id="ext-nome" name="nome" value={form.nome} placeholder="ex: Clube de Robótica da escola" autoComplete="off" maxLength={80} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
              </div>
              <div className="campo">
                <label className="caps-sec" htmlFor="ext-categoria">Categoria</label>
                <select id="ext-categoria" name="categoria" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{RÓTULO_CATEGORIA[c]}</option>)}
                </select>
              </div>
            </div>
            <div className="ext-form-linha">
              <div className="campo">
                <label className="caps-sec" htmlFor="ext-papel">Seu papel</label>
                <input id="ext-papel" name="papel" value={form.papel} placeholder="ex: Capitã do time" autoComplete="off" maxLength={80} onChange={(e) => setForm((f) => ({ ...f, papel: e.target.value }))} />
              </div>
              <div className="campo campo--pequeno">
                <label className="caps-sec" htmlFor="ext-horas">Horas por semana</label>
                <input id="ext-horas" name="horas_semana" type="number" min="0" max="80" step="0.5" value={form.horas_semana} placeholder="ex: 6" onChange={(e) => setForm((f) => ({ ...f, horas_semana: e.target.value }))} />
              </div>
            </div>
            <div className="campo">
              <label className="caps-sec" htmlFor="ext-descricao">O que você faz — fatos, números, resultado</label>
              <textarea id="ext-descricao" name="descricao" rows={3} value={form.descricao} placeholder="ex: organizo 2 torneios por ano com 12 equipes; montei um dron no 9º ano..." onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="ext-form-acoes">
              <button type="submit" className="btn-primario">Criar atividade</button>
              <button type="button" className="btn-secundario" onClick={() => { setFormAberto(false); setForm(FORM_VAZIO) }}>Cancelar</button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn-primario ext-botao-nova" onClick={() => setFormAberto(true)}>
            + Adicionar atividade
          </button>
        )}

        {/* ===== lista ===== */}
        {atividades.length === 0 ? (
          <div className="ext-painel">
            <p className="ext-painel-titulo">Nenhuma atividade por aqui ainda.</p>
            <p className="ext-painel-texto">
              Anote o que você faz fora da sala de aula — clube, esporte, projeto, trabalho,
              cuidado com alguém. As candidaturas perguntam exatamente isso, e vale mais
              quando está bem contado.
            </p>
          </div>
        ) : (
          <div className="ext-lista">
            {atividades.map((a) => {
              const listando = listandoId === a.id
              const editando = editandoId === a.id
              if (editando) {
                // edição inline: mesmo formulário, estado próprio
                return (
                  <article key={a.id} className="cartao aberto" data-atividade={a.id}>
                    <div className="ext-form-linha">
                      <div className="campo campo--cresce">
                        <label className="caps-sec" htmlFor={`ed-nome-${a.id}`}>Nome</label>
                        <input id={`ed-nome-${a.id}`} value={editForm.nome} maxLength={80} onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))} />
                      </div>
                      <div className="campo">
                        <label className="caps-sec" htmlFor={`ed-cat-${a.id}`}>Categoria</label>
                        <select id={`ed-cat-${a.id}`} value={editForm.categoria} onChange={(e) => setEditForm((f) => ({ ...f, categoria: e.target.value }))}>
                          {CATEGORIAS.map((c) => <option key={c} value={c}>{RÓTULO_CATEGORIA[c]}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="ext-form-linha">
                      <div className="campo campo--cresce">
                        <label className="caps-sec" htmlFor={`ed-papel-${a.id}`}>Papel</label>
                        <input id={`ed-papel-${a.id}`} value={editForm.papel} maxLength={80} onChange={(e) => setEditForm((f) => ({ ...f, papel: e.target.value }))} />
                      </div>
                      <div className="campo campo--pequeno">
                        <label className="caps-sec" htmlFor={`ed-horas-${a.id}`}>Horas/semana</label>
                        <input id={`ed-horas-${a.id}`} type="number" min="0" max="80" step="0.5" value={editForm.horas_semana ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, horas_semana: e.target.value }))} />
                      </div>
                    </div>
                    <div className="campo">
                      <label className="caps-sec" htmlFor={`ed-desc-${a.id}`}>Fatos</label>
                      <textarea id={`ed-desc-${a.id}`} rows={3} value={editForm.descricao} onChange={(e) => setEditForm((f) => ({ ...f, descricao: e.target.value }))} />
                    </div>
                    <div className="ext-form-acoes">
                      <button type="button" className="btn-primario" onClick={salvarEdicao}>Salvar</button>
                      <button type="button" className="btn-secundario" onClick={() => { setEditandoId(null); setEditForm(null) }}>Cancelar</button>
                    </div>
                  </article>
                )
              }

              return (
                <article key={a.id} className={`cartao ${a.status === 'enviada' ? 'cartao--enviada' : ''}`} data-atividade={a.id}>
                  <div className="cartao-topo">
                    <span className="vinculo">
                      {RÓTULO_CATEGORIA[a.categoria]?.toUpperCase()} {a.horas_semana != null ? `· ${a.horas_semana}H/SEM` : ''}
                    </span>
                    <span className="tag-status">
                      <i className={`dot dot--${a.status}`} aria-hidden="true" />
                      <select value={a.status} aria-label={`Status de ${a.nome}`} onClick={(e) => e.stopPropagation()} onChange={(e) => mudarStatus(a.id, e.target.value)}>
                        {Object.entries(RÓTULO_STATUS).map(([valor, rótulo]) => <option key={valor} value={valor}>{rótulo}</option>)}
                      </select>
                    </span>
                  </div>
                  <h2 className="nome-atividade">{a.nome}</h2>
                  {a.papel && <p className="papel-atividade">{a.papel}</p>}

                  {a.descricao_polida ? (
                    <div className="caixa-listagem">
                      <span className="caps-sec">Listagem pronta · {a.descricao_polida.length} CARACTERES</span>
                      <textarea
                        spellCheck="false"
                        data-listagem={a.id}
                        value={a.descricao_polida}
                        onChange={(e) => salvarDescricaoPolida(a.id, e.target.value)}
                        maxLength={300}
                        aria-label={`Descrição polida de ${a.nome}`}
                      />
                    </div>
                  ) : (
                    <p className="sem-listagem">
                      {a.descricao ? 'Fatos anotados — peça a listagem pronta.' : 'Comece pelos fatos: o que fez, com quem, que tamanho.'}
                    </p>
                  )}

                  {a.descricao && !a.descricao_polida && (
                    <p className="fatos-brutos">{a.descricao}</p>
                  )}

                  <div className="acoes">
                    <button type="button" className="btn-secundario" disabled={listando} onClick={() => pedirListagem(a.id)}>
                      {listando ? 'Listando...' : a.descricao_polida ? 'Refazer listagem' : 'Peça listagem'}
                    </button>
                    <button type="button" className="btn-secundario" onClick={() => { setEditandoId(a.id); setEditForm({ nome: a.nome, papel: a.papel, categoria: a.categoria, horas_semana: a.horas_semana ?? '', descricao: a.descricao, inicio: a.inicio, fim: a.fim }) }}>
                      Editar
                    </button>
                    <button type="button" className="btn-link btn-link--discreto" onClick={() => setTrash(a.id)}>
                      Remover
                    </button>
                    {trash === a.id && (
                      <>
                        <button type="button" className="btn-link btn-link--vermelho" onClick={() => remover(a.id)}>Confirmar</button>
                        <button type="button" className="btn-link" onClick={() => setTrash(null)}>Cancelar</button>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');

.ext-pagina{
  --papel:#F6F2EA; --papel-elev:#FCFAF5; --tinta:#191512; --tinta-sec:#5C554B; --hairline:#E2DACB;
  --lacre:#1A4D3A; --vermelho:#A6301F; --acento:#1F3A5F;
  --serif:'Instrument Serif',Georgia,serif; --corpo:'Libre Caslon Text',Georgia,serif;
  --sans:'Instrument Sans','Helvetica Neue',sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  min-height:100vh; background:var(--papel); color:var(--tinta);
  font-family:var(--corpo); -webkit-font-smoothing:antialiased;
}
.ext-pagina h1,.ext-pagina h2,.ext-pagina p{ margin:0; }
.caps-sec{ font-family:var(--sans); text-transform:uppercase; letter-spacing:.16em; font-size:11px; font-weight:600; color:var(--tinta-sec); }
.carregando{ padding:72px 0; text-align:center; font-family:var(--mono); font-size:12px; letter-spacing:.08em; color:var(--tinta-sec); }
.ext-topo{ display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 24px; border-bottom:1px solid var(--hairline); background:var(--papel); }
.marca-mini{ display:flex; align-items:center; gap:10px; }
.marca-mini-escudo{ width:22px; height:auto; }
.marca-mini span{ font:600 12px/1 var(--sans); text-transform:uppercase; letter-spacing:.18em; color:var(--acento); }
.ext-nav{ display:flex; align-items:center; gap:20px; }
.ext-nav > a{ font:600 13px/1 var(--sans); color:var(--tinta-sec); text-decoration:none; }
.ext-nav > a:hover, .ext-nav > a.ativo{ color:var(--acento); }
.menu-conta{ position:relative; }
.btn-conta{ width:30px; height:30px; border-radius:50%; border:1px solid var(--hairline); background:var(--papel-elev); color:var(--tinta-sec); cursor:pointer; display:grid; place-items:center; }
.btn-conta:hover{ border-color:var(--acento); color:var(--acento); }
.menu-scrim{ position:fixed; inset:0; z-index:20; background:transparent; border:0; cursor:default; }
.menu-popover{ position:absolute; top:38px; right:0; z-index:30; min-width:190px; background:var(--papel-elev); border:1px solid var(--hairline); border-radius:4px; overflow:hidden; }
.menu-popover a,.menu-sair{ display:block; width:100%; padding:11px 16px; text-align:left; font:600 13px/1 var(--sans); color:var(--tinta); text-decoration:none; border:0; background:transparent; cursor:pointer; }
.menu-popover a:hover,.menu-sair:hover{ background:rgba(31,58,95,.06); }
.menu-sair{ color:var(--vermelho) !important; }

.ext-folha{ max-width:880px; margin:0 auto; padding:44px 28px 90px; }
.ext-cabecalho h1{ font:400 44px/1.1 var(--serif); letter-spacing:-.005em; margin-top:12px; }
.ext-cabecalho h1 em{ font-style:italic; }
.ext-intro{ margin-top:16px; font-size:16.5px; line-height:1.75; color:var(--tinta-sec); max-width:54ch; }
.ext-meta{ margin-top:24px; padding-top:14px; border-top:1px solid var(--tinta); display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; color:var(--tinta-sec); }

.ext-mensagem{ margin-top:16px; font-family:var(--mono); font-size:11.5px; letter-spacing:.04em; }
.ext-mensagem--ok{ color:var(--lacre); }
.ext-mensagem--erro{ color:var(--vermelho); }

.btn-primario{ font:600 15px/1 var(--sans); padding:13px 24px; border-radius:3px; cursor:pointer; background:var(--acento); color:var(--papel-elev); border:1px solid var(--acento); flex:none; }
.btn-primario:hover{ background:#19304E; border-color:#19304E; }
.btn-primario:disabled{ background:#DAD2C2; border-color:#DAD2C2; color:#8F8678; cursor:not-allowed; }
.ext-botao-nova{ margin-top:30px; }
.btn-secundario{ font:600 13px/1 var(--sans); padding:10px 16px; border-radius:3px; cursor:pointer; background:transparent; color:var(--tinta); border:1px solid var(--hairline); }
.btn-secundario:hover{ border-color:var(--acento); color:var(--acento); }
.btn-secundario:disabled{ background:#DAD2C2; border-color:#DAD2C2; color:#8F8678; cursor:not-allowed; }
.btn-link{ font:600 13px/1 var(--sans); color:var(--acento); background:none; border:0; cursor:pointer; text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1.5px; padding:0; }
.btn-link:hover{ color:#19304E; }
.btn-link--discreto{ color:var(--tinta-sec); }
.btn-link--vermelho{ color:var(--vermelho); }

.ext-adicionar{ margin-top:30px; padding:22px 26px 20px; background:var(--papel-elev); border:1px solid var(--hairline); border-radius:6px; display:flex; flex-direction:column; gap:14px; }
.ext-form-linha{ display:flex; gap:16px; flex-wrap:wrap; }
.ext-form-acoes{ display:flex; gap:12px; align-items:center; }
.campo{ display:flex; flex-direction:column; gap:6px; }
.campo--cresce{ flex:1; min-width:220px; }
.campo--pequeno{ width:140px; }
.campo input,.campo select,.campo textarea{ border:1px solid var(--hairline); border-radius:3px; background:var(--papel); padding:9px 11px; font:400 15.5px var(--corpo); color:var(--tinta); resize:vertical; }
.campo input::placeholder,.campo textarea::placeholder{ color:#B4AB9C; }
.campo input:focus,.campo select:focus,.campo textarea:focus{ outline:none; border-color:var(--lacre); box-shadow:0 1px 0 0 var(--lacre); }

.ext-lista{ display:flex; flex-direction:column; gap:0; }
.cartao{ margin-top:22px; padding:22px 26px 20px; background:var(--papel-elev); border:1px solid var(--hairline); border-radius:6px; }
.cartao--enviada{ border-left:3px solid var(--lacre); }
.cartao-topo{ display:flex; align-items:center; justify-content:space-between; gap:14px; padding-bottom:12px; border-bottom:1px solid var(--hairline); font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; color:var(--tinta-sec); }
.vinculo{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tag-status{ display:flex; align-items:center; gap:8px; flex:none; white-space:nowrap; }
.dot{ display:inline-block; width:8px; height:8px; border-radius:50%; flex:none; }
.dot--em_curso{ background:transparent; border:1.5px solid var(--tinta-sec); }
.dot--listagem_pronta{ background:var(--lacre); box-shadow:0 0 0 3px rgba(26,77,58,.14); }
.dot--usada_em_redacao{ background:var(--acento); box-shadow:0 0 0 3px rgba(31,58,95,.14); }
.dot--enviada{ background:var(--tinta); }
.status{ position:relative; display:inline-flex; align-items:center; }
.status .dot{ position:absolute; left:11px; pointer-events:none; }
.tag-status select{ appearance:none; cursor:pointer; font:600 13px/1 var(--sans); color:var(--tinta); padding:9px 30px; border:1px solid var(--hairline); border-radius:3px; background:var(--papel) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%235C554B' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 11px center; }

.nome-atividade{ margin-top:16px; font:400 26px/1.2 var(--serif); letter-spacing:-.005em; }
.papel-atividade{ margin-top:4px; font-size:15px; color:var(--tinta-sec); font-style:italic; }
.sem-listagem{ margin-top:12px; font-size:15px; color:var(--tinta-sec); font-style:italic; }
.fatos-brutos{ margin-top:10px; padding:10px 14px; background:var(--papel); border:1px dashed var(--hairline); border-radius:4px; font-size:14.5px; line-height:1.6; color:var(--tinta-sec); }

.caixa-listagem{ margin-top:12px; padding:14px 16px; background:var(--papel); border:1px solid var(--hairline); border-left:3px solid var(--lacre); border-radius:4px; display:flex; flex-direction:column; gap:8px; }
.caixa-listagem textarea{ width:100%; min-height:64px; resize:vertical; border:1px solid var(--hairline); border-radius:4px; background:var(--papel-elev); padding:10px 12px; font:400 15px/1.6 var(--corpo); color:var(--tinta); }
.caixa-listagem textarea:focus{ outline:none; border-color:var(--lacre); box-shadow:0 1px 0 0 var(--lacre); }

.acoes{ margin-top:16px; display:flex; gap:18px; flex-wrap:wrap; align-items:center; }

.ext-painel{ margin-top:30px; padding:34px 32px 30px; background:var(--papel-elev); border:1px solid var(--hairline); border-radius:6px; }
.ext-painel .ext-painel-titulo{ font:400 24px/1.25 var(--serif); }
.ext-painel .ext-painel-texto{ margin-top:10px; font-size:15.5px; line-height:1.7; color:var(--tinta-sec); max-width:50ch; }

@media (max-width:640px){
  .ext-topo{ padding:6px 16px 2px; gap:2px 8px; flex-wrap:wrap; }
  .ext-nav{ flex:1 1 100%; justify-content:space-between; gap:8px; }
  .ext-nav > a{ font-size:13px; padding:15px 4px; }
  .btn-conta{ width:40px; height:40px; }
  .marca-mini-escudo{ width:18px; }
  .marca-mini span{ font-size:11px; letter-spacing:.14em; }
  .ext-folha{ padding:32px 16px 60px; }
  .ext-cabecalho h1{ font-size:34px; }
  .cartao{ padding:20px 20px 18px; }
  .ext-adicionar{ padding:18px 18px 16px; }
}
`
