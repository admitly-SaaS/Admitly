import Link from 'next/link'

// Política de Reembolso — art. 49 CDC (arrependimento em até 7 dias na
// contratação online) + Decreto 7.962/2013 (canal eficaz, confirmação
// imediata e estorno rápido) + processamento prático via Kiwify.
export const metadata = {
  title: 'Admitly — Política de Reembolso',
}

export default function Reembolso() {
  return (
    <main className="legal-pagina">
      <style>{CSS}</style>
      <header className="legal-topo">
        <Link href="/" className="marca-mini">
          <span>Admitly</span>
        </Link>
        <nav className="legal-nav">
          <a href="/termos">Termos de Serviço</a>
          <a href="/privacidade">Privacidade</a>
        </nav>
      </header>

      <article className="legal-carta">
        <span className="caps-sec">Documento legal · versão 1.0 · 21/10/2026</span>
        <h1>Política de <em>Reembolso</em></h1>
        <p className="legal-sub">
          Compra pela internet tem o <strong>direito de arrependimento garantido por
          lei</strong> (art. 49 do CDC): você pode desistir nos primeiros 7 dias e
          receber tudo de volta — sem justificar, sem asterisco de rodapé.
        </p>

        <div className="legal-caixa">
          <strong>Resumo:</strong> 7 dias corridos desde a contratação, reembolso de
          100% do que foi pago, pedido por e-mail ao nosso suporte (ou pelo canal da
          Kiwify), confirmação na hora e devolução na mesma forma de pagamento. Pedir
          reembolso dentro do prazo encerra a assinatura na hora.
        </div>

        <section className="legal-secao">
          <h2><span className="legal-num">1</span>O prazo: 7 dias corridos</h2>
          <p>
            O prazo de 7 dias conta <strong>da contratação da assinatura</strong> (da
            confirmação do pagamento, quando a contratação é assinatura à distância,
            vale a data do primeiro acesso efetivo — sempre o prazo mais protetivo).
            A <strong>renovação automática não gera um novo</strong> prazo de arrependimento:
            cancelar a assinatura cancela as cobranças futuras (ver § 5).
          </p>
        </section>

        <section className="legal-secao">
          <h2><span className="legal-num">2</span>Como pedir</h2>
          <ul>
            <li><strong>Pelo e-mail:</strong>{' '}
            <a href="mailto:admitly.suporte@gmail.com?subject=Reembolso">admitly.suporte@gmail.com</a>{' '}
            com o assunto “Reembolso” — informe o e-mail da conta e a data da compra.
            Não precisa se justificar.</li>
            <li><strong>Pela Kiwify:</strong> a plataforma de pagamento tem o próprio
            canal de reembolso (a partir do e-mail de confirmação da compra); usar
            qualquer um dos dois canais vale — sua escolha.</li>
          </ul>
          <p>
            Confirmamos o recebimento <strong>imediatamente</strong> e instruímos a
            Kiwify a processar o estorno no mesmo dia útil.
          </p>
        </section>

        <section className="legal-secao">
          <h2><span className="legal-num">3</span>Como e quando o dinheiro volta</h2>
          <table className="legal-tabela">
            <thead>
              <tr><th>Forma de pagamento</th><th>Devolução</th><th>Prazo típico</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Cartão de crédito</td>
                <td>Estorno na mesma fatura (instruímos a Kiwify no mesmo dia do pedido)</td>
                <td>O emissor do cartão costuma creditar no próximo ciclo de fatura — prazo operacional do banco, não nosso</td>
              </tr>
              <tr>
                <td>Pix</td>
                <td>Devolução diretamente à mesma chave</td>
                <td>Até 5 dias úteis (na maior parte dos casos, 1–2 dias)</td>
              </tr>
              <tr>
                <td>Boleto</td>
                <td>Reembolso via Kiwify (transferência para a conta informada)</td>
                <td>Até 10 dias úteis</td>
              </tr>
            </tbody>
          </table>
          <p>
            O prazo do banco/processador não altera nenhum prazo seu ou nosso: vale
            quando <strong>você manifesta</strong> o arrependimento e quando
            <strong> nós instruímos</strong> o estorno — que é no mesmo dia útil do
            pedido.
          </p>
        </section>

        <section className="legal-secao">
          <h2><span className="legal-num">4</span>O que acontece com a conta</h2>
          <p>
            O reembolso dentro dos 7 dias encerra a assinatura imediatamente e o acesso
            às áreas de assinante é desativado. Sua conta (login) continua existindo se
            você quiser — mas, para guardar ou apagar os dados, vale a{' '}
            <a href="/privacidade">Política de Privacidade</a>.
          </p>
          <p>
            <strong>Importante:</strong> o direito não se perde por você já ter usado o
            serviço durante os 7 dias. A devolução é de 100% do valor pago.
          </p>
        </section>

        <section className="legal-secao">
          <h2><span className="legal-num">5</span>Cancelamento após os 7 dias</h2>
          <p>
            Depois do período de arrependimento, o <strong>cancelamento</strong> cessa
            as cobranças futuras a partir do fim do ciclo já pago — não há reembolso
            proporcional do mês em curso, pois o serviço segue disponível até a data
            da próxima renovação. O cancelamento pode ser pedido pelos mesmos canais
            do § 2.
          </p>
        </section>
      </article>

      <footer className="legal-pe">
        <p>Admitly · contato: <a href="mailto:admitly.suporte@gmail.com">admitly.suporte@gmail.com</a></p>
        <nav>
          <a href="/termos">Termos de Serviço</a> · <a href="/privacidade">Política de Privacidade</a>
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

.legal-caixa{
  margin-top:26px; padding:18px 20px; background:var(--papel);
  border-left:3px solid var(--dourado); border-radius:4px;
  font:400 14.5px/1.65 var(--corpo); color:var(--tinta);
}

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

.legal-tabela{
  width:100%; margin-top:14px; border-collapse:collapse; font:400 13px/1.55 var(--corpo);
}
.legal-tabela th{
  font:600 10px/1.3 var(--sans); text-transform:uppercase; letter-spacing:.1em;
  color:var(--tinta-sec); text-align:left; padding:6px 10px; border-bottom:2px solid var(--tinta-sec);
}
.legal-tabela td{ padding:10px; border-bottom:1px solid var(--hairline); vertical-align:top; }
.legal-tabela tr td:first-child{ font-weight:700; }

.legal-pe{ max-width:760px; margin:0 auto; padding:0 20px 44px; color:var(--tinta-sec);
  font:400 13px/1.7 var(--corpo); }
.legal-pe nav{ margin-top:6px; font:600 12px/1 var(--sans); letter-spacing:.04em; }
.legal-pe a{ color:var(--tinta-sec); text-decoration:underline; text-underline-offset:2px; }

@media (max-width:560px){
  .legal-carta{ padding:28px 22px; margin:14px 12px 24px; }
  .legal-tabela{ font-size:11.5px; }
}
`
