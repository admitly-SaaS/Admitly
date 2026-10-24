'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

// Login 1:1 do moodboard v3 (papel, Caslon, azul-tinta).
// Painel-carta: à esquerda a marca com o escudo real; à direita o acesso.
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  // Consentimento LGPD: checkbox DE-marcado (art. 8º — silúncio não é aceite);
  // pedido só aparece no fluxo de CRIAR conta. O registro (texto, versão,
  // data/hora) vai para o user_metadata — é a prova do art. 8º, § 2º.
  const [aceitou, setAceitou] = useState(false)

  const handleSignUp = async () => {
    setMessage('')
    if (!aceitou) {
      setMessage('Para criar a conta, é preciso aceitar os Termos e a Política de Privacidade (caixa acima).')
      return
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          consentimento_lgpd: {
            termos: 'v1',
            privacidade: 'v1',
            em: new Date().toISOString(),
            acao: 'checkbox_cadastro',
          },
        },
      },
    })
    if (error) {
      setMessage(error.message)
    } else if (!data.session) {
      setMessage('Conta criada! Confirme seu e-mail e entre.')
    } else {
      setMessage('Conta criada! Redirecionando...')
      window.location.href = '/welcome'
    }
  }

  const handleSignIn = async () => {
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Login feito com sucesso! Redirecionando...')
      window.location.href = '/welcome'
    }
  }

  // Conta nasce automática no primeiro login com Google (o Supabase cria o usuário).
  // Checa antes se o provedor está ativado — sem isso, o clique cairia numa página
  // de erro crua do Supabase em vez de mostrar mensagem aqui.
  const handleGoogle = async () => {
    setMessage('')
    try {
      const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
      const resp = await fetch(base + '/auth/v1/settings', {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      })
      const settings = await resp.json()
      if (!settings || !settings.external || !settings.external.google) {
        setMessage('O login com Google ainda não está ativado neste projeto. Use e-mail e senha por enquanto.')
        return
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/auth/callback' },
      })
      if (error) {
        setMessage('Login com Google indisponível. (' + error.message + ')')
      }
    } catch {
      setMessage('Não foi possível iniciar o login com Google. Tente de novo.')
    }
  }

  const handleEsqueci = async () => {
    setMessage('')
    if (!email.trim()) {
      setMessage('Digite seu e-mail acima para receber o link de redefinição.')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/redefinir-senha',
    })
    if (error) {
      setMessage('Não foi possível enviar o link: ' + error.message)
    } else {
      setMessage('Enviamos o link de redefinição para ' + email.trim() + '.')
    }
  }

  const msgBoa = /^(Conta criada|Login feito|Enviamos o link)/.test(message)

  return (
    <main className="login-pagina">
      <style>{CSS}</style>

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="tinta">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" result="ruido" />
          <feDisplacementMap in="SourceGraphic" in2="ruido" scale="1.4" />
        </filter>
        <symbol id="traco-tinteiro" viewBox="0 0 100 8" preserveAspectRatio="none">
          <path d="M2 5.2 C 22 3.2, 46 6.4, 68 4.2 S 92 2.8, 98 3.6" strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <path d="M8 6 C 30 4.8, 58 7, 92 5" strokeWidth={1} fill="none" strokeLinecap="round" opacity={0.55} />
        </symbol>
      </svg>

      <div className="login-tela">
        {/* ===== Marca ===== */}
        <section className="login-marca">
          <div className="letterhead-login">
            <svg className="escudo-login" viewBox="-60 -74 120 158" role="img" aria-label="Escudo Admitly">
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
            <div>
              <div className="logo">
                Admit<em>ly</em><span className="ponto" />
                <svg className="traco-logo" viewBox="0 0 100 8" preserveAspectRatio="none" filter="url(#tinta)" aria-hidden="true">
                  <use href="#traco-tinteiro" />
                </svg>
              </div>
              <div className="regra-dupla" />
            </div>
          </div>

          <div className="meio">
            <h2>
              Sua carta de{' '}
              <span className="grifo">
                <em>admissão</em>
                <svg viewBox="0 0 100 8" preserveAspectRatio="none" filter="url(#tinta)" aria-hidden="true">
                  <use href="#traco-tinteiro" />
                </svg>
              </span>{' '}
              está a caminho.
            </h2>
            <p className="sub">
              Olimpíadas, pesquisas e programas de verão — com prazo, custo e chance real, reunidos para o seu perfil.
            </p>
            <p className="envelope">ENVELOPE Nº 001 · DESTINATÁRIO: VOCÊ · POSTAGEM: HOJE</p>
          </div>

          <p className="base">Para estudantes brasileiros que olham para fora</p>
        </section>

        {/* ===== Acesso ===== */}
        <form
          className="login-form"
          onSubmit={(e) => { e.preventDefault(); handleSignIn() }}
        >
          <span className="caps-sec">Acesso</span>
          <h3>Entre na sua conta.</h3>

          <button type="button" className="btn-google" onClick={handleGoogle}>
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z" />
              <path fill="#34A853" d="M9 18a8.6 8.6 0 0 0 5.96-2.18l-2.92-2.26a5.4 5.4 0 0 1-8.08-2.85H.96v2.33A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3 2.33A5.36 5.36 0 0 1 9 3.58z" />
            </svg>
            Continuar com Google
          </button>

          <div className="divisor">ou por e-mail</div>

          <div className="campo">
            <label className="caps-sec" htmlFor="login-email">Seu e-mail</label>
            <input
              id="login-email"
              type="email"
              placeholder="voce@exemplo.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="caps-sec" htmlFor="login-senha">Sua senha</label>
            <input
              id="login-senha"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primario">Entrar</button>

          <div className="links">
            <button type="button" className="btn-link" onClick={handleSignUp}>Criar conta</button>
            <button type="button" className="btn-link" onClick={handleEsqueci}>Esqueci a senha</button>
          </div>

          {/* ===== consentimento LGPD (só para criar conta) ===== */}
          <label className="consentimento">
            <input
              type="checkbox"
              checked={aceitou}
              onChange={(e) => setAceitou(e.target.checked)}
            />
            <span>
              <strong>Necessário para criar conta:</strong> li e aceito os{' '}
              <a href="/termos" target="_blank" rel="noopener noreferrer">Termos de Serviço</a> e a{' '}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>;
              tenho 16 anos ou mais (menos de 16: a conta deve ser criada pelo responsável).
            </span>
          </label>

          {message && (
            <p className={`mensagem ${msgBoa ? 'mensagem--ok' : 'mensagem--erro'}`} role="status">
              {message}
            </p>
          )}

          <p className="nota-mono">PLANO SÓ DEPOIS · SEM CARTÃO PARA ENTRAR</p>
        </form>
      </div>
    </main>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');

.login-pagina{
  --papel:#F6F2EA; --papel-elev:#FCFAF5; --tinta:#191512; --tinta-sec:#5C554B; --hairline:#E2DACB;
  --lacre:#1A4D3A; --vermelho:#A6301F; --acento:#1F3A5F;
  --serif:'Instrument Serif',Georgia,serif; --corpo:'Libre Caslon Text',Georgia,serif;
  --sans:'Instrument Sans','Helvetica Neue',sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  min-height:100vh; background:var(--papel); color:var(--tinta);
  font-family:var(--corpo); -webkit-font-smoothing:antialiased;
  display:flex; align-items:center; justify-content:center; padding:32px 20px;
}
.login-pagina h2, .login-pagina h3, .login-pagina p{ margin:0; }

.login-tela{
  display:grid; grid-template-columns:1.5fr 1fr; width:100%; max-width:960px; min-height:640px;
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:8px; overflow:hidden;
}

/* ===== marca ===== */
.login-marca{ padding:56px; display:flex; flex-direction:column; gap:40px; border-right:1px solid var(--hairline); }
.letterhead-login{ align-self:flex-start; display:flex; align-items:flex-start; gap:16px; }
.escudo-login{ width:34px; height:auto; margin-top:1px; flex:none; }
.logo{
  display:inline-flex; align-items:baseline; position:relative; padding-bottom:6px;
  font:400 26px/1 var(--serif); letter-spacing:-.01em; color:var(--tinta);
}
.logo em{ font-style:italic; }
.logo .ponto{ width:4px; height:4px; border-radius:50%; background:var(--acento); margin-left:5px; }
.logo .traco-logo{ position:absolute; left:2px; bottom:0; width:88%; height:5px; overflow:visible; stroke:var(--acento); }
.regra-dupla{ width:208px; max-width:100%; margin-top:14px; height:4px; border-top:2px solid var(--acento); border-bottom:1px solid var(--acento); }

.meio{ flex:1; display:flex; flex-direction:column; justify-content:center; }
.meio h2{ font:400 clamp(36px,3.8vw,50px)/1.12 var(--serif); letter-spacing:-.005em; max-width:13ch; }
.grifo{ position:relative; white-space:nowrap; font-style:italic; }
.grifo svg{ position:absolute; left:-2%; bottom:-5px; width:104%; height:8px; overflow:visible; stroke:var(--acento); }
.sub{ margin-top:20px; color:var(--tinta-sec); max-width:40ch; font:400 17px/1.7 var(--corpo); }
.envelope{ margin-top:48px; font-family:var(--mono); font-size:11.5px; color:var(--tinta-sec); letter-spacing:.08em; }
.base{
  font-family:var(--sans); text-transform:uppercase; letter-spacing:.16em;
  font-size:11px; font-weight:600; color:var(--tinta-sec);
}

/* ===== acesso ===== */
.login-form{ padding:56px 48px; display:flex; flex-direction:column; gap:26px; background:var(--papel); }
.caps-sec{
  font-family:var(--sans); text-transform:uppercase; letter-spacing:.16em;
  font-size:11px; font-weight:600; color:var(--tinta-sec);
}
.login-form h3{ font:400 26px/1.2 var(--serif); }

.campo{ display:flex; flex-direction:column; gap:6px; }
.campo input{
  border:0; border-bottom:1px solid var(--hairline); background:transparent; border-radius:0;
  padding:9px 2px; font:400 16px var(--corpo); color:var(--tinta);
  transition:border-color .15s ease, box-shadow .15s ease;
}
.campo input::placeholder{ color:#B4AB9C; }
.campo input:focus{ outline:none; border-bottom-color:var(--lacre); box-shadow:0 1px 0 0 var(--lacre); }

.btn-primario{
  font:600 15px/1 var(--sans); letter-spacing:.01em; width:100%;
  padding:13px 24px; border-radius:3px; cursor:pointer;
  background:var(--acento); color:var(--papel-elev); border:1px solid var(--acento);
  transition:background-color .15s ease, border-color .15s ease;
}
.btn-primario:hover{ background:#19304E; border-color:#19304E; }

.btn-google{
  font:600 15px/1 var(--sans); letter-spacing:.01em; width:100%;
  padding:12px 24px; border-radius:3px; cursor:pointer;
  background:transparent; color:var(--tinta); border:1px solid var(--tinta-sec);
  display:flex; align-items:center; justify-content:center; gap:10px;
  transition:border-color .15s ease, background-color .15s ease;
}
.btn-google:hover{ border-color:var(--acento); background:rgba(31,58,95,.04); }

.divisor{
  display:flex; align-items:center; gap:12px;
  font-family:var(--mono); font-size:10.5px; letter-spacing:.14em; color:var(--tinta-sec); text-transform:uppercase;
}
.divisor::before, .divisor::after{ content:""; flex:1; border-top:1px solid var(--hairline); }

.links{ display:flex; justify-content:space-between; align-items:center; }
.consentimento{
  display:flex; gap:10px; align-items:flex-start;
  font:400 12.5px/1.6 var(--sans); color:var(--tinta-sec);
}
.consentimento input{ margin-top:2px; accent-color:var(--acento); }
.consentimento a{ color:var(--acento); text-decoration:underline; text-underline-offset:2px; }
.btn-link{
  background:none; border:0; cursor:pointer; padding:4px 2px;
  font:600 15px/1 var(--sans); color:var(--acento);
  text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1.5px;
}
.btn-link:hover{ color:#19304E; }

.mensagem{ font-family:var(--mono); font-size:12px; letter-spacing:.02em; }
.mensagem--ok{ color:var(--lacre); }
.mensagem--erro{ color:var(--vermelho); }

.nota-mono{
  font-family:var(--mono); font-size:11.5px; letter-spacing:.06em; color:var(--tinta-sec);
  margin-top:auto; padding-top:18px; border-top:1px solid var(--hairline);
}

@media (max-width:880px){
  .login-pagina{ padding:20px 14px; align-items:flex-start; }
  .login-tela{ grid-template-columns:1fr; min-height:0; }
  .login-marca{ border-right:0; border-bottom:1px solid var(--hairline); padding:36px 28px; gap:28px; }
  .meio h2{ font-size:34px; }
  .envelope{ margin-top:28px; }
  .login-form{ padding:36px 28px; }
}
`
