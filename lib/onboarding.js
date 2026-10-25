// lib/onboarding.js
//
// O cérebro da cadência de onboarding. O que mantém o aluno no app não é a
// conta criada — é o perfil preenchido: é o que faz o radar, o chat e o
// digest falarem da VIDA DELE e não de relevância genérica. Esta cadência
// existe para levar o novo cadastro ao perfil em minutos, e resgatar quem
// resfriou antes de o prazo do calendário passar.
//
// Toda a decisão é FUNÇÃO PURA de dados de banco (criado_em, perfil_academico,
// linhas de onboarding_mail, última atividade) + `agora` injetado — testável
// sem banco, sem rede, sem relógio escondido. A idempotência vem do estado
// GRAVADO (tabela onboarding_mail, chave user_id+tipo): linha existe = e-mail
// já saiu em alguma rodada anterior, e o cron não repete por não lembrar.
//
// Regras:
//   bem_vindo        → conta com ≤ 72h e sem envio. Sem "backfill": quem já é
//                      veterano não ganha boas-vindas de aniversário tardio.
//   lembrete_perfil  → conta entre 24h e 14d com perfil AINDA incompleto, UMA
//                      única vez — e NUNCA na mesma rodada do próprio
//                      boas-vindas: exige que o bem-vindo JÁ SAIU (ou que a
//                      conta já está fora da janela dele), para o aluno novo
//                      nunca receber dois e-mails de onboarding no mesmo dia.
//   reativação       → conta com > 14d E (nenhuma atividade OU última atividade
//                      há ≥ 14d), uma única vez. Obriga JÁ ter dado o primeiro
//                      passo? Não: exige apenas que a janela de boas-vindas/
//                      lembrete já passou (a conta é antiga de fato).
//   reativação       → conta com > 14d E (nenhuma atividade OU última atividade
//                      há ≥ 14d), uma única vez. Obriga JÁ ter dado o primeiro
//                      passo? Não: exige apenas que a janela de boas-vindas/
//                      lembrete já passou (a conta é antiga de fato).
//
// PrefS: pausar_onboarding nas preferências silencia os TRÊS (digest e alerta
// continuam com as próprias chaves). A devolve em ORDEM de prioridade.

import { montarEmailBase, urlDoSite } from './email.js'

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA
// Janelas (depois de contar, são dias inteiros — nada de "franja de segunda").
const JANELA_BEM_VINDO = 3 * DIA // conta nascida há até 72h
const INICIO_LEMBRETE = 1 * DIA // D+1
const FIM_LEMBRETE = 14 * DIA // conta de 14d+ NÃO recebe lembrete: por quê?
const INATIVIDADE_MINIMA = 14 * DIA

export const TIPOS = ['bem_vindo', 'lembrete_perfil', 'reativacao']

const idadeMs = (iso, agora) => {
  const t = new Date(iso ?? '').getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Number(agora ?? Date.now()) - t)
}

export function perfilCompleto(meta) {
  if (meta == null || typeof meta !== 'object') return false
  // Os três campos que DIRECIONAM o matching (lib/perfil-academico.js):
  // anoEscolar, areaInteresse e objetivo. Orçamento e país são refinamento —
  // exigir os cinco engessaria lembretes que voltam para aluno quase pronto.
  return Boolean(meta.anoEscolar && meta.areaInteresse && meta.objetivo)
}

/**
 * Quem recebe o quê NESTA rodada. `enviados` = { tipo: isoOrNull } vindo da
 * tabela; `pausado` = prefs.pausar_onboarding. Devolve prioridade: array de
 * TIPOS (pode nascer vazio).
 */
export function decidirOnboarding({ criado_em, perfilAcademico = null, enviados = {}, ultimaAtividade = null, pausado = false, agora = Date.now() } = {}) {
  if (pausado) return []

  const idadeConta = idadeMs(criado_em, agora)
  if (idadeConta == null || criado_em == null) return []

  const out = []
  if (!enviados?.bem_vindo && idadeConta <= JANELA_BEM_VINDO) out.push('bem_vindo')

  // No boas-vindas saiu (ou já não sairá mais): sem ele, conta jovem recebia
  // bem-vindo E lembrete na MESMA rodada — dois e-mails no mesmo dia.
  const bemVindoForaDaRodada = Boolean(enviados?.bem_vindo) || idadeConta > JANELA_BEM_VINDO
  if (
    !enviados?.lembrete_perfil &&
    bemVindoForaDaRodada &&
    idadeConta > INICIO_LEMBRETE &&
    idadeConta <= FIM_LEMBRETE &&
    !perfilCompleto(perfilAcademico)
  ) {
    out.push('lembrete_perfil')
  }
  if (!enviados?.reativacao && idadeConta > INATIVIDADE_MINIMA) {
    const idadeAtiv = idadeMs(ultimaAtividade, agora)
    if (idadeAtiv == null || idadeAtiv >= INATIVIDADE_MINIMA) out.push('reativacao')
  }
  return out
}

// ---- HTML -------------------------------------------------------------------

const link = (caminho) => urlDoSite(caminho)

/**
 * Monta O HTML do tipo pedido. Cada tipo é um e-mail ÚINICO e independente:
 * sem porquê de ter 'delta' nem catálogo — o que o onboarding quer é ATRITO
 * ZERO até a próxima ação.
 */
export function montarOnboardingHtml(tipo, { primeiroNome = null } = {}) {
  const caro = primeiroNome ? `, ${primeiroNome}` : ''

  if (tipo === 'bem_vindo') {
    return montarEmailBase({
      preheader: 'Dois caminhos de cinco minutos hoje, e o resto do app já trabalha por você.',
      cartucho: 'Boas-vindas',
      titulo: `Bem-vindo ao Admitly${caro}`,
      nota: 'Sua conta está aberta. Dois passos de cinco minutos hoje — e daí em diante é o Admitly que trabalha: radar do seu perfil, prazos no digest semanal, mentor com contexto seu.',
      secoes: [
        {
          num: '01',
          titulo: 'Próximos passos',
          itens: [
            {
              rotulo: 'PERFIL',
              titulo: 'Conte quem você é academicamente',
              nota: 'Ano escolar, área de interesse e objetivo. É o que faz cada recomendação saber para quem foi feita.',
              href: link('/perfil'),
            },
            {
              rotulo: 'RADAR',
              titulo: 'O que combina já está no radar',
              nota: 'A aba Oportunidades cruza seu perfil com olimpíadas, programas de verão, bolsas e pesquisa — com prazo, custo e requisitos à vista.',
              href: link('/oportunidades'),
            },
            {
              rotulo: 'CHAT',
              titulo: 'Uma pergunta, um plano',
              nota: '"Programas com prazo em dezembro pra quem tem 16 anos?" — o mentor responde com base no SEU perfil.',
              href: link('/chat'),
            },
          ],
        },
      ],
      rodape: 'Este e-mail é enviado uma única vez, quando a conta nasce (janela de 72h). Preferências de e-mail no perfil.',
    })
  }

  if (tipo === 'lembrete_perfil') {
    return montarEmailBase({
      preheader: 'As recomendações ainda estão cegas. Três campos resolvem.',
      cartucho: 'Sua conta está aberta há um dia',
      titulo: `Falta pouco para o app conhecer você${caro}`,
      nota: 'Sem o perfil acadêmico, o radar e o digest falam de "aluno geral". Três campos de cinco minutos, e todas as oportunidades começam a ser filtradas para VOCÊ.',
      secoes: [
        {
          num: '01',
          titulo: 'Falta só isto',
          itens: [
            {
              rotulo: 'PERFIL',
              titulo: 'Ano escolar · área de interesse · objetivo',
              nota: 'Só esses três. É o sumário na lombada do livro: o resto da navegação fica trivial.',
              href: link('/perfil'),
            },
          ],
        },
      ],
      rodape: 'Lembrete ÚNICO — este e-mail não volta. Preferências no perfil.',
    })
  }

  if (tipo === 'reativacao') {
    return montarEmailBase({
      preheader: 'Faz duas semanas sem você. O calendário de aplicações não espera.',
      cartucho: 'Ainda por aqui?',
      titulo: `Tudo do seu processo, num único lugar${caro}`,
      nota: 'Há duas semanas a conta não registra atividade — e os prazos de aplicação continuam correndo normal. Retomar leva uma pergunta.',
      secoes: [
        {
          num: '01',
          titulo: 'Retome por onde ficou',
          itens: [
            {
              rotulo: 'CHAT',
              titulo: 'Uma pergunta basta',
              nota: '"Quais programas ainda cabem no meu calendário?" — resposta com seus dados de perfil e prazos abertos.',
              href: link('/chat'),
            },
          ],
        },
      ],
      rodape: 'E-mail único de reativação (conta sem atividade há 2+ semanas). Se prefere silêncio total, é um toggle nas preferências do perfil.',
    })
  }

  return null
}
