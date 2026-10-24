// lib/alerta-ops.js
//
// Avisos OPERACIONAIS para o dono do app (não para o aluno): o webhook do
// checkout recusou evento, o cron dos e-mails não consegue concluir a rodada.
// São falhas que só afetam a operação — e que hoje só existem em registro no
// Vercel/Supabase, onde ninguém olha. O alerta chega na caixa do dono.
//
// Antes de qualquer envio passa por um throttle EM MEMÓRIA por chave: ataque
// de tokens errados contra o webhook ou o Supabase fora do ar não pode lotar
// a caixa de entrada. Depois de MINIMO_MS sem repetir a mesma chave, o próximo
// evento dela dispara um e-mail novo.
//
// Para onde envia: variável de ambiente ALERTA_EMAIL (e-mail do dono). Sem
// ela o módulo é inofensivo por desenho: não envia nada, os registros seguem
// nos logs como sempre. Instância nova (deploy/restart) recomeça o relógio do
// throttle — o pior cenário aceitável é 1 e-mail duplicado, não uma enchente.
//
// Chamador NUNCA fica bloqueado na rede: quem envia o e-mail é enviarEmail
// (de lib/email.js), que já corta em 15s e re-tenta — e quem decide se espera
// o resultado é o chamador. O webhook aguarda (a resposta à Kiwify não é
// crítica), o agendador aguarda dentro do tick (60s de folga).

import { enviarEmail, montarEmailBase } from './email.js'

// Intervalo mínimo entre dois alertas da MESMA chave.
export const MINIMO_MS = 30 * 60 * 1000 // 30 minutos

// Estado do throttle por chave (exportado para testes, não para uso normal).
export const _estado = new Map()

/** Destinatário dos avisos: o dono. null = alertar desligado (só logs). */
export function destinoAlerta() {
  return process.env.ALERTA_EMAIL || null
}

/**
 * Dispara um alerta se a chave permitiu. Não lança: devolve
 * { disparado, motivo } — motivo dá conta de "sem destinatário",
 * "throttle" e a falha de envio (o evento real segue nos logs do chamador).
 *
 * deps.enviar injeta o remetente nos testes; produção usa enviarEmail.
 * deps.agora congela o relógio nos testes.
 */
export async function avisarFalha(
  chave,
  { assunto, resumo, detalhes = [] } = {},
  { enviar, agora } = {}
) {
  try {
    const destino = destinoAlerta()
    if (!destino) return { disparado: false, motivo: 'sem ALERTA_EMAIL' }

    const t = agora ?? Date.now()
    const ultimo = _estado.get(chave) || 0
    if (t - ultimo < MINIMO_MS) return { disparado: false, motivo: 'throttle' }

    const enviarFn = enviar || ((p) => enviarEmail(p))
    const { error } = await enviarFn({
      to: destino,
      subject: `ADMITLY OPS — ${assunto || 'falha operacional'}`,
      html: montarEmailBase({
        cartucho: 'Alerta operacional',
        titulo: assunto || 'Falha operacional',
        nota: resumo || '',
        secoes:
          detalhes.length > 0
            ? [
                {
                  num: '01',
                  titulo: 'Detalhes',
                  itens: detalhes
                    .filter(Boolean)
                    .slice(0, 8)
                    .map((d) => ({
                      rotulo: d.rotulo || 'EVENTO',
                      titulo: d.titulo || '',
                      nota: d.nota || '',
                    })),
                },
              ]
            : [],
        rodape: 'Aviso automático da operação Admitly — falhas assim também ficam nos registros do deploy.',
      }),
    })

    if (error) {
      // O envio falhou (Resend fora, rede lenta): libera a chave para o
      // próximo evento tentar de novo — o throttle existe para não inundar,
      // não para engolir o último aviso.
      _estado.delete(chave)
      return { disparado: false, motivo: error.message }
    }

    _estado.set(chave, t)
    return { disparado: true, motivo: null }
  } catch (erro) {
    _estado.delete(chave)
    return { disparado: false, motivo: String(erro) }
  }
}
