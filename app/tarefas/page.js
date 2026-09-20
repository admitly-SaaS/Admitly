'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Tarefas() {
  const router = useRouter()
  const [tarefas, setTarefas] = useState([])
  const [carregando, setCarregando] = useState(true)

  const corDestaque = '#10b981'
  const corContraste = '#57534e'

  useEffect(() => {
    const iniciar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      setTarefas(data || [])
      setCarregando(false)
    }

    iniciar()
  }, [router])

  const alternarTarefa = async (id, doneAtual) => {
    setTarefas((prev) => prev.map((t) => (t.id === id ? { ...t, done: !doneAtual } : t)))
    await supabase.from('tasks').update({ done: !doneAtual }).eq('id', id)
  }

  const removerTarefa = async (id) => {
    setTarefas((prev) => prev.filter((t) => t.id !== id))
    await supabase.from('tasks').delete().eq('id', id)
  }

  const concluidas = tarefas.filter((t) => t.done).length
  const progresso = tarefas.length === 0 ? 0 : Math.round((concluidas / tarefas.length) * 100)

  if (carregando) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
        Carregando tarefas...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f5f2' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid #e5e2dc',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
        </div>
        <a
          href="/chat"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: corContraste,
            textDecoration: 'none',
          }}
        >
          ← Voltar ao chat
        </a>
      </header>

      <div style={{ height: 4, background: '#e5e2dc' }}>
        <div
          style={{
            height: '100%',
            width: `${progresso}%`,
            background: corDestaque,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>
          Minhas tarefas
        </h1>

        {tarefas.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              background: '#fff',
              borderRadius: 14,
              marginTop: 20,
            }}
          >
            <span
              style={{
                display: 'inline-grid',
                placeItems: 'center',
                width: 48,
                height: 48,
                borderRadius: 12,
                background: '#ecfdf5',
                color: corDestaque,
                marginBottom: 16,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 11 3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </span>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>
              Nenhuma tarefa por aqui ainda
            </p>
            <p style={{ fontSize: 13, color: '#888', maxWidth: 320, margin: '0 auto' }}>
              Peça um checklist de prazos pro Admitly no chat e adicione os itens aqui pra acompanhar seu progresso.
            </p>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
            {`${concluidas} de ${tarefas.length} concluídas (${progresso}%)`}
          </p>
        )}

        {tarefas.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: '#fff',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 8,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <input
              type="checkbox"
              checked={t.done}
              onChange={() => alternarTarefa(t.id, t.done)}
              style={{ width: 18, height: 18, accentColor: corDestaque, cursor: 'pointer', flexShrink: 0 }}
            />
            <span
              style={{
                flex: 1,
                fontSize: 14,
                color: t.done ? '#aaa' : '#1a1a1a',
                textDecoration: t.done ? 'line-through' : 'none',
              }}
            >
              {t.title}
            </span>
            <button
              onClick={() => removerTarefa(t.id)}
              aria-label="Remover tarefa"
              style={{
                border: 'none',
                background: 'transparent',
                color: '#bbb',
                cursor: 'pointer',
                fontSize: 16,
                padding: 4,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}