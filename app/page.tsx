"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

// A porta de entrada — não é landing page, é o balcão de recepção. Quem não
// está logado vai ao login; quem está vai ao mentor, que por sua vez encaminha
// ao /assinar se a assinatura não estiver ativa. Assim o endereço raiz nunca
// mostra tela em branco nem sobra de template.

const ESCUDO = (
  <svg className="inicio-escudo" viewBox="-60 -74 120 158" role="img" aria-label="Escudo Admitly">
    <path d="M-56 -70 L56 -70 L56 5 C56 45 28 68 0 80 C-28 68 -56 45 -56 5 Z" fill="#F6F2EA" stroke="#1F3A5F" strokeWidth="5.5" />
    <g transform="translate(0 -10) scale(1.02)">
      <polygon points="-39,-9 39,-9 0,-36" fill="#1F3A5F" />
      <rect x="-35" y="-6" width="70" height="4.5" fill="#1F3A5F" />
      <rect x="-29" y="-1.5" width="10" height="25" fill="#1F3A5F" />
      <rect x="-5" y="-1.5" width="10" height="25" fill="#1F3A5F" />
      <rect x="19" y="-1.5" width="10" height="25" fill="#1F3A5F" />
      <rect x="-36" y="23.5" width="72" height="4" fill="#1F3A5F" />
      <rect x="-40" y="27.5" width="80" height="4.5" fill="#1F3A5F" />
    </g>
  </svg>
);

export default function Inicio() {
  const router = useRouter();

  useEffect(() => {
    let ativo = true;

    const entrar = async () => {
      let temSessao = false;
      try {
        // getSession lê do armazenamento local: basta para saber se há alguém
        // logado. A validação de verdade (e a checagem de assinatura) fica a
        // cargo do guard da página de destino.
        const { data } = await supabase.auth.getSession();
        temSessao = Boolean(data?.session);
      } catch (e) {
        console.warn("inicio: não foi possível ler a sessão", e);
      }
      if (ativo) router.replace(temSessao ? "/chat" : "/login");
    };

    entrar();
    return () => {
      ativo = false;
    };
  }, [router]);

  return (
    <main className="inicio">
      <style>{CSS}</style>
      <div className="inicio-marca">
        {ESCUDO}
        <span className="inicio-nome">Admitly</span>
        <span className="inicio-linha">Abrindo sua carta...</span>
      </div>
    </main>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&display=swap');

.inicio{
  min-height:100vh; background:#F6F2EA; color:#191512;
  display:grid; place-items:center;
  font-family:'Libre Caslon Text',Georgia,serif; -webkit-font-smoothing:antialiased;
}
.inicio-marca{ display:flex; flex-direction:column; align-items:center; gap:14px; }
.inicio-escudo{ width:44px; height:auto; }
.inicio-nome{
  font:600 12px/1 'Instrument Sans','Helvetica Neue',sans-serif;
  text-transform:uppercase; letter-spacing:.2em; color:#1F3A5F;
}
.inicio-linha{
  font-family:'IBM Plex Mono',ui-monospace,monospace;
  font-size:10.5px; letter-spacing:.1em; color:#5C554B;
}
`;
