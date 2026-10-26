'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { CSS, Marca, Tinta, FormularioGoogle, entrarComGoogle } from '../login/compartido'

// Criar conta: formulário PRÓPRIO (não mistura mais com o de entrar).
// Consentimento LGPD em primeiro lugar — silêncio não hablita (art. 8º); o
// registro (versão, hora) vai no user_metadata como prova. Conta criada COM
// sessão loga e vai direto pro /welcome; sem sessão (e-mail a confirmar
// ativado no projeto) avisa que o link de confirmação é o próximo passo.
export default function CriarConta() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [aceitou, setAceitou] = useState(false)
  const [message, setMessage] = useState('')

  const handleSignUp = async () => {
    setMessage('')
    if (!aceitou) {
      setMessage('Para criar a conta, è preciso aceitar os Termos e a Política de Privacidade (caixa acima).')
      return
    }
    if (password !== password2) {
      setMessage('As duas senhas não conferem — digite a mesma senha nas duas caixas.')
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
    } else if (data.session) {
      setMessage('Conta criada! Já è logada — indo para a sua carta de boas-vindas...')
      window.location.href = '/welcome'
    } else {
      setMessage('Conta criada! Enviamos um e-mail de confirmação — confirme e entre pela página de login.')
    }
  }

  const msgBoa = /^Conta criada/.test(message)

  return (
    <main className="login-pagina">
      <style>{CSS}</style>
      <Tinta />

      <div className="login-tela">
        <Marca />

        {/* ===== Cadastro ===== */}
        <form
          className="login-form"
          onSubmit={(e) => { e.preventDefault(); handleSignUp() }}
        >
          <span className="caps-sec">Cadastro</span>
          <h3>Criar sua conta.</h3>

          <FormularioGoogle onEnviar={() => entrarComGoogle(setMessage)} />

          <div className="campo">
            <label className="caps-sec" htmlFor="cadastro-email">Seu e-mail</label>
            <input
              id="cadastro-email"
              type="email"
              placeholder="voce@exemplo.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="caps-sec" htmlFor="cadastro-senha">Crie uma senha</label>
            <input
              id="cadastro-senha"
              type="password"
              placeholder="mín. 6 caracteres"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="caps-sec" htmlFor="cadastro-senha2">Confirme a senha</label>
            <input
              id="cadastro-senha2"
              type="password"
              placeholder="repita a senha"
              autoComplete="new-password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
          </div>

          {/* ===== consentimento LGPD — antes do botão, no próprio formulário ===== */}
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

          <button type="submit" className="btn-primario">Criar conta e começar</button>

          {message && (
            <p className={`mensagem ${msgBoa ? 'mensagem--ok' : 'mensagem--erro'}`} role="status">
              {message}
            </p>
          )}

          <div className="links">
            <span className="caps-sec">Já tem conta?</span>
            <a className="btn-link" href="/login">Entrar</a>
          </div>

          <p className="nota-mono">PLANO SÓ DEPOIS · SEM CARTÃO PARA ENTRAR</p>
        </form>
      </div>
    </main>
  )
}
