'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// Callback do login com Google (fluxo PKCE do Supabase).
//
// O botão "Continuar com Google" envia o aluno ao Google com
// redirectTo=/auth/callback. O Supabase devolve aqui ?code=… — é ESTA página
// que troca o código pela sessão (exchangeCodeForSession) e segue para
// /welcome. Sem ela, o login Google voltava ao site sem sessão nenhuma.
//
// Também cobre os caminhos de falha do provedor (Google recusou, e-mail de
// outro provedor, conta bloqueada): o Supabase volta aqui com
// ?error=…&error_description=… e o aluno é mandado de volta ao /login, onde
// pode entrar por e-mail.
export default function CallbackOAuth() {
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let vivo = true

    const rodar = async () => {
      const url = new URL(window.location.href)

      // Supabase devolve erros de provedor como ?error=…&error_description=…
      const erroProvedor =
        url.searchParams.get('error_description') || url.searchParams.get('error')
      const code = url.searchParams.get('code')

      if (erroProvedor) {
        setErro(erroProvedor)
        window.setTimeout(() => window.location.replace('/login'), 1200)
        return
      }

      if (!code) {
        // Sem ?code=: ou é fluxo implícito (hash com tokens — o próprio
        // supabase-js já consumiu) ou alguém abriu a página sem OAuth.
        const { data } = await supabase.auth.getSession()
        if (!vivo) return
        window.location.replace(data?.session ? '/welcome' : '/login')
        return
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!vivo) return
      if (error) {
        setErro(error.message)
        window.setTimeout(() => window.location.replace('/login'), 1200)
        return
      }
      window.location.replace('/welcome')
    }

    rodar()
    return () => { vivo = false }
  }, [])

  return (
    <main style={{
      minHeight: '100dvh',
      display: 'grid',
      placeItems: 'center',
      background: '#f7f2e7',
      color: '#1f3a5f',
      fontFamily: 'Georgia, serif',
    }}>
      <p style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 13 }}>
        {erro ? 'Não foi possível completar o login…' : 'Selando o envelope…'}
      </p>
    </main>
  )
}
