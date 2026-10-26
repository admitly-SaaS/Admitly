'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { CSS, Marca, Tinta, FormularioGoogle, entrarComGoogle } from './compartido'

// Login: ENTRAR, só entrar. Criar conta é tela própria (/criar-conta) — o
// formulário de cadastro tem caixa LGPD e campos próprios lá. Compartilhado
// (arte, CSS, Google) mora em ./compartido.
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

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

  const msgBoa = /^(Login feito|Enviamos o link)/.test(message)

  return (
    <main className="login-pagina">
      <style>{CSS}</style>
      <Tinta />

      <div className="login-tela">
        <Marca />

        {/* ===== Acesso ===== */}
        <form
          className="login-form"
          onSubmit={(e) => { e.preventDefault(); handleSignIn() }}
        >
          <span className="caps-sec">Acesso</span>
          <h3>Entre na sua conta.</h3>

          <FormularioGoogle onEnviar={() => entrarComGoogle(setMessage)} />

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
            <a className="btn-link" href="/criar-conta">Criar conta</a>
            <button type="button" className="btn-link" onClick={handleEsqueci}>Esqueci a senha</button>
          </div>

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
