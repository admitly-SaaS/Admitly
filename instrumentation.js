// instrumentation.js
//
// O envio AUTOMÁTICO dos e-mails (digest semanal + alerta de prazo) sem
// depender de cron externo: o register() do Next roda UMA VEZ por instância
// do servidor, e daqui nasce um tick devem 60s que pergunta a lib/cron-auto.js
// se este é o intervalo-alvo de cada job (segunda 9h BRT para o digest, slot
// da 8h BRT diário para o alerta) e não foi atendido — e, se for, executa o
// loop de lib/cron-executar.js e grava a rodada em cron_runs.
//
// Por que registro no banco: instância nova a cada deploy não manda nack —
// sem a linha em cron_runs, a próxima instância reenviaria o e-mail da janela.
//
// Alertas operacionais: se a leitura de cron_runs falhar, a rodada terminar
// com erro estrutural/falhas de envio, ou o job travar (10+ ticks tentando e
// não saindo), o dono recebe e-mail (lib/alerta-ops.js) — com o mesmo throttle
// anti-inundação dos alertas do webhook. Todo alerta é aguardado dentro do
// tick: uma enchente seria o pior caso, o normal é 1 e-mail por ocorrência.
// Silêncio por desenho: nada é enviado fora dos intervalos-alvo, e usuário
// sem conteúdo é suprimido dentro deles (decidirDigest/alertasDePrazo).

import { avisarFalha } from './lib/alerta-ops.js'

const TICK_MS = 60 * 1000
// Ticks consecutivos “o job devia rodar e não sai” antes de declarar trava.
// 10 ticks ≈ 10 min: envios longos com reenvio (lib/email.js) não falam nada;
// travado de verdade continua travado, e avisa mais uma vez a cada 30 min.
const TICKS_TRAVADO = 10

export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[cron] desativado: RESEND_API_KEY ou SERVICE_ROLE ausente')
    return
  }
  if (process.env.CRON_AUTO === '0') {
    console.log('[cron] desativado: CRON_AUTO=0')
    return
  }

  console.log('[cron] agendador interno ativo (tick 60s)')

  // Ticks consecutivos em que o job devia rodar e não concluiu (throw no
  // executar). Zera quando a rodada sai — com erro estrutural conta 0 também,
  // porque esse caso avisa por outra chave.
  const travados = { digest: 0, alerta: 0 }

  const avisoDetalhes = (resumo) =>
    (resumo?.detalhes || [])
      .filter((d) => d.resultado === 'falha')
      .slice(0, 8)
      .map((d) => ({ rotulo: 'CLIENTE', titulo: d.email || '(sem e-mail)', nota: d.erro || 'falha' }))

  const tick = async () => {
    try {
      const agora = Date.now()
      // Import dentro do tick: conta com .env completo e não bloqueia o boot.
      const { JOBS, deveRodarAgora, ultimaRodada, registrarRodada } = await import('./lib/cron-auto.js')
      const { executarDigest, executarAlerta } = await import('./lib/cron-executar.js')
      const { createClient } = await import('@supabase/supabase-js')

      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

      // Digest semanal: segunda 9h BRT.
      const leituraDigest = await ultimaRodada(admin, JOBS.digest)
      if (leituraDigest.erro) {
        console.warn('[cron] digest bloqueado: falha ao ler cron_runs (tabela aplicada no painel?):', leituraDigest.erro.message)
        await avisarFalha('cron-ler-digest', {
          assunto: 'Digest semanal: leitura de cron_runs falhou',
          resumo: 'O agendador não consegue ler a tabela cron_runs — o digest da janela fica bloqueado (ninguém recebe o e-mail desta segunda).',
          detalhes: [{ rotulo: 'Erro', titulo: leituraDigest.erro.message || String(leituraDigest.erro) }],
        })
      } else if (deveRodarAgora(JOBS.digest, agora, leituraDigest.valor)) {
        try {
          const { erroEstrutural, resumo } = await executarDigest()
          travados.digest = 0
          await registrarRodada(admin, JOBS.digest, { erroEstrutural, resumo: resumo ? { enviados: resumo.enviados, suprimidos: resumo.suprimidos, falhas: resumo.falhas } : null })
          console.log('[cron] digest', erroEstrutural || resumo)
          if (erroEstrutural || (resumo && resumo.falhas > 0)) {
            await avisarFalha('cron-rodada-digest', {
              assunto: `Digest semanal com falha — ${erroEstrutural || `${resumo.falhas} de ${resumo.enviados + resumo.falhas} envios falharam`}`,
              resumo: erroEstrutural
                ? 'A rodada do digest não conseguiu nem listar/coletar alunos. Quem estava na janela NÃO recebeu o e-mail desta segunda.'
                : 'A rodada do digest rodou, mas alguns envios falharam mesmo com reenvio. Os alunos faltantes não receberam.',
              detalhes: erroEstrutural ? [{ rotulo: 'Erro', titulo: erroEstrutural }] : avisoDetalhes(resumo),
            })
          }
        } catch (erroDigest) {
          travados.digest += 1
          console.error(`[cron] digest lançou (${travados.digest} ticks sem concluir):`, erroDigest)
          if (travados.digest >= TICKS_TRAVADO) {
            travados.digest = 0
            await avisarFalha('cron-travado-digest', {
              assunto: 'Digest semanal travando a janela',
              resumo: `Há ${TICKS_TRAVADO} ticks o digest devia rodar e lança exceção. O e-mail da janela NÃO foi a ninguém; a próxima rodada registra no banco, mas continue travado até a causa mudar.`,
              detalhes: [{ rotulo: 'Erro', titulo: String(erroDigest?.message || erroDigest) }],
            })
          }
        }
      } else {
        travados.digest = 0
      }

      // Alerta de prazo: diário 8h BRT.
      const leituraAlerta = await ultimaRodada(admin, JOBS.alerta)
      if (leituraAlerta.erro) {
        console.warn('[cron] alerta bloqueado: falha ao ler cron_runs (tabela aplicada no painel?):', leituraAlerta.erro.message)
        await avisarFalha('cron-ler-alerta', {
          assunto: 'Alerta de prazo: leitura de cron_runs falhou',
          resumo: 'O agendador não consegue ler a tabela cron_runs — o alerta diário fica bloqueado (D-7/D-2 não saem).',
          detalhes: [{ rotulo: 'Erro', titulo: leituraAlerta.erro.message || String(leituraAlerta.erro) }],
        })
      } else if (deveRodarAgora(JOBS.alerta, agora, leituraAlerta.valor)) {
        try {
          const { erroEstrutural, resumo } = await executarAlerta()
          travados.alerta = 0
          await registrarRodada(admin, JOBS.alerta, { erroEstrutural, resumo: resumo ? { enviados: resumo.enviados, semAlertas: resumo.semAlertas, falhas: resumo.falhas } : null })
          console.log('[cron] alerta', erroEstrutural || resumo)
          if (erroEstrutural || (resumo && resumo.falhas > 0)) {
            await avisarFalha('cron-rodada-alerta', {
              assunto: `Alerta de prazo com falha — ${erroEstrutural || `${resumo.falhas} envio(s) falharam`}`,
              resumo: erroEstrutural
                ? 'A rodada do alerta não conseguiu nem listar/coletar alunos. O D-7/D-2 do dia NÃO saiu para quem estava agendado.'
                : 'A rodada do alerta rodou, mas alguns envios falharam mesmo com reenvio. Esses alunos não receberam o aviso do prazo.',
              detalhes: erroEstrutural ? [{ rotulo: 'Erro', titulo: erroEstrutural }] : avisoDetalhes(resumo),
            })
          }
        } catch (erroAlerta) {
          travados.alerta += 1
          console.error(`[cron] alerta lançou (${travados.alerta} ticks sem concluir):`, erroAlerta)
          if (travados.alerta >= TICKS_TRAVADO) {
            travados.alerta = 0
            await avisarFalha('cron-travado-alerta', {
              assunto: 'Alerta de prazo travando a janela',
              resumo: `Há ${TICKS_TRAVADO} ticks o alerta devia rodar e lança exceção. O aviso de prazo do dia NÃO foi a ninguém.`,
              detalhes: [{ rotulo: 'Erro', titulo: String(erroAlerta?.message || erroAlerta) }],
            })
          }
        }
      } else {
        travados.alerta = 0
      }
    } catch (erro) {
      console.error('[cron] tick falhou:', erro)
    }
  }

  // Primeiro tick após 30s (deixa o servidor assentar), depois a cada 60s.
  const timerInicial = setTimeout(() => {
    tick()
    setInterval(tick, TICK_MS)
  }, 30 * 1000)
  timerInicial.unref?.()
}
