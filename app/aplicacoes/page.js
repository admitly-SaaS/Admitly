'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const STATUS_OPCOES = ['pesquisando', 'em andamento', 'enviado', 'aceito', 'recusado']

export default function Aplicacoes() {
  const router = useRouter()
  const [userId, setUserId] = useState(null)
  const [aplicacoes, setAplicacoes] = useState([])
  const [tarefas, setTarefas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [novaUniversidade, setNovaUniversidade] = useState('')
  const [novasTarefas, setNovasTarefas] = useState({})
  const [novaTarefaGeral, setNovaTarefaGeral] = useState('')
  const [aplicacoesAbertas, setAplicacoesAbertas] = useState({})

  const corDestaque = '#10b981'
  const corContraste = '#57534e'

  const carregarDados = async (uid) => {
    const { data: aps } = await supabase
      .from('applications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true })

    const { data: tks } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true })

    setAplicacoes(aps || [])
    setTarefas(tks || [])
    setCarregando(false)
  }

  useEffect(() => {
    const iniciar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      await carregarDados(user.id)
    }
    iniciar()
  }, [router])

  const adicionarUniversidade = async () => {
    if (!novaUniversidade.trim() || !userId) return
    await supabase.from('applications').insert({ user_id: userId, university: novaUniversidade })
    setNovaUniversidade('')
    carregarDados(userId)
  }

  const removerUniversidade = async (id) => {
    await supabase.from('applications').delete().eq('id', id)
    carregarDados(userId)
  }

  const atualizarStatus = async (id, status) => {
    setAplicacoes((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
    await supabase.from('applications').update({ status }).eq('id', id)
  }

  const atualizarPrazo = async (id, deadline) => {
    setAplicacoes((prev) => prev.map((a) => (a.id === id ? { ...a, deadline } : a)))
    await supabase.from('applications').update({ deadline: deadline || null }).eq('id', id)
  }

  const atualizarDetalhe = async (id, campo, valor) => {
    const aplicacaoAtual = aplicacoes.find((ap) => ap.id === id)
    const details = { ...(aplicacaoAtual?.details || {}), [campo]: valor }
    setAplicacoes((prev) => prev.map((a) => (a.id === id ? { ...a, details } : a)))
    await supabase.from('applications').update({ details }).eq('id', id)
  }

  const adicionarTarefa = async (applicationId, titulo) => {
    if (!titulo?.trim() || !userId) return
    await supabase.from('tasks').insert({ user_id: userId, title: titulo, application_id: applicationId })
    setNovasTarefas((prev) => ({ ...prev, [applicationId || 'geral']: '' }))
    carregarDados(userId)
  }

  const alternarTarefa = async (id, doneAtual) => {
    setTarefas((prev) => prev.map((t) => (t.id === id ? { ...t, done: !doneAtual } : t)))
    await supabase.from('tasks').update({ done: !doneAtual }).eq('id', id)
  }

  const removerTarefa = async (id) => {
    setTarefas((prev) => prev.filter((t) => t.id !== id))
    await supabase.from('tasks').delete().eq('id', id)
  }

  if (carregando) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
        Carregando aplicações...
      </div>
    )
  }

  const tarefasGerais = tarefas.filter((t) => !t.application_id)

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
        <a href="/chat" style={{ fontSize: 13, fontWeight: 600, color: corContraste, textDecoration: 'none' }}>
          ← Voltar ao chat
        </a>
      </header>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>
          Minhas aplicações
        </h1>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
          Acompanhe cada universidade e o checklist específico dela.
        </p>

        {/* Formulário para adicionar universidade manualmente */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          <input
            type="text"
            value={novaUniversidade}
            onChange={(e) => setNovaUniversidade(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && adicionarUniversidade()}
            placeholder="Adicionar universidade (ex: Stanford)"
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid #ddd',
              borderRadius: 10,
              fontSize: 14,
              color: '#1a1a1a',
            }}
          />
          <button
            onClick={adicionarUniversidade}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderRadius: 10,
              background: corDestaque,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Adicionar
          </button>
        </div>

        {aplicacoes.length === 0 && tarefasGerais.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', borderRadius: 14 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>
              Nenhuma aplicação por aqui ainda
            </p>
            <p style={{ fontSize: 13, color: '#888', maxWidth: 320, margin: '0 auto' }}>
              Conte pro Admitly no chat quais universidades você quer aplicar, ou adicione uma acima.
            </p>
          </div>
        )}

        {aplicacoes.map((ap) => {
          const tarefasDaAplicacao = tarefas.filter((t) => t.application_id === ap.id)
          const tarefasConcluidas = tarefasDaAplicacao.filter((t) => t.done).length
          const progresso = tarefasDaAplicacao.length > 0
            ? Math.round((tarefasConcluidas / tarefasDaAplicacao.length) * 100)
            : 0
          return (
            <div
              key={ap.id}
              style={{
                background: '#fff',
                borderRadius: 14,
                padding: 20,
                marginBottom: 16,
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>{ap.university}</h2>
                <button
                  onClick={() => removerUniversidade(ap.id)}
                  aria-label="Remover"
                  style={{ border: 'none', background: 'transparent', color: '#bbb', cursor: 'pointer', fontSize: 16 }}
                >
                  ×
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <select
                  value={ap.status || 'pesquisando'}
                  onChange={(e) => atualizarStatus(ap.id, e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    fontSize: 13,
                    color: '#1a1a1a',
                    background: '#fafafa',
                  }}
                >
                  {STATUS_OPCOES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={ap.deadline || ''}
                  onChange={(e) => atualizarPrazo(ap.id, e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    fontSize: 13,
                    color: '#1a1a1a',
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setAplicacoesAbertas((prev) => ({ ...prev, [ap.id]: !prev[ap.id] }))}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: corContraste,
                  padding: 0,
                  marginBottom: aplicacoesAbertas[ap.id] ? 14 : 0,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {aplicacoesAbertas[ap.id] ? '− Ocultar detalhes' : '+ Completar detalhes da candidatura'}
              </button>

              {aplicacoesAbertas[ap.id] && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 10,
                    padding: 14,
                    marginBottom: 16,
                    borderRadius: 10,
                    background: '#fafafa',
                    border: '1px solid #eee',
                  }}
                >
                  <DetalheAplicacao
                    label="Curso ou programa"
                    value={ap.details?.course || ''}
                    placeholder="Ex: Engenharia"
                    onBlur={(value) => atualizarDetalhe(ap.id, 'course', value)}
                  />
                  <DetalheAplicacao
                    label="País e cidade"
                    value={ap.details?.location || ''}
                    placeholder="Ex: Boston, EUA"
                    onBlur={(value) => atualizarDetalhe(ap.id, 'location', value)}
                  />
                  <DetalheAplicacao
                    label="Período de entrada"
                    value={ap.details?.intake || ''}
                    placeholder="Ex: Fall 2027"
                    onBlur={(value) => atualizarDetalhe(ap.id, 'intake', value)}
                  />
                  <DetalheAplicacao
                    label="Tipo de candidatura"
                    value={ap.details?.applicationType || ''}
                    placeholder="Ex: Graduação"
                    onBlur={(value) => atualizarDetalhe(ap.id, 'applicationType', value)}
                  />
                  <DetalheAplicacao
                    label="Mensalidade ou tuition"
                    value={ap.details?.tuition || ''}
                    placeholder="Ex: US$ 40 mil/ano"
                    onBlur={(value) => atualizarDetalhe(ap.id, 'tuition', value)}
                  />
                  <DetalheAplicacao
                    label="Moradia e custo de vida"
                    value={ap.details?.livingCost || ''}
                    placeholder="Ex: US$ 18 mil/ano"
                    onBlur={(value) => atualizarDetalhe(ap.id, 'livingCost', value)}
                  />
                  <DetalheAplicacao
                    label="Taxa de candidatura"
                    value={ap.details?.applicationFee || ''}
                    placeholder="Ex: US$ 90"
                    onBlur={(value) => atualizarDetalhe(ap.id, 'applicationFee', value)}
                  />
                  <DetalheAplicacao
                    label="Bolsa ou auxílio"
                    value={ap.details?.scholarship || ''}
                    placeholder="Ex: Need-based"
                    onBlur={(value) => atualizarDetalhe(ap.id, 'scholarship', value)}
                  />
                </div>
              )}

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 5 }}>
                  <span>Progresso da candidatura</span>
                  <span>{tarefasConcluidas}/{tarefasDaAplicacao.length} concluídas</span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: '#e5e7eb', overflow: 'hidden' }}>
                  <div style={{ width: `${progresso}%`, height: '100%', borderRadius: 99, background: corDestaque }} />
                </div>
              </div>

              {tarefasDaAplicacao.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => alternarTarefa(t.id, t.done)}
                    style={{ width: 16, height: 16, accentColor: corDestaque, cursor: 'pointer' }}
                  />
                  <span style={{ flex: 1, fontSize: 13, color: t.done ? '#aaa' : '#1a1a1a', textDecoration: t.done ? 'line-through' : 'none' }}>
                    {t.title}
                  </span>
                  <button
                    onClick={() => removerTarefa(t.id)}
                    style={{ border: 'none', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: 14 }}
                  >
                    ×
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <input
                  type="text"
                  value={novasTarefas[ap.id] || ''}
                  onChange={(e) => setNovasTarefas((prev) => ({ ...prev, [ap.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && adicionarTarefa(ap.id, novasTarefas[ap.id])}
                  placeholder="Adicionar requisito ou tarefa..."
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid #eee',
                    fontSize: 13,
                    color: '#1a1a1a',
                  }}
                />
                <button
                  onClick={() => adicionarTarefa(ap.id, novasTarefas[ap.id])}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#f4f4f4',
                    color: corContraste,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
              </div>
            </div>
          )
        })}

        {/* Metas gerais */}
        {(tarefasGerais.length > 0 || aplicacoes.length > 0) && (
          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 12 }}>
              Metas gerais
            </h2>
            <div style={{ background: '#fff', borderRadius: 14, padding: 20 }}>
              {tarefasGerais.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => alternarTarefa(t.id, t.done)}
                    style={{ width: 16, height: 16, accentColor: corDestaque, cursor: 'pointer' }}
                  />
                  <span style={{ flex: 1, fontSize: 13, color: t.done ? '#aaa' : '#1a1a1a', textDecoration: t.done ? 'line-through' : 'none' }}>
                    {t.title}
                  </span>
                  <button
                    onClick={() => removerTarefa(t.id)}
                    style={{ border: 'none', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: 14 }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <input
                  type="text"
                  value={novaTarefaGeral}
                  onChange={(e) => setNovaTarefaGeral(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && adicionarTarefa(null, novaTarefaGeral).then(() => setNovaTarefaGeral(''))}
                  placeholder="Nova meta geral..."
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid #eee',
                    fontSize: 13,
                    color: '#1a1a1a',
                  }}
                />
                <button
                  onClick={() => adicionarTarefa(null, novaTarefaGeral)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#f4f4f4',
                    color: corContraste,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DetalheAplicacao({ label, value, placeholder, onBlur }) {
  const [valor, setValor] = useState(value)

  useEffect(() => {
    setValor(value)
  }, [value])

  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#57534e' }}>
      {label}
      <input
        type="text"
        value={valor}
        onChange={(event) => setValor(event.target.value)}
        onBlur={() => onBlur(valor)}
        placeholder={placeholder}
        style={{
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          marginTop: 5,
          padding: '8px 10px',
          border: '1px solid #ddd',
          borderRadius: 8,
          background: '#fff',
          color: '#1a1a1a',
          fontSize: 13,
          fontWeight: 400,
        }}
      />
    </label>
  )
}