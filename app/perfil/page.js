'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const CAMPOS_INICIAIS = {
  objetivo: '',
  idade: '',
  anoEscolar: '',
  areaInteresse: '',
  notas: '',
  atividades: '',
  orcamento: '',
  paisPreferencia: '',
  nivelIngles: '',
}

const camposTexto = [
  { nome: 'idade', rotulo: 'Idade', tipo: 'number', placeholder: 'Ex: 17' },
  { nome: 'areaInteresse', rotulo: 'Área ou curso de interesse', placeholder: 'Ex: Engenharia, Economia, Design' },
  { nome: 'orcamento', rotulo: 'Orçamento aproximado', placeholder: 'Ex: R$ 80 mil por ano' },
  { nome: 'paisPreferencia', rotulo: 'País ou região de preferência', placeholder: 'Ex: Estados Unidos ou Europa' },
]

export default function Perfil() {
  const router = useRouter()
  const [formulario, setFormulario] = useState(CAMPOS_INICIAIS)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    const carregarPerfil = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      setFormulario({ ...CAMPOS_INICIAIS, ...(user.user_metadata?.perfil_academico || {}) })
      setCarregando(false)
    }

    carregarPerfil()
  }, [router])

  const atualizarCampo = (nome, valor) => {
    setFormulario((atual) => ({ ...atual, [nome]: valor }))
    setMensagem('')
    setErro('')
  }

  const salvarPerfil = async (event) => {
    event.preventDefault()
    setSalvando(true)
    setMensagem('')
    setErro('')

    const { error } = await supabase.auth.updateUser({
      data: { perfil_academico: formulario },
    })

    if (error) {
      setErro('Não foi possível salvar seu perfil. Tente novamente.')
    } else {
      setMensagem('Perfil salvo com sucesso.')
    }
    setSalvando(false)
  }

  if (carregando) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
        Carregando perfil...
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
        <strong style={{ fontSize: 16, color: '#57534e' }}>
          Admit<span style={{ color: '#10b981' }}>ly</span>
        </strong>
        <a href="/chat" style={{ fontSize: 13, fontWeight: 600, color: '#57534e', textDecoration: 'none' }}>
          ← Voltar ao chat
        </a>
      </header>

      <main style={{ maxWidth: 700, margin: '0 auto', padding: '32px 20px 48px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>
          Meu perfil acadêmico
        </h1>
        <p style={{ fontSize: 13, color: '#888', lineHeight: 1.6, marginBottom: 24 }}>
          Essas informações ajudam o Admitly a adaptar recomendações, prazos e universidades ao seu momento.
        </p>

        <form onSubmit={salvarPerfil} style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#57534e', marginBottom: 6 }}>
            Qual é seu objetivo?
          </label>
          <select
            value={formulario.objetivo}
            onChange={(event) => atualizarCampo('objetivo', event.target.value)}
            style={estiloCampo}
          >
            <option value="">Selecione uma opção</option>
            <option value="intercambio de curta duração">Intercâmbio de curta duração</option>
            <option value="graduacao completa no exterior">Graduação completa no exterior</option>
            <option value="ainda não decidi">Ainda não decidi</option>
            <option value="outro">Outro</option>
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 120px) 1fr', gap: 12, marginTop: 16 }}>
            <Campo
              {...camposTexto[0]}
              value={formulario.idade}
              onChange={atualizarCampo}
            />
            <div>
              <label style={estiloRotulo}>Ano escolar atual</label>
              <select
                value={formulario.anoEscolar}
                onChange={(event) => atualizarCampo('anoEscolar', event.target.value)}
                style={estiloCampo}
              >
                <option value="">Selecione</option>
                <option value="8º ano do ensino fundamental">8º ano do ensino fundamental</option>
                <option value="9º ano do ensino fundamental">9º ano do ensino fundamental</option>
                <option value="1º ano do ensino médio">1º ano do ensino médio</option>
                <option value="2º ano do ensino médio">2º ano do ensino médio</option>
                <option value="3º ano do ensino médio">3º ano do ensino médio</option>
                <option value="já concluí o ensino médio">Já concluí o ensino médio</option>
                <option value="faculdade em andamento">Faculdade em andamento</option>
              </select>
            </div>
          </div>

          {camposTexto.slice(1).map((campo) => (
            <Campo
              key={campo.nome}
              {...campo}
              value={formulario[campo.nome]}
              onChange={atualizarCampo}
            />
          ))}

          <CampoArea
            nome="notas"
            rotulo="Como estão suas notas?"
            placeholder="Ex: média 8,5; melhores notas em matemática e física"
            value={formulario.notas}
            onChange={atualizarCampo}
          />
          <CampoArea
            nome="atividades"
            rotulo="Atividades extracurriculares"
            placeholder="Ex: iniciação científica, esporte, voluntariado, projetos"
            value={formulario.atividades}
            onChange={atualizarCampo}
          />

          <label style={{ ...estiloRotulo, marginTop: 16 }}>Nível de inglês</label>
          <select
            value={formulario.nivelIngles}
            onChange={(event) => atualizarCampo('nivelIngles', event.target.value)}
            style={estiloCampo}
          >
            <option value="">Selecione uma opção</option>
            <option value="iniciante">Iniciante</option>
            <option value="intermediário">Intermediário</option>
            <option value="avançado">Avançado</option>
            <option value="fluente">Fluente</option>
            <option value="ainda não sei">Ainda não sei</option>
          </select>

          {erro && <p style={{ color: '#dc2626', fontSize: 13, margin: '16px 0 0' }}>{erro}</p>}
          {mensagem && <p style={{ color: '#059669', fontSize: 13, margin: '16px 0 0' }}>{mensagem}</p>}

          <button
            type="submit"
            disabled={salvando}
            style={{
              width: '100%',
              marginTop: 20,
              padding: '12px 16px',
              border: 'none',
              borderRadius: 10,
              background: salvando ? '#9ca3af' : '#10b981',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: salvando ? 'default' : 'pointer',
            }}
          >
            {salvando ? 'Salvando...' : 'Salvar perfil'}
          </button>
        </form>
      </main>
    </div>
  )
}

function Campo({ nome, rotulo, tipo = 'text', placeholder, value, onChange }) {
  return (
    <div style={{ marginTop: 16 }}>
      <label style={estiloRotulo}>{rotulo}</label>
      <input
        type={tipo}
        value={value}
        onChange={(event) => onChange(nome, event.target.value)}
        placeholder={placeholder}
        min={tipo === 'number' ? 10 : undefined}
        max={tipo === 'number' ? 100 : undefined}
        style={estiloCampo}
      />
    </div>
  )
}

function CampoArea({ nome, rotulo, placeholder, value, onChange }) {
  return (
    <div style={{ marginTop: 16 }}>
      <label style={estiloRotulo}>{rotulo}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(nome, event.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{ ...estiloCampo, resize: 'vertical', lineHeight: 1.5 }}
      />
    </div>
  )
}

const estiloRotulo = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#57534e',
  marginBottom: 6,
}

const estiloCampo = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: '1px solid #ddd',
  borderRadius: 9,
  background: '#fff',
  color: '#1a1a1a',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
}
