'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Chat() {
  const router = useRouter()
  const [mensagens, setMensagens] = useState([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [carregandoHistorico, setCarregandoHistorico] = useState(true)
  const fimDasMensagens = useRef(null)

  const corDestaque = '#10b981'
  const corContraste = '#57534e'

  useEffect(() => {
    fimDasMensagens.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  useEffect(() => {
    const iniciar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: assinatura } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (!assinatura) {
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

  const enviarMensagem = async () => {
    if (!input.trim() || !conversationId) return

    const textoUsuario = input
    setMensagens((prev) => [...prev, { remetente: 'usuario', texto: textoUsuario }])
    setInput('')
    setCarregando(true)

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: 'usuario',
      content: textoUsuario,
    })

    const { data: { session } } = await supabase.auth.getSession()

    const resposta = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ mensagem: textoUsuario, historico: mensagens }),
    })

    setMensagens((prev) => [...prev, { remetente: 'admitly', texto: '' }])

    const reader = resposta.body.getReader()
    const decoder = new TextDecoder()
    let textoCompleto = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const pedaco = decoder.decode(value)
      textoCompleto += pedaco
      setMensagens((prev) => {
        const copia = [...prev]
        copia[copia.length - 1] = { remetente: 'admitly', texto: copia[copia.length - 1].texto + pedaco }
        return copia
      })
    }

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: 'admitly',
      content: textoCompleto,
    })

    setCarregando(false)
  }

  if (carregandoHistorico) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
        Carregando conversa...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f7f5f2' }}>
      <style>{`
        .chat-input::placeholder {
          color: ${corContraste};
          opacity: 1;
        }
      `}</style>

      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 20px',
          borderBottom: '1px solid #e5e2dc',
        }}
      >
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 20px' }}>
          {mensagens.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: 24,
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.remetente === 'usuario' ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#999', marginBottom: 6 }}>
                {msg.remetente === 'usuario' ? 'Você' : 'Admitly'}
              </div>
              {msg.remetente === 'usuario' ? (
                <div
                  style={{
                    background: '#ece9e4',
                    borderRadius: 14,
                    padding: '10px 16px',
                    maxWidth: '80%',
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: '#1a1a1a',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.texto}
                </div>
              ) : (
                <div style={{ fontSize: 15, lineHeight: 1.6, color: '#1a1a1a', whiteSpace: 'pre-wrap' }}>
                  {msg.texto}
                </div>
              )}
            </div>
          ))}
          {carregando && (
            <div style={{ fontSize: 13, color: '#999' }}>Admitly está digitando...</div>
          )}
          <div ref={fimDasMensagens} />
        </div>
      </div>

      <div style={{ padding: '16px 20px 8px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              border: '1px solid #ddd',
              borderRadius: 16,
              padding: '10px 10px 10px 16px',
              background: '#efece7',
            }}
          >
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
              placeholder="Escreva sua mensagem para o Admitly..."
              rows={1}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                resize: 'none',
                fontSize: 15,
                fontFamily: 'inherit',
                padding: '6px 0',
                maxHeight: 160,
                color: '#1a1a1a',
              }}
            />
            <button
              onClick={enviarMensagem}
              disabled={!input.trim()}
              aria-label="Enviar mensagem"
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: 'none',
                background: input.trim() ? corDestaque : '#ddd',
                color: '#fff',
                cursor: input.trim() ? 'pointer' : 'default',
                flexShrink: 0,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#aaa', margin: '10px 0 4px' }}>
            Admitly é uma IA e pode cometer erros. Confirme informações importantes.
          </p>
        </div>
      </div>
    </div>
  )
}