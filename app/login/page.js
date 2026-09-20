'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const corDestaque = '#10b981'
  const corContraste = '#57534e'

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Conta criada! Redirecionando...')
      router.push('/chat')
    }
  }

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Login feito com sucesso! Redirecionando...')
      router.push('/chat')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f7f5f2' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 24px' }}>
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 32,
            height: 32,
            borderRadius: 8,
            background: corDestaque,
            color: '#fff',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
            <path d="M22 10v6" />
            <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
          </svg>
        </span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          <span style={{ color: corContraste }}>Admit</span>
          <span style={{ color: corDestaque }}>ly</span>
        </span>
      </header>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div
          style={{
            width: '100%',
            maxWidth: 380,
            background: '#fff',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: '#1a1a1a' }}>
            Entrar no Admitly
          </h1>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
            Acesse sua conta ou crie uma nova para começar.
          </p>

          <label style={{ fontSize: 13, fontWeight: 600, color: corContraste, display: 'block', marginBottom: 6 }}>
            E-mail
          </label>
          <input
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 14px',
              marginBottom: 16,
              border: '1px solid #ddd',
              borderRadius: 10,
              fontSize: 14,
              outline: 'none',
              color: '#1a1a1a',
              boxSizing: 'border-box',
            }}
          />

          <label style={{ fontSize: 13, fontWeight: 600, color: corContraste, display: 'block', marginBottom: 6 }}>
            Senha
          </label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 14px',
              marginBottom: 20,
              border: '1px solid #ddd',
              borderRadius: 10,
              fontSize: 14,
              outline: 'none',
              color: '#1a1a1a',
              boxSizing: 'border-box',
            }}
          />

          <button
            onClick={handleSignIn}
            style={{
              width: '100%',
              padding: '12px 0',
              marginBottom: 10,
              border: 'none',
              borderRadius: 10,
              background: corDestaque,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Entrar
          </button>

          <button
            onClick={handleSignUp}
            style={{
              width: '100%',
              padding: '12px 0',
              border: '1px solid #ddd',
              borderRadius: 10,
              background: '#fff',
              color: '#1a1a1a',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Criar conta
          </button>

          {message && (
            <p style={{ marginTop: 16, fontSize: 13, textAlign: 'center', color: corContraste }}>
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}