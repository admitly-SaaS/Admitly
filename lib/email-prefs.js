// lib/email-prefs.js
//
// Preferências de e-mail (migration email_prefs): pausar o digest semanal
// e/ou os alertas de prazo. Rodapé dos e-mails já promete "preferências no
// seu perfil" — daqui sai tanto o toggle da aba Perfil quanto a decisão do
// cron automático (que lê pelo client de service role).
//
// Regra da decisão (pura e testada): PAUSA é exceção, não regra. Linha
// ausente, preferência quebrada (mais campos), valor estranho ou tabela ainda
// sem migration: NÃO pausa — o fluxo atual de envio se mantém até o aluno
// criar a preferência. Nunca silenciamos e-mail por desencontro de schema.
//
// OnConflict do upsert: 'user_id' (pk da tabela).

export const JOBS_PAUSAVEIS = ['digest', 'alerta', 'onboarding']

/** Texto do rodapé deve casar: "use as preferências no seu perfil". Mute é toggável lá. */
export function devePausar(prefs, job) {
  if (prefs == null || typeof prefs !== 'object') return false
  if (job === 'digest') return prefs.pausar_digest === true
  if (job === 'alerta') return prefs.pausar_alerta === true
  if (job === 'onboarding') return prefs.pausar_onboarding === true
  return false // job desconhecido não pausa (superfalho silencioso seria pior)
}

const criacao = { pausar_digest: false, pausar_alerta: false, pausar_onboarding: false }

/** Defaults: sem linha, tudo ligado (os toggles da tela mostram "ligado"). */
export function prefsPadrao() {
  return { ...criacao }
}

/** Pra tela: linha do banco ou defaults — nunca undefined espalhando estado. */
export function normalizarPrefs(linha) {
  return {
    pausar_digest: linha?.pausar_digest === true,
    pausar_alerta: linha?.pausar_alerta === true,
    pausar_onboarding: linha?.pausar_onboarding === true,
  }
}

// PGRST205 = tabela ausente no schema cache (migration não aplicada). Nesse
// estado o aluno não pode configurar nem o cron deve trancar nada de sabido:
// leitura/gravação degradam com o motivo claro.
const erroTabelaAusente = (error) =>
  error?.code === 'PGRST205' || /schema cache|Could not find the table/i.test(error?.message || '')

export async function lerPrefs(supabaseClient, userId) {
  if (!supabaseClient || !userId) return { prefs: null, error: { code: 'SEM_USUARIO' } }
  const { data, error } = await supabaseClient.from('email_prefs').select('*').eq('user_id', userId).maybeSingle()
  if (error) {
    return erroTabelaAusente(error)
      ? { prefs: null, error: { code: 'TABELA_AUSENTE', message: error.message } }
      : { prefs: null, error }
  }
  return { prefs: normalizarPrefs(data), error: null }
}

/**
 * Salva UM toggle: upsert por user_id. Falha de gravação volta com error —
 * a tela desmarca o toggle (o estado otimista se desfaz) e avisa.
 */
export async function gravarPrefs(userId, { pausar_digest = false, pausar_alerta = false, pausar_onboarding = false } = {}, supabaseClient) {
  if (!supabaseClient || !userId) return { error: { code: 'SEM_USUARIO' } }
  const corpo = {
    user_id: userId,
    pausar_digest: pausar_digest === true,
    pausar_alerta: pausar_alerta === true,
    pausar_onboarding: pausar_onboarding === true,
    atualizado_em: new Date().toISOString(),
  }
  const { error } = await supabaseClient.from('email_prefs').upsert(corpo, { onConflict: 'user_id' })
  if (error) {
    return erroTabelaAusente(error)
      ? { error: { code: 'TABELA_AUSENTE', message: error.message } }
      : { error }
  }
  return { error: null }
}
