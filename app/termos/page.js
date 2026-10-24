import Link from 'next/link'

// Termos de Serviço — SaaS de assinatura (CDC + Decreto 7.962/2013).
// Itens obrigatórios cobertos: identificação das partes, preço/recorrência,
// conta, IA (limitações), uso aceitável, cancelamento e arrependimento (7 dias,
// art. 49 CDC — nunca afastável, art. 51), menores, PI, lei/foro.
export const metadata = {
  title: 'Admitly — Termos de Serviço',
}

const SEC = ({ num, titulo, children }) => (
  <section className="legal-secao">
    <h2><span className="legal-num">{num}</span>{titulo}</h2>
    {children}
  </section>
)

export default function Termos() {
  return (
    <main className="legal-pagina">
      <style>{CSS}</style>
      <header className="legal-topo">
        <Link href="/" className="marca-mini">
          <span>Admitly</span>
        </Link>
        <nav className="legal-nav">
          <a href="/privacidade">Privacidade</a>
          <a href="/reembolso">Reembolso</a>
        </nav>
      </header>

      <article className="legal-carta">
        <span className="caps-sec">Documento legal · versão 1.0 · 21/10/2026</span>
        <h1>Termos de <em>Serviço</em></h1>
        <p className="legal-sub">
          O contrato entre você e a Admitly. Ao criar uma conta ou assinar, você
          concorda com estes termos — e, pelo direito do consumidor (art. 49 do CDC),
          você sempre pode mudar de ideia nos primeiros 7 dias, com devolução integral.
        </p>

        <SEC num="1" titulo="Quem somos e o que é o serviço">
          <p>
            <strong>A Admitly</strong> — <span className="legal-agenda">[completar razão social e CNPJ antes de publicar]</span> — é
            uma plataforma web que ajuda estudantes brasileiros a planejar candidaturas
            internacionais: catálogo de oportunidades com prazo e custo, recomendações
            personalizadas por compatibilidade, checklists de candidatura, área de
            redações e um mentor conversacional por IA.
            <strong> Dúvida ou contato:</strong>{' '}
            <a href="mailto:admitly.suporte@gmail.com">admitly.suporte@gmail.com</a>.
          </p>
        </SEC>

        <SEC num="2" titulo="Quem pode usar">
          <ul>
            <li><strong>Menores de 16 anos:</strong> a conta deve ser criada e conduzida
            pelo responsável legal (pai, mãe ou responsável); ele é quem contrata.</li>
            <li><strong>De 16 a 17:</strong> o estudante pode criar a conta, mas pedimos
            a ciência do responsável — e a assinatura deve ser autorizada por ele.</li>
            <li><strong>18 ou mais:</strong> contratação direta.</li>
          </ul>
          <p>
            Você é responsável pelo que escreve no app e por manter a senha segura de
            forma digna. Conteúdo ilegal ou abusivo pode levar à suspensão da conta
            (com aviso prévio, salvo risco concreto à segurança ou a direitos de
            terceiros).
          </p>
        </SEC>

        <SEC num="3" titulo="Assinatura, preço e renovação">
          <ul>
            <li><strong>Plano único: R$ 49,90/mês</strong>, cobrado no checkout da Kiwify
            (cartão, Pix ou boleto), com renovação automática mensal.</li>
            <li>A <strong>primeira cobrança</strong> acontece na contratação; as próximas
            a cada ciclo mensal, na data da assinatura.</li>
            <li><strong>Não existe teste gratuito automático</strong> — mas, antes de
            pagar, você vê um resumo gratuito das oportunidades compatíveis com o seu
            perfil na página de assinatura.</li>
            <li><strong>Cancelamento:</strong> você pode cancelar a assinatura quando
            quiser (canal de suporte ou pelo link de reembolso/cancelamento da Kiwify);
            o cancelamento interrompe as cobranças futuras e você mantém acesso até o
            fim do ciclo já pago.</li>
            <li><strong>Arrependimento legal:</strong> nos primeiros 7 dias após a
            contratação você pode desistir e receber todo o valor de volta — independentemente
            de ter usado ou não o serviço (ver a <a href="/reembolso">Política de Reembolso</a>).</li>
          </ul>
        </SEC>

        <SEC num="4" titulo="O mentor de IA: o que ele é e o que não é">
          <p>
            As respostas do chat, a análise de redações e as recomendações de
            compatibilidade são <strong>geradas por inteligência artificial</strong>
            (Google Gemini). Elas são um ponto de partida, não uma garantia:
          </p>
          <ul>
            <li>a IA <strong>pode errar, inventar ou ficar desatualizada</strong> — não
            aceitamos responsabilidade por decisões tomadas sem você conferir as
            informações-oficiais na universidade/programa;</li>
            <li>prazos, custos e requisitos são aproximados e mudam sem aviso —
            <strong>as fontes oficiais de cada programa são a verdade</strong> (o app
            alerta quando o prazo está encerrado, mas confirme sempre no site oficial);</li>
            <li>revisão de redação é feedback de leitura crítica, não substituição de
            orientação escolar ou assessoria profissional.</li>
          </ul>
        </SEC>

        <SEC num="5" titulo="Seus dados e o seu conteúdo">
          <p>
            Tratamos os seus dados conforme a <a href="/privacidade">Política de Privacidade</a>.
            O que você escreve (candidaturas, redações, perfil) é seu conteúdo — você
            pode exportá-lo e apagar a qualquer momento, pelo próprio app ou por
            pedido ao canal de suporte. Não reivindicamos propriedade sobre o seu
            conteúdo; a licença de uso se limita à estrita necessidade de operar o
            serviço (processar, exibir e entregar a você).
          </p>
        </SEC>

        <SEC num="6" titulo="Uso aceitável">
          <p>É proibido:</p>
          <ul>
            <li>usar o app para práticas ilegais (fraude, plágio de conteúdo de
            terceiros, falsificação de documentos);</li>
            <li>explorar, revender, ceder ou compartilhar o acesso a quem
            assinou um ciclo (uma conta = um estudante);</li>
            <li>copiar o catálogo e as recomendações para revenda (os textos do
            acervo são protegidos; use como referência, não como base de produto
            concorrente);</li>
            <li>tentar quebrar a segurança, extrair dados de outros usuários ou
            onerar o serviço com acesso automatizado abusivo.</li>
          </ul>
        </SEC>

        <SEC num="7" titulo="Disponibilidade e limitação de responsabilidade">
          <p>
            Trabalhamos para manter o serviço sempre disponível, mas não há garantia de
            100% de uptime (manutenções, falhas de fornecedores, força maior). Nada
            destes termos limita a responsabilidade inderrogável dos arts. 6º e 20 do
            CDC nem afasta o direito de indenização por dano material e moral — e
            qualquer cláusula abusiva (art. 51 do CDC) é de todo nula.
          </p>
        </SEC>

        <SEC num="8" titulo="Lei e foro">
          <p>
            Estes termos são regidos pela <strong>lei brasileira</strong>. Em caso de
            conflito, o foro é o do <strong>domicílio do consumidor</strong> (nunca
            impomos foro que represente desvantagem ao consumidor).
          </p>
        </SEC>

        <SEC num="9" titulo="Mudanças nos termos">
          <p>
            Podemos atualizar os termos conforme o serviço evolui; mudanças com impacto
            negativo para você serão avisadas por e-mail com 15 dias de antecedência.
            Se você não concordar, pode cancelar sem custo extra — e, se dentro do
            período de arrependimento, receber tudo de volta.
          </p>
        </SEC>
      </article>

      <footer className="legal-pe">
        <p>Admitly · contato: <a href="mailto:admitly.suporte@gmail.com">admitly.suporte@gmail.com</a></p>
        <nav>
          <a href="/privacidade">Política de Privacidade</a> · <a href="/reembolso">Política de Reembolso</a>
        </nav>
      </footer>
    </main>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');

.legal-pagina{
  --papel:#F6F2EA; --papel-elev:#FCFAF5; --tinta:#191512; --tinta-sec:#5C554B; --hairline:#E2DACB;
  --lacre:#1A4D3A; --vermelho:#A6301F; --acento:#1F3A5F; --dourado:#B98A2F;
  --serif:'Instrument Serif',Georgia,serif; --corpo:'Libre Caslon Text',Georgia,serif;
  --sans:'Instrument Sans','Helvetica Neue',sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  min-height:100vh; background:var(--papel); color:var(--tinta);
  font-family:var(--corpo); -webkit-font-smoothing:antialiased;
}
.legal-pagina h1, .legal-pagina h2, .legal-pagina h3, .legal-pagina p, .legal-pagina ul{ margin:0; }

.legal-topo{
  display:flex; align-items:center; justify-content:space-between;
  max-width:760px; margin:0 auto; padding:28px 20px 8px;
}
.marca-mini{ display:inline-flex; align-items:center; gap:10px; text-decoration:none;
  font:400 22px/1 var(--serif); color:var(--tinta); }
.marca-mini span::after{ content:''; display:inline-block; width:4px; height:4px; border-radius:50%;
  background:var(--acento); margin-left:4px; }
.legal-nav{ display:flex; gap:18px; font:600 12px/1 var(--sans); letter-spacing:.06em; }
.legal-nav a{ color:var(--tinta-sec); text-decoration:none; }
.legal-nav a:hover{ color:var(--tinta); }

.legal-carta{
  max-width:760px; margin:22px auto 30px; padding:44px 46px;
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:8px;
}
.caps-sec{
  font-family:var(--sans); text-transform:uppercase; letter-spacing:.16em;
  font-size:11px; font-weight:600; color:var(--tinta-sec);
}
.legal-carta h1{
  font:400 clamp(34px,4vw,46px)/1.15 var(--serif); margin:10px 0 0; letter-spacing:-.005em;
}
.legal-carta h1 em{ font-style:italic; }
.legal-sub{ margin-top:14px; color:var(--tinta-sec); font:400 15px/1.7 var(--corpo); max-width:60ch; }

.legal-secao{ margin-top:38px; }
.legal-secao h2{
  display:flex; align-items:baseline; gap:10px;
  font:400 22px/1.3 var(--serif); color:var(--tinta); margin-bottom:12px;
}
.legal-num{
  font:600 11px/1 var(--mono); color:var(--dourado); letter-spacing:.1em;
  border:1px solid var(--hairline); border-radius:3px; padding:3px 7px; background:var(--papel);
}
.legal-secao p{ font:400 15px/1.75 var(--corpo); color:var(--tinta); margin-top:8px; max-width:65ch; }
.legal-secao ul{ margin:10px 0 0 22px; display:flex; flex-direction:column; gap:8px; }
.legal-secao li{ font:400 15px/1.7 var(--corpo); color:var(--tinta); max-width:62ch; }
.legal-secao a{ color:var(--acento); }
.legal-agenda{ color:var(--vermelho); font-family:var(--mono); font-size:12px; }

.legal-pe{ max-width:760px; margin:0 auto; padding:0 20px 44px; color:var(--tinta-sec);
  font:400 13px/1.7 var(--corpo); }
.legal-pe nav{ margin-top:6px; font:600 12px/1 var(--sans); letter-spacing:.04em; }
.legal-pe a{ color:var(--tinta-sec); text-decoration:underline; text-underline-offset:2px; }

@media (max-width:560px){
  .legal-carta{ padding:28px 22px; margin:14px 12px 24px; }
}
`
