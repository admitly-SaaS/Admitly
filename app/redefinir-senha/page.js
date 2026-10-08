'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Página aberta pelo link de "Esqueci a senha" do Supabase.
// O link traz a sessão de recuperação; aqui o usuário define a senha nova.
export default function RedefinirSenha() {
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [message, setMessage] = useState('')
  const [msgBoa, setMsgBoa] = useState(false)
  const [semSessao, setSemSessao] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data || !data.user) setSemSessao(true)
    }).catch(() => setSemSessao(true))
  }, [])

  const salvar = async (e) => {
    e.preventDefault()
    setMessage('')
    setMsgBoa(false)
    if (senha.length < 6) {
      setMessage('A senha precisa de pelo menos 6 caracteres.')
      return
    }
    if (senha !== confirma) {
      setMessage('As senhas não conferem.')
      return
    }
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMsgBoa(true)
    setMessage('Senha alterada! Entrando na sua conta...')
    setTimeout(() => { window.location.href = '/welcome' }, 1500)
  }

  return (
    <main className="reset-pagina">
      <style>{CSS}</style>

      <div className="reset-tela">
        <svg className="reset-escudo" viewBox="-60 -74 120 158" role="img" aria-label="Escudo Admitly">
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

        {semSessao ? (
          <>
            <span className="caps-sec">Recuperação</span>
            <h3>Este link é inválido ou já expirou.</h3>
            <p className="reset-aviso">
              Links de redefinição valem por pouco tempo. Peça um novo na página de login.
            </p>
            <a className="btn-link" href="/login">Voltar ao login</a>
          </>
        ) : (
          <form className="reset-form" onSubmit={salvar}>
            <span className="caps-sec">Recuperação</span>
            <h3>Defina uma senha nova.</h3>

            <div className="campo">
              <label className="caps-sec" htmlFor="reset-senha">Nova senha</label>
              <input
                id="reset-senha"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>

            <div className="campo">
              <label className="caps-sec" htmlFor="reset-confirma">Confirmar senha</label>
              <input
                id="reset-confirma"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-primario" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar nova senha'}
            </button>

            {message && (
              <p className={`mensagem ${msgBoa ? 'mensagem--ok' : 'mensagem--erro'}`} role="status">
                {message}
              </p>
            )}

            <p className="nota-mono">ADMITLY · ACESSO SEGURO</p>
          </form>
        )}
      </div>
    </main>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');

.reset-pagina{
  --papel:#F6F2EA; --papel-elev:#FCFAF5; --tinta:#191512; --tinta-sec:#5C554B; --hairline:#E2DACB;
  --lacre:#1A4D3A; --vermelho:#A6301F; --acento:#1F3A5F;
  --serif:'Instrument Serif',Georgia,serif; --corpo:'Libre Caslon Text',Georgia,serif;
  --sans:'Instrument Sans','Helvetica Neue',sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  min-height:100vh; background:var(--papel); color:var(--tinta);
  font-family:var(--corpo); -webkit-font-smoothing:antialiased;
  display:flex; align-items:center; justify-content:center; padding:32px 20px;
}
.reset-pagina h3, .reset-pagina p{ margin:0; }

.reset-tela{
  width:100%; max-width:420px;
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:8px;
  padding:44px 40px; display:flex; flex-direction:column; gap:24px;
}
.reset-escudo{ width:34px; height:auto; }
.caps-sec{
  font-family:var(--sans); text-transform:uppercase; letter-spacing:.16em;
  font-size:11px; font-weight:600; color:var(--tinta-sec);
}
.reset-tela h3{ font:400 26px/1.2 var(--serif); }
.reset-aviso{ font-size:15.5px; line-height:1.7; color:var(--tinta-sec); }

.reset-form{ display:flex; flex-direction:column; gap:24px; }

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
.btn-primario:disabled{ background:#DAD2C2; border-color:#DAD2C2; color:#8F8678; cursor:not-allowed; }

.btn-link{
  align-self:flex-start;
  background:none; border:0; cursor:pointer; padding:4px 2px;
  font:600 15px/1 var(--sans); color:var(--acento); text-decoration:none;
  text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1.5px;
}
.btn-link:hover{ color:#19304E; }

.mensagem{ font-family:var(--mono); font-size:12px; letter-spacing:.02em; }
.mensagem--ok{ color:var(--lacre); }
.mensagem--erro{ color:var(--vermelho); }

.nota-mono{
  font-family:var(--mono); font-size:11.5px; letter-spacing:.06em; color:var(--tinta-sec);
  margin-top:6px; padding-top:16px; border-top:1px solid var(--hairline);
}

@media (max-width:480px){
  .reset-pagina{ padding:20px 14px; }
  .reset-tela{ padding:32px 24px; }
}
`
