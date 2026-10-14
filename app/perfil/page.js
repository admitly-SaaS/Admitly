'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { listarAtividades, resumoParaPerfil } from '../../lib/extracurriculares.js'
import { calcularStreak, linhaStreak, prontidao as calcularProntidao, gerarMissoes, proximoPrazo } from '../../lib/atividade.js'

// Chaves e valores dos campos são os MESMOS de sempre:
// o chat e as recomendações leem user_metadata.perfil_academico — não renomear.
const CAMPOS_INICIAIS = {
  objetivo: '',
  idade: '',
  anoEscolar: '',
  areaInteresse: '',
  notas: '',
  atividades: '',
  orcamento: '',
  paisPreferencia: '',
  nivelIngles: '',
}

const TOTAL_CAMPOS = Object.keys(CAMPOS_INICIAIS).length

export default function Perfil() {
  const router = useRouter()
  const [formulario, setFormulario] = useState(CAMPOS_INICIAIS)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [msgBoa, setMsgBoa] = useState(false)
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState('')
  const [atividadesResumo, setAtividadesResumo] = useState('')
  const [semana, setSemana] = useState(null)

  // ===== Sua semana: coleta de dados para as três métricas ================
  async function montarSemana(user, perfilSalvo, atividades) {
    // Coleta com o client de RLS (anon): só o que é do próprio usuário.
    const [aplicacoes, tarefas, ensaios] = (
      await Promise.all([
        supabase.from('applications').select('id, university, status, deadline, created_at').eq('user_id', user.id),
        supabase.from('tasks').select('id, application_id, done, created_at').eq('user_id', user.id),
        supabase.from('essays').select('id, title, status, updated_at').eq('user_id', user.id).then(
          (r) => r,
          () => ({ data: [] })
        ),
      ])
    ).map((r) => r.data || [])

    const dados = { formulario: perfilSalvo, aplicacoes, tarefas, ensaios, atividades }

    const acoes = [
      ...aplicacoes.map((ap) => ap.created_at),
      ...tarefas.map((t) => t.created_at),
      ...ensaios.map((e) => e.updated_at),
      ...atividades.map((a) => a.updated_at),
      perfilSalvo?.atualizado_em,
    ].filter(Boolean)

    setSemana({
      missoes: gerarMissoes(dados),
      prontidao: calcularProntidao(dados),
      streak: calcularStreak(acoes),
      prazo: proximoPrazo(aplicacoes),
    })
  }

  useEffect(() => {
    const carregarPerfil = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const salvo = user.user_metadata?.perfil_academico || {}
      setFormulario({ ...CAMPOS_INICIAIS, ...salvo })
      if (salvo.atualizado_em) {
        try {
          setUltimaAtualizacao(new Date(salvo.atualizado_em).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }))
        } catch { /* ignore */ }
      }
      // resumo da lista detalhada: se o aluno mantém atividades na aba
      // Extracurriculares, ofereço preencher o campo de uma vez
      const ats = await listarAtividades(user.id, supabase)
      const atividades = ats?.data || []
      setAtividadesResumo(resumoParaPerfil(atividades))
      montarSemana(user, salvo, atividades)
      setCarregando(false)
    }

    carregarPerfil()
  }, [router])

  const atualizarCampo = (nome, valor) => {
    setFormulario((atual) => ({ ...atual, [nome]: valor }))
    setMensagem('')
  }

  const preenchidos = Object.entries(formulario)
    .filter(([chave, valor]) => chave !== 'atualizado_em' && String(valor).trim() !== '').length

  const salvarPerfil = async (event) => {
    event.preventDefault()
    setSalvando(true)
    setMensagem('')

    const { error } = await supabase.auth.updateUser({
      data: { perfil_academico: { ...formulario, atualizado_em: new Date().toISOString() } },
    })

    if (error) {
      setMsgBoa(false)
      setMensagem('Não foi possível salvar seu perfil. Tente novamente.')
    } else {
      setMsgBoa(true)
      setUltimaAtualizacao(new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }))
      setMensagem('Perfil salvo com sucesso.')
    }
    setSalvando(false)
  }

  if (carregando) {
    return (
      <main className="perfil-pagina">
        <style>{CSS}</style>
        <p className="carregando">Carregando perfil...</p>
      </main>
    )
  }

  return (
    <main className="perfil-pagina">
      <style>{CSS}</style>

      {/* ===== topo ===== */}
      <header className="perfil-topo">
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
        <a className="btn-link" href="/chat">Voltar ao chat</a>
      </header>

      {/* ===== folha ===== */}
      <div className="perfil-folha">
        <header className="perfil-cabecalho">
          <span className="caps-sec">Seu cadastro</span>
          <h1>Meu perfil <em>acadêmico</em>.</h1>
          <p>
            Essas informações ajudam o Admitly a adaptar recomendações, prazos e universidades ao seu momento. Preencha com calma — quanto melhor você se conta, melhores ficam as indicações.
          </p>
        </header>

        {/* ===== Sua semana: plano + prontidão + streak ===== */}
          {semana && (
            <section className="semana-cartao" aria-label="Sua semana atual">
              <div className="semana-topo">
                <span className="caps-sec">Sua semana</span>
                <span className="semana-streak" title={linhaStreak(semana.streak)}>
                  <i className={semana.streak.emRisco ? 'dot dot--dourado' : 'dot dot--lacre'} aria-hidden="true" />
                  {semana.streak.semanas > 0 ? `${semana.streak.semanas} SEMANA${semana.streak.semanas === 1 ? '' : 'S'}` : 'PRIMEIRA SEMANA'}
                </span>
              </div>

              <ol className="semana-missoes">
                {semana.missoes.length > 0 ? (
                  semana.missoes.map((m) => (
                    <li key={m.id}>
                      <a href={m.href}>
                        <span className="misso-titulo">{m.titulo}</span>
                        <span className="misso-detalhe">{m.detalhe}</span>
                      </a>
                    </li>
                  ))
                ) : (
                  <li className="misso-limpo">
                    <span className="misso-detalhe">Sem nada pendente esta semana — parabéns, raro e bom.</span>
                  </li>
                )}
              </ol>

              <div className="semana-prontidao">
                <span className="prontidao-escrita">PRONTIDÃO DA CANDIDATURA</span>
                <div
                  className="prontidao-barra"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={semana.prontidao.score}
                >
                  <span className="prontidao-recheio" style={{ width: `${Math.min(100, Math.max(0, semana.prontidao.score))}%` }} />
                </div>
                <span className="prontidao-nota">{semana.prontidao.score}%</span>
              </div>
              <ul className="semana-componentes">
                {semana.prontidao.componentes.map((c) => (
                  <li key={c.chave}>
                    <span className="comp-nome">{c.rotulo}</span>
                    <span className="comp-nota" title={c.nota}>{c.nota}</span>
                    <span className="comp-pontos">{c.ganho}/{c.maximo}</span>
                  </li>
                ))
                }
              </ul>

              {semana.prazo && (
                <p className="semana-prazo">
                  Próximo prazo: <strong>{semana.prazo.nome}</strong> —{' '}
                  {semana.prazo.dias === 0 ? 'fecha hoje' : semana.prazo.dias === 1 ? 'fecha amanhã' : `fecha em ${semana.prazo.dias} dias`}{' '}
                  ({semana.prazo.data}).
                </p>
              )}
            </section>
          )}

        <form className="perfil-form" onSubmit={salvarPerfil}>
          <span className="caps-sec">Seu momento</span>

          <div className="campo">
            <label className="caps-sec" htmlFor="perfil-objetivo">Qual é seu objetivo?</label>
            <select
              id="perfil-objetivo"
              value={formulario.objetivo}
              onChange={(event) => atualizarCampo('objetivo', event.target.value)}
            >
              <option value="">Selecione uma opção</option>
              <option value="intercambio de curta duração">Intercâmbio de curta duração</option>
              <option value="graduacao completa no exterior">Graduação completa no exterior</option>
              <option value="ainda não decidi">Ainda não decidi</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <div className="linha-duo">
            <div className="campo">
              <label className="caps-sec" htmlFor="perfil-idade">Idade</label>
              <input
                id="perfil-idade"
                type="number"
                min={10}
                max={100}
                placeholder="Ex: 17"
                value={formulario.idade}
                onChange={(event) => atualizarCampo('idade', event.target.value)}
              />
            </div>
            <div className="campo">
              <label className="caps-sec" htmlFor="perfil-ano">Ano escolar atual</label>
              <select
                id="perfil-ano"
                value={formulario.anoEscolar}
                onChange={(event) => atualizarCampo('anoEscolar', event.target.value)}
              >
                <option value="">Selecione</option>
                <option value="8º ano do ensino fundamental">8º ano do ensino fundamental</option>
                <option value="9º ano do ensino fundamental">9º ano do ensino fundamental</option>
                <option value="1º ano do ensino médio">1º ano do ensino médio</option>
                <option value="2º ano do ensino médio">2º ano do ensino médio</option>
                <option value="3º ano do ensino médio">3º ano do ensino médio</option>
                <option value="já concluí o ensino médio">Já concluí o ensino médio</option>
                <option value="faculdade em andamento">Faculdade em andamento</option>
              </select>
            </div>
          </div>

          <span className="caps-sec">Seu direcionamento</span>

          <div className="campo">
            <label className="caps-sec" htmlFor="perfil-area">Área ou curso de interesse</label>
            <input
              id="perfil-area"
              type="text"
              placeholder="Ex: Engenharia, Economia, Design"
              value={formulario.areaInteresse}
              onChange={(event) => atualizarCampo('areaInteresse', event.target.value)}
            />
          </div>

          <div className="linha-duo">
            <div className="campo">
              <label className="caps-sec" htmlFor="perfil-pais">País ou região de preferência</label>
              <input
                id="perfil-pais"
                type="text"
                placeholder="Ex: Estados Unidos ou Europa"
                value={formulario.paisPreferencia}
                onChange={(event) => atualizarCampo('paisPreferencia', event.target.value)}
              />
            </div>
            <div className="campo">
              <label className="caps-sec" htmlFor="perfil-orcamento">Orçamento aproximado</label>
              <input
                id="perfil-orcamento"
                type="text"
                placeholder="Ex: R$ 80 mil por ano"
                value={formulario.orcamento}
                onChange={(event) => atualizarCampo('orcamento', event.target.value)}
              />
            </div>
          </div>

          <span className="caps-sec">Seus méritos</span>

          <div className="campo">
            <label className="caps-sec" htmlFor="perfil-notas">Como estão suas notas?</label>
            <textarea
              id="perfil-notas"
              rows={3}
              placeholder="Ex: média 8,5; melhores notas em matemática e física"
              value={formulario.notas}
              onChange={(event) => atualizarCampo('notas', event.target.value)}
            />
          </div>

          <div className="campo">
            <label className="caps-sec" htmlFor="perfil-atividades">Atividades extracurriculares</label>
            <textarea
              id="perfil-atividades"
              rows={3}
              placeholder="Ex: iniciação científica, esporte, voluntariado, projetos"
              value={formulario.atividades}
              onChange={(event) => atualizarCampo('atividades', event.target.value)}
            />
            <p className="dica-campo">
              Dica: detalhe cada atividade com números e papéis na{' '}
              <a href="/extracurriculares">aba Extracurriculares</a> — o resumo da lista
              pode ser colado aqui de uma vez (deixo no botão abaixo).
            </p>
            <button
              type="button"
              className="btn-link btn-link--discreto"
              hidden={atividadesResumo === ''}
              onClick={() => atualizarCampo('atividades', atividadesResumo)}
            >
              Preencher pela lista detalhada
            </button>
          </div>

          <div className="campo">
            <label className="caps-sec" htmlFor="perfil-ingles">Nível de inglês</label>
            <select
              id="perfil-ingles"
              value={formulario.nivelIngles}
              onChange={(event) => atualizarCampo('nivelIngles', event.target.value)}
            >
              <option value="">Selecione uma opção</option>
              <option value="iniciante">Iniciante</option>
              <option value="intermediário">Intermediário</option>
              <option value="avançado">Avançado</option>
              <option value="fluente">Fluente</option>
              <option value="ainda não sei">Ainda não sei</option>
            </select>
          </div>

          {mensagem && (
            <p className={`mensagem ${msgBoa ? 'mensagem--ok' : 'mensagem--erro'}`} role="status">
              {mensagem}
            </p>
          )}

          <button type="submit" className="btn-primario" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar perfil'}
          </button>

          <p className="envelope">
            <span>{preenchidos === TOTAL_CAMPOS ? 'PERFIL COMPLETO' : `PERFIL EM ANDAMENTO · ${preenchidos} DE ${TOTAL_CAMPOS} CAMPOS`}</span>
            {ultimaAtualizacao && <span>ÚLTIMA ATUALIZAÇÃO: {ultimaAtualizacao}</span>}
          </p>
        </form>
      </div>
    </main>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');

.perfil-pagina{
  --papel:#F6F2EA; --papel-elev:#FCFAF5; --tinta:#191512; --tinta-sec:#5C554B; --hairline:#E2DACB;
  --lacre:#1A4D3A; --vermelho:#A6301F; --acento:#1F3A5F;
  --serif:'Instrument Serif',Georgia,serif; --corpo:'Libre Caslon Text',Georgia,serif;
  --sans:'Instrument Sans','Helvetica Neue',sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  min-height:100vh; background:var(--papel); color:var(--tinta);
  font-family:var(--corpo); -webkit-font-smoothing:antialiased;
}
.perfil-pagina h1, .perfil-pagina p{ margin:0; }

.carregando{
  min-height:100vh; display:flex; align-items:center; justify-content:center;
  font-family:var(--mono); font-size:12px; letter-spacing:.08em; color:var(--tinta-sec);
}

/* ===== topo ===== */
.perfil-topo{
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:16px 28px; border-bottom:1px solid var(--hairline);
}
.marca-mini{ display:flex; align-items:center; gap:10px; }
.marca-mini-escudo{ width:20px; height:auto; }
.marca-mini span{
  font-family:var(--sans); font-weight:600; font-size:12px;
  text-transform:uppercase; letter-spacing:.18em; color:var(--acento);
}
.btn-link{
  font:600 13px/1 var(--sans); color:var(--acento);
  text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1.5px;
  background:none; border:0; cursor:pointer; padding:0; text-align:left;
}
.btn-link:hover{ color:#19304E; }
.dica-campo{ font-size:13px; line-height:1.6; color:var(--tinta-sec); }
.dica-campo a{ color:var(--acento); font-weight:600; text-decoration:underline; text-underline-offset:3px; }

/* ===== folha ===== */
.perfil-folha{ max-width:680px; margin:0 auto; padding:44px 24px 72px; }

/* ===== Sua semana: plano + prontidão + streak ===== */
.semana-cartao{
  margin-top:32px; background:var(--papel-elev); border:1px solid var(--hairline); border-radius:8px;
  padding:30px 34px 26px;
}
.semana-topo{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
.semana-streak{
  display:inline-flex; align-items:center; gap:8px;
  font-family:var(--mono); font-size:11px; letter-spacing:.08em; color:var(--tinta-sec);
}
.semana-missoes{ list-style:none; margin:18px 0 0; padding:0; }
.semana-missoes li{ border-top:1px solid var(--hairline); }
.semana-missoes li:first-child{ border-top:0; }
.semana-missoes a{ display:block; padding:12px 2px; text-decoration:none; color:inherit; border-radius:4px; }
.semana-missoes a:hover{ background:rgba(31,58,95,.05); }
.misso-titulo{ display:block; font:400 20px/1.35 var(--serif); color:var(--tinta); }
.misso-titulo::after{ content:' →'; color:var(--acento); font-family:var(--sans); font-size:16px; }
.misso-detalhe{ display:block; margin-top:2px; font:400 13.5px/1.55 var(--sans); color:var(--tinta-sec); }
.misso-limpo{ padding:12px 2px; }
.semana-prontidao{ margin-top:24px; padding-top:20px; border-top:1px solid var(--hairline); display:grid;
  grid-template-columns:auto 1fr auto; align-items:center; gap:14px; }
.prontidao-escrita, .prontidao-nota{ font-family:var(--mono); font-size:11px; letter-spacing:.08em; color:var(--tinta-sec); }
.prontidao-nota{ color:var(--acento); font-weight:600; }
.prontidao-barra{ height:6px; background:var(--papel); border:1px solid var(--hairline); border-radius:99px; overflow:hidden; }
.prontidao-recheio{ display:block; height:100%; background:var(--lacre); border-radius:99px; }
.semana-componentes{ list-style:none; margin:12px 0 0; padding:0; }
.semana-componentes li{ display:flex; justify-content:space-between; gap:12px; padding:4px 0;
  font:400 12.5px/1.5 var(--sans); color:var(--tinta-sec); }
.comp-nome{ font-weight:600; color:var(--tinta); }
.comp-pontos{ font-family:var(--mono); font-size:11px; }
.semana-prazo{ margin-top:20px; padding-top:14px; border-top:1px solid var(--hairline);
  font:400 13.5px/1.6 var(--sans); color:var(--tinta-sec); }
.semana-prazo strong{ color:var(--tinta); font-weight:600; }
.dot{ width:8px; height:8px; border-radius:99px; display:inline-block; }
.dot--lacre{ background:var(--lacre); }
.dot--dourado{ background:#B98A2F; }

.perfil-cabecalho h1{ font:400 44px/1.1 var(--serif); letter-spacing:-.005em; margin-top:10px; }
.perfil-cabecalho h1 em{ font-style:italic; }
.perfil-cabecalho p{ margin-top:16px; font-size:16.5px; line-height:1.75; color:var(--tinta-sec); max-width:52ch; }

/* ===== formulário ===== */
.perfil-form{
  margin-top:36px; background:var(--papel-elev); border:1px solid var(--hairline); border-radius:8px;
  padding:44px 48px 36px; display:flex; flex-direction:column; gap:26px;
}
.perfil-form .caps-sec{ margin-bottom:-14px; }
.caps-sec{
  font-family:var(--sans); text-transform:uppercase; letter-spacing:.16em;
  font-size:11px; font-weight:600; color:var(--tinta-sec);
}

.linha-duo{ display:grid; grid-template-columns:1fr 1fr; gap:24px; }

.campo{ display:flex; flex-direction:column; gap:6px; }
.campo input, .campo select, .campo textarea{
  border:0; border-bottom:1px solid var(--hairline); background:transparent; border-radius:0;
  padding:9px 2px; font:400 16px var(--corpo); color:var(--tinta);
  transition:border-color .15s ease, box-shadow .15s ease;
}
.campo textarea{ resize:vertical; line-height:1.6; min-height:72px; }
.campo select{
  appearance:none; -webkit-appearance:none; cursor:pointer; padding-right:20px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%235C554B' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 2px center; background-size:12px 8px;
}
.campo input::placeholder, .campo textarea::placeholder{ color:#B4AB9C; }
.campo input:focus, .campo select:focus, .campo textarea:focus{
  outline:none; border-bottom-color:var(--lacre); box-shadow:0 1px 0 0 var(--lacre);
}

.mensagem{ font-family:var(--mono); font-size:12px; letter-spacing:.02em; }
.mensagem--ok{ color:var(--lacre); }
.mensagem--erro{ color:var(--vermelho); }

.btn-primario{
  font:600 15px/1 var(--sans); letter-spacing:.01em; width:100%;
  padding:13px 24px; border-radius:3px; cursor:pointer;
  background:var(--acento); color:var(--papel-elev); border:1px solid var(--acento);
  transition:background-color .15s ease, border-color .15s ease;
}
.btn-primario:hover{ background:#19304E; border-color:#19304E; }
.btn-primario:disabled{ background:#DAD2C2; border-color:#DAD2C2; color:#8F8678; cursor:not-allowed; }

.envelope{
  display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap;
  padding-top:18px; border-top:1px solid var(--hairline);
  font-family:var(--mono); font-size:11px; letter-spacing:.08em; color:var(--tinta-sec);
}

@media (max-width:640px){
  .perfil-topo{ padding:8px 16px; gap:4px 8px; flex-wrap:wrap; }
  .perfil-nav{ flex:1 1 100%; justify-content:space-between; gap:8px; }
  /* alvos de toque: 44px de altura é o mínimo confortável no polegar */
  .perfil-nav > a{ font-size:13px; padding:15px 6px; }
  .btn-conta{ width:40px; height:40px; }
  /* o link de voltar ganha área de toque generosa no polegar */
  .perfil-topo .btn-link{ display:inline-block; padding:14px 10px; }
  /* marca compacta na linha de cima */
  .marca-mini-escudo{ width:18px; }
  .marca-mini span{ font-size:11px; letter-spacing:.14em; }
  .perfil-folha{ padding:32px 16px 56px; }
  .perfil-form{ padding:32px 20px 24px; }
  .perfil-cabecalho h1{ font-size:34px; }
  .linha-duo{ grid-template-columns:1fr; }
  .perfil-form input, .perfil-form select{ font-size:16px; }
}
`
