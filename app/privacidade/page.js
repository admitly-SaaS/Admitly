import Link from 'next/link'

// Política de Privacidade — LGPD (Lei 13.709/2018), art. 9º.
// Página estática (componente de servidor): sem estado, só conteúdo.
// As promessas declaradas aqui refletem o que o código de fato coleta
// (auth/perfil/candidaturas/redações/tarefas/mensagens + Resend + Kiwify + Gemini).
export const metadata = {
  title: 'Admitly — Política de Privacidade',
}

const SEC = ({ num, titulo, children }) => (
  <section className="legal-secao">
    <h2><span className="legal-num">{num}</span>{titulo}</h2>
    {children}
  </section>
)

export default function Privacidade() {
  return (
    <main className="legal-pagina">
      <style>{CSS}</style>
      <header className="legal-topo">
        <Link href="/" className="marca-mini">
          <span>Admitly</span>
        </Link>
        <nav className="legal-nav">
          <a href="/termos">Termos de Serviço</a>
          <a href="/reembolso">Reembolso</a>
        </nav>
      </header>

      <article className="legal-carta">
        <span className="caps-sec">Documento legal · versão 1.0 · 21/10/2026</span>
        <h1>Política de <em>Privacidade</em></h1>
        <p className="legal-sub">
          Como tratamos os seus dados na Admitly — o mentor de admissões para estudantes
          brasileiros. Escrita em linguagem simples, sem abrir mão das exigências da
          LGPD (Lei nº 13.709/2018).
        </p>

        <div className="legal-caixa">
          <strong>Resumo em uma frase:</strong> guardamos apenas o que é necessário para
          montar o seu plano de candidaturas e operar a sua conta; o texto das suas
          mensagens e redações é analisado por IA (Google Gemini) para gerar as respostas
          do mentor; e-mail e pagamento trilham por fornecedores especializados
          (Resend e Kiwify). Você pode pedir acesso, correção, portabilidade ou exclusão
          de tudo pelo canal abaixo — respondemos sem cobrar nada por isso.
        </div>

        <SEC num="1" titulo="Quem somos (o controlador)">
          <p>
            <strong>Responsável pelos seus dados (controlador):</strong> Admitly —{' '}
            <span className="legal-agenda">[completar razão social e CNPJ antes de publicar]</span>.
          </p>
          <p>
            <strong>Contato do controlador e do encarregado de dados:</strong>{' '}
            <a href="mailto:admitly.suporte@gmail.com">admitly.suporte@gmail.com</a> — é
            também o canal para exercer os seus direitos (art. 18) e tratar de privacidade.
          </p>
        </SEC>

        <SEC num="2" titulo="Quais dados tratamos, para que, com qual base legal e por quanto tempo">
          <table className="legal-tabela">
            <thead>
              <tr>
                <th>Dados</th><th>Para que servem</th><th>Base legal (LGPD)</th><th>Quanto tempo ficam</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>E-mail e credenciais de acesso</td>
                <td>Criar e proteger a sua conta; autenticar você em cada acesso</td>
                <td>Execução do contrato (art. 7º, V) — o serviço é inseparável de ter uma conta</td>
                <td>Enquanto a conta existir</td>
              </tr>
              <tr>
                <td>Perfil acadêmico (objetivo, idade, ano escolar, área, país, orçamento, notas, inglês, extracurriculares)</td>
                <td>Calcular as oportunidades compatíveis para você e dar contexto ao mentor no chat</td>
                <td>Execução do contrato (art. 7º, V)</td>
                <td>Enquanto a conta existir</td>
              </tr>
              <tr>
                <td>Candidaturas, redações, tarefas e conversas com o mentor</td>
                <td>Fornecer o serviço que você pediu (sua área de trabalho no app)</td>
                <td>Execução do contrato (art. 7º, V)</td>
                <td>Enquanto a conta existir</td>
              </tr>
              <tr>
                <td>Data e hora do aceite dos Termos e desta política</td>
                <td>Comprovar o consentimento e a contratação</td>
                <td>Legítimo interesse (art. 7º, IX) — registro para fins de defesa jurídica</td>
                <td>5 anos (prazo de prescrição consumerista)</td>
              </tr>
              <tr>
                <td>Preferências de e-mail (resumo semanal / alerta de prazo)</td>
                <td>Enviar (ou não enviar) as mensagens que você escolheu receber</td>
                <td>Resumo semanal: consentimento (art. 7º, I) · Alerta de prazo solicitado por você: execução do contrato (art. 7º, V)</td>
                <td>Até você desligar cada um; a pausa é gravada e vale para as próximas rodadas</td>
              </tr>
              <tr>
                <td>Dados de pagamento</td>
                <td>Cobrar a assinatura</td>
                <td>Execução do contrato (art. 7º, V)</td>
                <td>Processados pela Kiwify; o nosso sistema recebe apenas o status da assinatura (ativa ou não)</td>
              </tr>
            </tbody>
          </table>
          <p className="legal-nota">
            O perfil acadêmico não é “dado sensível” pela LGPD em si — mas não escreva em
            campo livre informações de saúde, religião ou outra informação sensível:
            não precisamos delas para nada.
          </p>
        </SEC>

        <SEC num="3" titulo="Com quem os seus dados são compartilhados">
          <table className="legal-tabela">
            <thead>
              <tr><th>Fornecedor</th><th>Papel</th><th>O que recebe</th><th>Onde fica</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Supabase (banco e autenticação)</td>
                <td>Operador — guarda e protege os dados do app</td>
                <td>Conta, perfil, candidaturas, redações, conversas, preferências</td>
                <td>Região do projeto; suporte técnico do fornecedor pode acessar a partir de outros países</td>
              </tr>
              <tr>
                <td>Google (Gemini API)</td>
                <td>Operador — motor de resposta do mentor e da análise de redações</td>
                <td>O texto das suas mensagens e redações; o perfil entra apenas como contexto de tom — sem e-mail nem nome</td>
                <td>Estados Unidos (transferência internacional — ver § 4)</td>
              </tr>
              <tr>
                <td>Resend</td>
                <td>Operador — entrega dos e-mails do Admitly</td>
                <td>Seu e-mail e o conteúdo do e-mail enviado (resumo/alerta)</td>
                <td>Estados Unidos (transferência internacional)</td>
              </tr>
              <tr>
                <td>Kiwify</td>
                <td>Plataforma de pagamento (checkout)</td>
                <td>Os dados de pagamento que você digita no checkout deles; nós recebemos só o resultado</td>
                <td>Processado pela Kiwify — ver a política deles</td>
              </tr>
            </tbody>
          </table>
          <p><strong>Nunca vendemos os seus dados</strong> e não os usamos para publicidade.</p>
        </SEC>

        <SEC num="4" titulo="Transferência internacional de dados">
          <p>
            O Gemini e os e-mails são processados nos Estados Unidos. A transferência
            acontece amparada nos requisitos do art. 33 da LGPD — base legal válida e
            cláusulas contratuais com os fornecedores, conforme a Resolução ANPD
            nº 19/2024 — sempre limitada aos dados necessários à função solicitada.
          </p>
        </SEC>

        <SEC num="5" titulo="Estudantes menores de 18 anos (art. 14 da LGPD)">
          <p>A Admitly é feita para estudantes do 8º ano em diante — muita gente ainda menor de idade. Por isso:</p>
          <ul>
            <li><strong>Menos de 16 anos:</strong> a conta deve ser criada pelo responsável
            legal (pai, mãe ou responsável), porque apenas ele pode contratar em nome do
            estudante.</li>
            <li><strong>De 16 a 17 anos:</strong> o estudante pode criar a própria conta,
            mas pedimos que um responsável saiba e concorde com a assinatura — a
            autorização garante a validade do contrato (Código Civil, arts. 3º a 5º).</li>
            <li><strong>Dados mínimos:</strong> não pedimos documento, endereço, CPF ou
            escola; para calcular compatibilidade basta objetivo, ano escolar, área, país
            e orçamento (art. 14, § 4º).</li>
            <li><strong>Responsáveis:</strong> podem pedir acesso aos dados do estudante e a
            exclusão da conta pelo canal de contato, a qualquer momento, informando a
            conta do estudante.</li>
          </ul>
        </SEC>

        <SEC num="6" titulo="Cookies">
          <p>
            Usamos <strong>apenas cookies essenciais</strong>: o de sessão que mantém você
            logado e um pequeno armazenamento local de preferências (como “já viu o
            onboarding” e o estado do radar). Não usamos cookies de publicidade nem de
            rastreamento de terceiros. Por serem estritamente necessários ao serviço que
            você pediu, não há banner de escolha — e nada além do essencial roda sem o
            seu pedido expresso.
          </p>
        </SEC>

        <SEC num="7" titulo="Os seus direitos (art. 18 da LGPD)">
          <p>A qualquer momento, de graça, pelo canal <a href="mailto:admitly.suporte@gmail.com">admitly.suporte@gmail.com</a>, você pode:</p>
          <ul>
            <li>confirmar que existe tratamento dos seus dados e saber quais são;</li>
            <li>pedir <strong>acesso</strong> a eles;</li>
            <li>corrigir dados incompletos, inexatos ou desatualizados;</li>
            <li>pedir <strong>anonimização, bloqueio ou exclusão</strong> de dados desnecessários ou tratados em desacordo com a lei — inclusive a conta inteira;</li>
            <li>pedir a <strong>portabilidade</strong> dos dados (entregamos em formato legível por máquina);</li>
            <li><strong>revogar o consentimento</strong> — por exemplo, desligar o resumo semanal em um clique na aba Perfil;</li>
            <li>saber com quem os dados foram compartilhados.</li>
          </ul>
          <p>
            Respondemos em até <strong>15 dias</strong>. Se não ficar satisfeito, você pode
            peticionar diretamente à <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer">ANPD</a>
            {' '}(Autoridade Nacional de Proteção de Dados).
          </p>
        </SEC>

        <SEC num="8" titulo="Exclusão da conta e retenção">
          <p>
            Ao pedir a exclusão, removemos o seu perfil acadêmico, candidaturas,
            redações, mensagens e preferências. Mantemos apenas o mínimo que a lei manda
            guardar (por exemplo, registro da cobrança do período pago) ou que precisemos
            para exercer regularmente nossos direitos em processos judiciais ou
            administrativos — sempre o menos possível e nunca para reativar o perfil sem
            novo pedido seu expresso.
          </p>
        </SEC>

        <SEC num="9" titulo="Segurança">
          <p>
            Acesso por senha forte ou login social com verificação, transporte por HTTPS,
            banco gerido com controle de acesso por usuário — você só consegue ler os
            seus próprios dados. Não guardamos cartão de crédito: o pagamento é
            processado inteiro no checkout da Kiwify.
          </p>
        </SEC>

        <SEC num="10" titulo="Mudanças nesta política">
          <p>
            Mudanças relevantes serão avisadas por e-mail com antecedência de 15 dias e
            a versão no topo desta página é atualizada. Alteração de finalidade que
            dependa de consentimento (art. 9º, § 2º) só vale com o seu novo
            consentimento.
          </p>
        </SEC>
      </article>

      <footer className="legal-pe">
        <p>Admitly · contato: <a href="mailto:admitly.suporte@gmail.com">admitly.suporte@gmail.com</a></p>
        <nav>
          <a href="/termos">Termos de Serviço</a> · <a href="/reembolso">Política de Reembolso</a>
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
.legal-nota{ color:var(--tinta-sec) !important; font-size:13.5px !important; }
.legal-agenda{ color:var(--vermelho); font-family:var(--mono); font-size:12px; }

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
  .legal-tabela th{ padding:6px; }
  .legal-tabela td{ padding:8px 6px; }
}
`
