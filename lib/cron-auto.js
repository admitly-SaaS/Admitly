// lib/cron-auto.js
//
// O cérebro do envio automático: decide se um job deve rodar AGORA com base
// na última execução registrada no banco (tabela cron_runs), no fuso de São
// Paulo — anchors:
//
//   digest_semanal → segundas-feiras, no intervalo da 9h BRT
//   alerta_prazo   → todos os dias, no intervalo da 8h BRT
//
// "No intervalo" importa: o agendador ticka a cada minuto, e a execução de
// um intervalo de 60 min é idempotente — se a última rodada do job caiu no
// MESMO intervalo-alvo, refazer seria enviar em dobro; se caiu antes, rodou
// depois do alvo ou nunca rodou, é hora de rodar.
//
// Estrutura testada: toda a DECISÃO é função pura; a LEITURA/GRAVAÇÃO do
// registro fica isolada embaixo (adminClient = service role).

const FUSO_MS = 3 * 60 * 60 * 1000 // UTC-3 (Brasil, sem horário de verão)

export const JOBS = { digest: 'digest_semanal', alerta: 'alerta_prazo' }

/** Fecha o intervalo-alvo do job que contém (ou precede) `agora`. */
export function intervaloAlvo(job, agora) {
  const t = Number(agora) - FUSO_MS // relógio de parede BRT (BRT = UTC-3)
  const minuto = Math.floor(t / 60000)

  if (job === JOBS.digest) {
    // Segunda-feira 9h BRT: dias desde epoch em BRT; 9h = 540 min do dia.
    // Epoch (1970-01-01) foi quinta → diaSemana com seg=segunda é (d+3)%7.
    const diasDesdeEpoch = Math.floor(minuto / 1440)
    const diaSemana = (diasDesdeEpoch + 3) % 7 // seg=0 … dom=6
    const inicioSegunda = (diasDesdeEpoch - diaSemana) * 1440 + 540
    return { job, inicioArred: inicioSegunda, intervaloMin: 60 }
  }

  // Diário às 8h BRT (480 min do dia): o intervalo-alvo é o slot que começa
  // no 8h do "dia de hoje em BRT" — ticks fora dele não são o alvo.
  const diasDesdeEpoch = Math.floor(minuto / 1440)
  const inicioDia = diasDesdeEpoch * 1440 + 480
  return { job, inicioArred: inicioDia, intervaloMin: 60 }
}

/**
 * Deve rodar agora? `ultimaRodadaAt` (ISO string | null) é a última execução
 * REGISTRADA. Regra: este intervalo-alvo já foi atendido se a última rodada
 * aconteceu NA ABERTURA do slot ou depois — ninguém roda para um slot que
 * ainda não chegou, então qualquer registro posterior à abertura é a execução
 * DESTE slot (catch-up inclusive). Roda se a última rodada é ANTERIOR ao slot
 * (ou nunca rodou).
 */
export function deveRodarAgora(job, agora, ultimaRodadaAt) {
  const alvo = intervaloAlvo(job, agora)
  if (ultimaRodadaAt == null) return true
  const ultima = new Date(ultimaRodadaAt)
  if (Number.isNaN(ultima.getTime())) return true
  const minutosUltima = Math.floor((Number(ultima) - FUSO_MS) / 60000)
  return minutosUltima < alvo.inicioArred
}

// ---- leitura/gravação do registro (service role) ###########################

export async function ultimaRodada(adminClient, job) {
  const { data, error } = await adminClient
    .from('cron_runs')
    .select('ultima_rodada_at')
    .eq('job', job)
    .maybeSingle()
  // Falha de LEITURA (ex.: tabela não aplicada) não pode virar "nunca rodou"
  // — sem registro, cada tick reenviaria. O chamador deve BLOQUEAR o job.
  if (error) return { valor: null, erro: error }
  return { valor: data?.ultima_rodada_at ?? null, erro: null }
}

export async function registrarRodada(adminClient, job, detalhes = null) {
  const { error } = await adminClient
    .from('cron_runs')
    .upsert({ job, ultima_rodada_at: new Date().toISOString(), detalhes }, { onConflict: 'job' })
  return { error: error || null }
}
