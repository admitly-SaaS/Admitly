'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { temAssinaturaAtiva } from '../../lib/subscriptions.js'

// Paywall no design v3: a carta que oferece a assinatura.
// O checkout continua sendo o link da Kiwify (abre em outra aba); o que muda é
// que esta página CONFERE a assinatura sozinha — ao abrir, quando a aba volta
// (o aluno pagou em outra aba), e a cada 20s — liberando o acesso sem ele
// precisar recarregar.

const CHECKOUT_URL = 'https://pay.kiwify.com.br/1gI05Vm'

const INCLUIDO = [
  'Conversa sem limite com o mentor de admissões.',
  'Recomendações ordenadas pelo seu perfil, entre as 39 oportunidades verificadas.',
  'Checklist e prazo por candidatura, com os prazos que você mesmo cadastra.',
  'Seu histórico fica salvo: perfil, conversas e aplicações.',
]

// As duas únicas respostas possíveis do botão "Já paguei": não achamos o
// pagamento (ainda) ou não conseguimos perguntar. A segunda nunca deve soar
// como acusação — é o servidor que não respondeu.
const MENSAGEM = {
  semPagamento:
    'Ainda não encontramos um pagamento ativo. Se você pagou no cartão ou no Pix, aguarde alguns instantes e confira de novo — o Pix costuma liberar em segundos.',
  semResposta:
    'Não conseguimos falar com o servidor agora. Confira sua conexão e tente de novo — seu pagamento não se perde.',
}

// O escudo do Admitly: a geometria exata de public/marca-escudo-simples.svg.
// Nesta página ele aparece em dois tamanhos — 22px no topo e 34px no letterhead —
// e é o mesmo desenho que o /login usa, para a marca não nascer diferente de
// tela em tela. (O escudo miúdo, de colunas capituladas, fica para o letterhead
// completo do /welcome: nessa escala ele viraria um borrão.)
const ARTE_ESCUDO = (
  <>
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
  </>
)

const ESCUDO = (
  <svg className="marca-mini-escudo" viewBox="-60 -74 120 158" role="img" aria-label="Escudo Admitly">
    {ARTE_ESCUDO}
  </svg>
)

const ESCUDO_LETRA = (
  <svg className="assinar-escudo" viewBox="-60 -74 120 158" role="img" aria-label="Escudo Admitly">
    {ARTE_ESCUDO}
  </svg>
)


export default function Assinar() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [liberando, setLiberando] = useState(false)
  const [mensagem, setMensagem] = useState(null)
  const [menuAberto, setMenuAberto] = useState(false)
  const timerRef = useRef(null)

  const sair = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const verificar = useCallback(async (avisar) => {
    let userId = null

    try {
      // getSession lê do armazenamento local, sem rede: é o que distingue
      // "não há sessão" (aí sim voltamos ao login) de "a rede falhou agora"
      // (aí NÃO expulsamos quem talvez já tenha pago).
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }

      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) throw error
      if (!user) {
        router.replace('/login')
        return
      }
      userId = user.id
    } catch (e) {
      console.warn('assinar: não foi possível conferir a sessão agora', e)
      if (avisar) setMensagem({ tipo: 'erro', texto: MENSAGEM.semResposta })
      return
    }

    if (await temAssinaturaAtiva(supabase, userId)) {
      router.replace('/chat')
      return
    }

    if (avisar) setMensagem({ tipo: 'erro', texto: MENSAGEM.semPagamento })
  }, [router])

  useEffect(() => {
    let ativo = true

    const abertura = async () => {
      await verificar(false)
      if (ativo) setCarregando(false)
    }
    abertura()

    // Três gatilhos, do mais provável ao mais teimoso: voltar a esta aba (o
    // checkout abriu em outra), voltar ao navegador, e o relógio de 20s — para
    // o Pix e o cartão, que confirmam depois, sem ninguém clicar em nada.
    const aoVoltar = () => {
      if (document.visibilityState !== 'hidden') verificar(false)
    }
    window.addEventListener('focus', aoVoltar)
    document.addEventListener('visibilitychange', aoVoltar)
    timerRef.current = setInterval(aoVoltar, 20000)

    return () => {
      ativo = false
      window.removeEventListener('focus', aoVoltar)
      document.removeEventListener('visibilitychange', aoVoltar)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [verificar])

  const jaPaguei = async () => {
    setLiberando(true)
    setMensagem(null)
    await verificar(true)
    setLiberando(false)
  }

  if (carregando) {
    return (
      <main className="assinar-pagina">
        <style>{CSS}</style>
        <p className="assinar-carregando">Conferindo sua assinatura...</p>
      </main>
    )
  }

  return (
    <main className="assinar-pagina">
      <style>{CSS}</style>

      <header className="assinar-topo">
        <div className="marca-mini">
          {ESCUDO}
          <span>Admitly</span>
        </div>

        <nav className="assinar-nav">
          <a href="/oportunidades">Oportunidades</a>
          <a href="/aplicacoes">Aplicações</a>
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

      <div className="assinar-tela">
        {/* ===== a carta ===== */}
        <section className="assinar-carta">
          <div className="assinar-letterhead">
            {ESCUDO_LETRA}
            <div>
              <div className="assinar-logo">
                Admit<em>ly</em><span className="ponto" />
              </div>
              <div className="assinar-regra" />
            </div>
          </div>

          <div className="assinar-corpo">
            <span className="caps-sec">Sua assinatura</span>
            <h1>O mentor espera por <em>você</em>.</h1>
            <p className="assinar-sub">
              Sua conta está pronta. O que falta é o acesso sem limite ao mentor — e ele
              começa no próximo passo, sem fidelidade e sem taxa de adesão.
            </p>

            <ul className="assinar-incluido">
              {INCLUIDO.map((item) => (
                <li key={item}>
                  <i className="dot dot--lacre" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="assinar-envelope">
            PLANO ÚNICO · CANCELA QUANDO QUISER · PIX, CARTÃO OU BOLETO
          </p>
        </section>

        {/* ===== o plano ===== */}
        <section className="assinar-plano">
          <span className="caps-sec">Seu plano</span>

          <p className="assinar-preco">
            <span className="assinar-preco-valor">R$ 49,90</span>
            <span className="assinar-preco-periodo">/mês</span>
          </p>

          <p className="assinar-nota-mono">PAGAMENTO NO CHECKOUT DA KIWIFY · AMBIENTE SEGURO DELES</p>

          <a
            className="btn-primario"
            href={CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Assinar agora no checkout da Kiwify, abre em outra aba"
          >
            Assinar agora
          </a>

          <button
            type="button"
            className="btn-secundario"
            onClick={jaPaguei}
            disabled={liberando}
          >
            {liberando ? 'Conferindo...' : 'Já paguei — liberar meu acesso'}
          </button>

          {mensagem && (
            <p className="assinar-mensagem assinar-mensagem--erro" role="status">
              {mensagem.texto}
            </p>
          )}

          <p className="assinar-rodape-plano">
            O checkout abre em outra aba. Ao voltar para cá, esta página confere o pagamento
            sozinha e abre o mentor — sem recarregar. O Pix libera em segundos; o boleto pode
            levar até 2 dias úteis. Para cancelar, use o link que a Kiwify manda por e-mail na
            confirmação da compra.
          </p>
        </section>
      </div>
    </main>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');

.assinar-pagina{
  --papel:#F6F2EA; --papel-elev:#FCFAF5; --tinta:#191512; --tinta-sec:#5C554B; --hairline:#E2DACB;
  --lacre:#1A4D3A; --vermelho:#A6301F; --acento:#1F3A5F;
  --serif:'Instrument Serif',Georgia,serif; --corpo:'Libre Caslon Text',Georgia,serif;
  --sans:'Instrument Sans','Helvetica Neue',sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  min-height:100vh; background:var(--papel); color:var(--tinta);
  font-family:var(--corpo); -webkit-font-smoothing:antialiased;
}
/* O reset abaixo zera a margem padrão do h1 e do p. Ele tem especificidade
   (0,1,1) — mais que a de uma regra de classe sozinha, que é (0,1,0) — e por
   isso engolia, calado, todas as margens de ritmo desta página (o 18px do
   subtítulo, o auto do envelope...). As regras de ritmo lá embaixo vão escritas
   como p.assinar-*, que também é (0,1,1): aí desempata a ordem, e elas vêm depois. */
.assinar-pagina h1, .assinar-pagina p{ margin:0; }
.assinar-carregando{
  padding:96px 0; text-align:center;
  font-family:var(--mono); font-size:12px; letter-spacing:.08em; color:var(--tinta-sec);
}

.caps-sec{
  font-family:var(--sans); text-transform:uppercase; letter-spacing:.16em;
  font-size:11px; font-weight:600; color:var(--tinta-sec);
}

/* ===== topo ===== */
.assinar-topo{
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:14px 24px; border-bottom:1px solid var(--hairline); background:var(--papel);
}
.marca-mini{ display:flex; align-items:center; gap:10px; }
.marca-mini-escudo{ width:22px; height:auto; }
.marca-mini span{
  font-family:var(--sans); font-weight:600; font-size:12px;
  text-transform:uppercase; letter-spacing:.18em; color:var(--acento);
}
.assinar-nav{ display:flex; align-items:center; gap:20px; }
.assinar-nav > a{ font:600 13px/1 var(--sans); color:var(--tinta-sec); text-decoration:none; }
.assinar-nav > a:hover{ color:var(--acento); }
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

/* ===== tela ===== */
.assinar-tela{
  max-width:1040px; margin:48px auto 80px;
  display:grid; grid-template-columns:1.35fr 1fr;
  border:1px solid var(--hairline); border-radius:8px; background:var(--papel-elev);
}
.assinar-carta{
  padding:48px 48px 36px; border-right:1px solid var(--hairline);
  display:flex; flex-direction:column; gap:32px;
}
.assinar-letterhead{ display:flex; align-items:flex-start; gap:16px; }
.assinar-escudo{ width:34px; height:45px; flex:none; }
.assinar-logo{
  display:inline-flex; align-items:baseline; gap:5px;
  font:400 26px/1 var(--serif); letter-spacing:-.01em; color:var(--tinta);
}
.assinar-logo em{ font-style:italic; }
.assinar-logo .ponto{ width:4px; height:4px; border-radius:50%; background:var(--acento); }
.assinar-regra{ margin-top:12px; height:4px; border-top:2px solid var(--acento); border-bottom:1px solid var(--acento); }

.assinar-corpo h1{
  margin-top:12px; font:400 clamp(32px, 3.4vw, 44px)/1.12 var(--serif); letter-spacing:-.005em;
  max-width:16ch;
}
.assinar-corpo h1 em{ font-style:italic; }
p.assinar-sub{ margin-top:18px; font-size:16.5px; line-height:1.75; color:var(--tinta-sec); max-width:46ch; }

.assinar-incluido{
  margin:26px 0 0; padding:22px 0 0; border-top:1px solid var(--hairline);
  list-style:none; display:flex; flex-direction:column; gap:12px;
}
.assinar-incluido li{ display:flex; align-items:baseline; gap:12px; font-size:15.5px; line-height:1.6; }
.assinar-incluido .dot{ margin-top:7px; }

p.assinar-envelope{
  margin-top:auto; padding-top:16px; border-top:1px solid var(--hairline);
  font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; color:var(--tinta-sec);
}

/* ===== plano ===== */
.assinar-plano{
  padding:48px 44px 40px; background:var(--papel);
  display:flex; flex-direction:column; gap:16px;
}
p.assinar-preco{ display:flex; align-items:baseline; gap:8px; margin-top:6px; }
.assinar-preco-valor{ font:400 46px/1 var(--serif); letter-spacing:-.01em; }
.assinar-preco-periodo{ font-family:var(--mono); font-size:13px; color:var(--tinta-sec); }
p.assinar-nota-mono{
  font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; color:var(--tinta-sec);
  padding-bottom:16px; border-bottom:1px solid var(--hairline); margin-bottom:6px;
}

.btn-primario{
  display:block; width:100%; box-sizing:border-box; text-align:center; text-decoration:none;
  font:600 15px/1 var(--sans); letter-spacing:.01em; padding:14px 20px; border-radius:3px;
  background:var(--acento); color:var(--papel-elev); border:1px solid var(--acento); cursor:pointer;
  transition:background-color .15s ease, border-color .15s ease;
}
.btn-primario:hover{ background:#19304E; border-color:#19304E; }
.btn-secundario{
  display:block; width:100%; box-sizing:border-box; text-align:center;
  font:600 13px/1 var(--sans); padding:12px 16px; border-radius:3px; cursor:pointer;
  background:transparent; color:var(--tinta); border:1px solid var(--hairline);
  transition:border-color .15s ease, color .15s ease;
}
.btn-secundario:hover{ border-color:var(--acento); color:var(--acento); }
.btn-secundario:disabled{ opacity:.55; cursor:not-allowed; }

.assinar-mensagem{ font-family:var(--mono); font-size:11.5px; line-height:1.6; letter-spacing:.02em; }
.assinar-mensagem--erro{ color:var(--vermelho); }

p.assinar-rodape-plano{
  margin-top:auto; padding-top:16px; border-top:1px solid var(--hairline);
  font-size:13.5px; line-height:1.65; color:var(--tinta-sec);
}

.dot{ display:inline-block; width:8px; height:8px; border-radius:50%; flex:none; }
.dot--lacre{ background:var(--lacre); box-shadow:0 0 0 3px rgba(26,77,58,.14); }

@media (max-width:880px){
  .assinar-tela{ grid-template-columns:minmax(0, 1fr); margin:28px 16px 56px; }
  .assinar-carta{ border-right:0; border-bottom:1px solid var(--hairline); padding:36px 28px 28px; }
  .assinar-plano{ padding:32px 28px 32px; }
}
@media (max-width:640px){
  .assinar-topo{ padding:6px 16px 2px; gap:2px 8px; flex-wrap:wrap; }
  .assinar-nav{ flex:1 1 100%; justify-content:space-between; gap:8px; }
  /* alvos de toque: 44px de altura é o mínimo confortável no polegar */
  .assinar-nav > a{ font-size:13px; padding:15px 6px; }
  .btn-conta{ width:40px; height:40px; }
  /* marca compacta na linha de cima */
  .marca-mini-escudo{ width:18px; }
  .marca-mini span{ font-size:11px; letter-spacing:.14em; }
  .assinar-tela{ margin:20px 12px 48px; }
  .assinar-carta{ padding:28px 20px 22px; }
  .assinar-plano{ padding:26px 20px 24px; }
}
`;
