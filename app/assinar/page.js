export default function Assinar() {
  const corDestaque = '#10b981'
  const corContraste = '#57534e'

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
            maxWidth: 420,
            background: '#fff',
            borderRadius: 16,
            padding: 36,
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
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
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
          </span>

          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: '#1a1a1a' }}>
            Você ainda não tem uma assinatura ativa
          </h1>
          <p style={{ fontSize: 14, color: '#888', lineHeight: 1.6, marginBottom: 24 }}>
            Assine o Admitly para ter acesso ilimitado ao mentor de IA para admissões internacionais.
          </p>

          <a
            href="https://pay.kiwify.com.br/1gI05Vm"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              width: '100%',
              padding: '12px 0',
              borderRadius: 10,
              background: corDestaque,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
              boxSizing: 'border-box',
            }}
          >
            Assinar agora — R$ 49,90/mês
          </a>
        </div>
      </div>
    </div>
  )
}