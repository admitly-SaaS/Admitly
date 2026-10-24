'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

// Cada "sala" do site vira UMA linha na carta.
// Feature nova = um item novo aqui. Passou de 5 itens, a carta vira
// documentação: explique o resto dentro da própria página, na primeira visita.
const SALAS = [
  { nome: 'Perfil', texto: 'Onde tudo começa. Quanto melhor você se conta, mais precisas ficam as recomendações.' },
  { nome: 'Oportunidades', texto: 'Olimpíadas, programas de verão, pesquisas e bolsas, com prazo, custo e requisitos.' },
  { nome: 'Chat', texto: 'Um mentor para tirar dúvidas, montar um plano e revisar seus ensaios.' },
  { nome: 'Aplicações', texto: 'O que você já iniciou, com prazos e próximos passos.' },
]

// ===== Arte final da marca (escudo-pórtico) =====
// O "A" de Admitly como arquitetura: frontão, três colunas, arquitraves.
// Mesma geometria do usuário nas três versões (letterhead, selo, favicon);
// inline para herdar as fontes da página (Libre Caslon Text) e manter os
// filetes finos nítidos em qualquer escala.
function ArteEscudo() {
  return (
    <g>
      <path d="M-56 -70 L56 -70 L56 5 C56 45 28 68 0 80 C-28 68 -56 45 -56 5 Z" fill="#F6F2EA" stroke="#1F3A5F" strokeWidth="3" />
      <path d="M-49.5 -63.5 L49.5 -63.5 L49.5 4 C49.5 40 24 61.5 0 72.5 C-24 61.5 -49.5 40 -49.5 4 Z" fill="none" stroke="#1F3A5F" strokeWidth=".9" />
      <text x="0" y="-47.5" textAnchor="middle" fontFamily="Libre Caslon Text, Georgia, serif" fontSize="11" letterSpacing="4.5" fill="#1F3A5F">ADMITLY</text>
      <path d="M-40 -40.5 H40" stroke="#1F3A5F" strokeWidth="1.1" />
      <path d="M-40 -38.5 H40" stroke="#1F3A5F" strokeWidth=".5" />
      <polygon points="-38,-10 38,-10 0,-35" fill="#1F3A5F" />
      <polygon points="-29,-12.5 29,-12.5 0,-30.2" fill="#F6F2EA" />
      <text x="0" y="-14.4" textAnchor="middle" fontFamily="Libre Caslon Text, Georgia, serif" fontSize="15" fill="#1F3A5F">A</text>
      <rect x="-34" y="-8.5" width="68" height="3.5" fill="#1F3A5F" />
      <rect x="-31.3" y="-4.6" width="8.6" height="2.2" fill="#1F3A5F" />
      <rect x="-29.8" y="-2.4" width="5.6" height="24.4" fill="#1F3A5F" />
      <path d="M-27.9 -1.5 V21 M-26.1 -1.5 V21" stroke="#F6F2EA" strokeWidth=".45" />
      <rect x="-31.3" y="21.8" width="8.6" height="1.6" fill="#1F3A5F" />
      <rect x="-13.3" y="-4.6" width="8.6" height="2.2" fill="#1F3A5F" />
      <rect x="-11.8" y="-2.4" width="5.6" height="24.4" fill="#1F3A5F" />
      <path d="M-9.9 -1.5 V21 M-8.1 -1.5 V21" stroke="#F6F2EA" strokeWidth=".45" />
      <rect x="-13.3" y="21.8" width="8.6" height="1.6" fill="#1F3A5F" />
      <rect x="4.7" y="-4.6" width="8.6" height="2.2" fill="#1F3A5F" />
      <rect x="6.2" y="-2.4" width="5.6" height="24.4" fill="#1F3A5F" />
      <path d="M8.1 -1.5 V21 M9.9 -1.5 V21" stroke="#F6F2EA" strokeWidth=".45" />
      <rect x="4.7" y="21.8" width="8.6" height="1.6" fill="#1F3A5F" />
      <rect x="22.7" y="-4.6" width="8.6" height="2.2" fill="#1F3A5F" />
      <rect x="24.2" y="-2.4" width="5.6" height="24.4" fill="#1F3A5F" />
      <path d="M26.1 -1.5 V21 M27.9 -1.5 V21" stroke="#F6F2EA" strokeWidth=".45" />
      <rect x="22.7" y="21.8" width="8.6" height="1.6" fill="#1F3A5F" />
      <path d="M-3.6 23.4 V13 A3.6 3.6 0 0 1 3.6 13 V23.4 Z" fill="#1F3A5F" />
      <rect x="-33" y="23.4" width="66" height="3" fill="#1F3A5F" />
      <rect x="-36" y="26.4" width="72" height="3" fill="#1F3A5F" />
      <rect x="-39" y="29.4" width="78" height="3.4" fill="#1F3A5F" />
      <path d="M-24 40.5 C-10 37.5 10 43.5 24 39.5" fill="none" stroke="#1F3A5F" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M-14 44.5 C-4 43 6 46 14 44" fill="none" stroke="#1F3A5F" strokeWidth=".9" strokeLinecap="round" opacity=".55" />
      <path d="M0 54 l3.2 4 l-3.2 4 l-3.2 -4 Z" fill="#1F3A5F" />
    </g>
  )
}

// Letterhead completo: escudo + wordmark + setor + régua dupla, num SVG só.
function LetterheadMarca() {
  return (
    <svg className="letterhead-svg" viewBox="0 0 480 100" role="img" aria-label="Admitly — Oportunidades e Admissões">
      <g transform="translate(40 50) scale(.58)">
        <ArteEscudo />
      </g>
      <text x="100" y="46" fontFamily="Libre Caslon Text, Georgia, serif" fontSize="32" letterSpacing="4.2" fill="#1F3A5F">ADMITLY</text>
      <text x="100" y="68" fontFamily="Libre Caslon Text, Georgia, serif" fontSize="15" fill="#191512">Oportunidades <tspan fontStyle="italic">{'&'}</tspan> Admissões</text>
      <path d="M100 77 H340" stroke="#1F3A5F" strokeWidth="2" />
      <path d="M100 81.5 H340" stroke="#1F3A5F" strokeWidth="1" />
    </svg>
  )
}

// Selo da assinatura: o escudo completo, com o miúdo todo.
function Selo() {
  return (
    <svg className="selo-svg" viewBox="-60 -74 120 158" role="img" aria-label="Selo Admitly">
      <ArteEscudo />
    </svg>
  )
}

export default function Welcome() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [envelopeNum, setEnvelopeNum] = useState('001')
  const [hoje, setHoje] = useState('')

  // Datas, nome e número do envelope só no cliente (evita erro de hidratação).
  // A carta é para quem tem conta: sem sessão, volta pro login.
  useEffect(() => {
    // Microtask: o setState sai do corpo síncrono do effect (evita render em
    // cascata dentro da execução própria do efeito) e continua client-only.
    queueMicrotask(() => {
      try {
        setHoje(new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }))
      } catch { /* ignore */ }
    })

    supabase.auth.getUser().then(({ data }) => {
      const user = data && data.user
      if (!user) { router.replace('/login'); return }

      try {
        const n = localStorage.getItem('admitly_carta_seq') || '001'
        setEnvelopeNum(n)
        localStorage.setItem('admitly_carta_seq', String(parseInt(n, 10) + 1).padStart(3, '0'))
      } catch { /* ignore */ }

      const meta = user.user_metadata || {}
      const completo = String(meta.full_name || meta.name || '').trim()
      if (completo) setNome(completo.split(/\s+/)[0])
    }).catch(() => { /* ignore */ })
  }, [router])

  const comecar = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      localStorage.removeItem('admitly_carta_seq')
      router.push('/perfil')
    } catch {
      router.push('/perfil')
    }
  }, [router])

  const sair = useCallback(async () => {
    try { await supabase.auth.signOut() } catch { /* ignore */ }
    router.push('/login')
  }, [router])

  return (
    <main className="carta-pagina">
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

      <div className="carta-folha">
        {/* ===== Letterhead ===== */}
        <header className="carta-letterhead">
          <LetterheadMarca />
        </header>

        {/* ===== Corpo ===== */}
        <div className="carta-corpo">
          <p>{nome ? `${nome},` : 'Olá,'}</p>

          <p>
            Bem-vindo ao Admitly. Reunimos num só lugar o que normalmente está espalhado entre sites, planilhas e grupos de rede social: descobrir oportunidades no exterior, entender se elas fazem sentido para você e acompanhar cada candidatura até o fim.
          </p>

          <h3 className="carta-titulo">Como o Admitly funciona</h3>

          <ol className="carta-salas">
            {SALAS.map((s, i) => (
              <li key={s.nome}>
                <span className="sala-num">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <span className="sala-nome">{s.nome}</span>
                  <span className="sala-texto">{s.texto}</span>
                </span>
              </li>
            ))}
          </ol>

          <p>
            Por onde começar: conte um pouco sobre você. Leva poucos minutos, e é isso que faz o resto funcionar.
          </p>

          {/* ===== Assinatura + selo ===== */}
          <div className="carta-assinatura">
            <div>
              <p className="ate-ja">Até já,</p>
              <div className="nome-assinado">
                Admitly
                <svg viewBox="0 0 100 8" preserveAspectRatio="none" filter="url(#tinta)" aria-hidden="true">
                  <use href="#traco-tinteiro" />
                </svg>
              </div>
              <div className="cargo">SEU ACERVO DE OPORTUNIDADES</div>
            </div>
            <Selo />
          </div>

          <div className="carta-envelope">
            <span>ENVELOPE Nº {envelopeNum}</span>
            <span>DESTINATÁRIO: VOCÊ</span>
            <span>POSTAGEM: {hoje || '—'}</span>
          </div>
        </div>

        <div className="carta-cta">
          <button type="button" className="btn-primario" onClick={comecar}>
            Completar meu perfil
          </button>
        </div>

        <footer className="carta-rodape">
          <span>Termos de uso · Privacidade · Contato</span>
          <button type="button" className="btn-link" onClick={sair}>Sair</button>
        </footer>
      </div>
    </main>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');

.carta-pagina{
  --papel:#F6F2EA; --tinta:#191512; --tinta-sec:#5C554B; --hairline:#E2DACB;
  --lacre:#1A4D3A; --acento:#1F3A5F;
  min-height:100vh; background:var(--papel); color:var(--tinta);
  font-family:'Libre Caslon Text', Georgia, serif; -webkit-font-smoothing:antialiased;
}
.carta-folha{ max-width:760px; margin:0 auto; padding:56px 28px 40px; }

.carta-letterhead{ display:flex; align-items:center; }
.letterhead-svg{ display:block; width:min(440px,100%); height:auto; }

.carta-corpo{ margin-top:40px; font-size:18px; line-height:1.8; max-width:62ch; }
.carta-corpo > p + p{ margin-top:16px; }
.carta-titulo{ margin:40px 0 8px; font:400 28px/1.2 'Instrument Serif', Georgia, serif; letter-spacing:-.005em; }

.carta-salas{ list-style:none; padding:0; margin:0 0 32px; border-top:1px solid var(--hairline); }
.carta-salas li{ display:flex; gap:18px; padding:16px 0; border-bottom:1px solid var(--hairline); }
.sala-num{ font:500 12px/2.4 'IBM Plex Mono', ui-monospace, monospace; color:var(--acento); flex:none; }
.sala-nome{ display:block; font:400 22px/1.3 'Instrument Serif', Georgia, serif; }
.sala-texto{ display:block; font-size:16.5px; line-height:1.65; color:var(--tinta-sec); }

.carta-assinatura{ margin-top:40px; display:flex; align-items:center; justify-content:space-between; gap:24px; flex-wrap:wrap; }
.ate-ja{ margin-bottom:10px; }
.nome-assinado{ position:relative; display:inline-block; padding-bottom:12px; font:italic 400 36px/1 'Instrument Serif', Georgia, serif; }
.nome-assinado svg{ position:absolute; left:2%; bottom:0; width:96%; height:8px; overflow:visible; stroke:var(--acento); }
.cargo{ margin-top:8px; font:400 10.5px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing:.14em; color:var(--tinta-sec); }
.selo-svg{ height:150px; width:auto; flex:none; }

.carta-envelope{ margin-top:36px; padding-top:14px; border-top:1px solid var(--hairline); display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap;
  font:400 11px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing:.08em; color:var(--tinta-sec); }

.carta-cta{ margin-top:40px; }
.btn-primario{ font:600 15px/1 'Instrument Sans','Helvetica Neue',sans-serif; letter-spacing:.01em; padding:14px 26px; border-radius:3px; cursor:pointer;
  background:var(--tinta); color:#FCFAF5; border:1px solid var(--tinta); transition:background-color .15s ease, border-color .15s ease; }
.btn-primario:hover{ background:#2A231E; border-color:#2A231E; }

.carta-rodape{ margin-top:64px; padding-top:16px; border-top:1px solid var(--hairline); display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;
  font:400 11px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing:.1em; text-transform:uppercase; color:var(--tinta-sec); }
.btn-link{ background:none; border:0; cursor:pointer; font:600 13px 'Instrument Sans', sans-serif; color:var(--lacre);
  text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1.5px; padding:4px 2px; }

@media (max-width:560px){
  .carta-folha{ padding:36px 20px 32px; }
  .letterhead-svg{ width:100%; }
  .selo-svg{ height:118px; }
  .carta-corpo{ font-size:17px; }
  .carta-assinatura{ flex-direction:column; align-items:flex-start; }
  .btn-primario{ width:100%; }
}
`
