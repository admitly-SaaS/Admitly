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
// Silêncio por desenho: nada é enviado fora dos intervalos-alvo, e usuário
// sem conteúdo é suprimido dentro deles (decidirDigest/alertasDePrazo).

const TICK_MS = 60 * 1000

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
      } else if (deveRodarAgora(JOBS.digest, agora, leituraDigest.valor)) {
        const { erroEstrutural, resumo } = await executarDigest()
        await registrarRodada(admin, JOBS.digest, { erroEstrutural, resumo: resumo ? { enviados: resumo.enviados, suprimidos: resumo.suprimidos, falhas: resumo.falhas } : null })
        console.log('[cron] digest', erroEstrutural || resumo)
      }

      // Alerta de prazo: diário 8h BRT.
      const leituraAlerta = await ultimaRodada(admin, JOBS.alerta)
      if (leituraAlerta.erro) {
        console.warn('[cron] alerta bloqueado: falha ao ler cron_runs (tabela aplicada no painel?):', leituraAlerta.erro.message)
      } else if (deveRodarAgora(JOBS.alerta, agora, leituraAlerta.valor)) {
        const { erroEstrutural, resumo } = await executarAlerta()
        await registrarRodada(admin, JOBS.alerta, { erroEstrutural, resumo: resumo ? { enviados: resumo.enviados, semAlertas: resumo.semAlertas, falhas: resumo.falhas } : null })
        console.log('[cron] alerta', erroEstrutural || resumo)
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
