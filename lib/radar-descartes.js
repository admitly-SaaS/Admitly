// lib/radar-descartes.js
//
// CommonJS por contrato, como matching.js e radar.js.
//
// O que o aluno rejeita no Radar ("Não faz sentido" e "Já fiz") é sinal de
// qualidade para o matching: descartes não são escondidos do catálogo por
// padrão (o aluno pode mudar de ideia e o boletim é dele), mas são EXPOSTOS
// como `descarte` no objeto da oportunidade para:
//
//   1. a página de oportunidades poder alimentar o matching (future peso);
//   2. abas de estatística/analytics decidirem o que pautar;
//   3. o /chat do mentor citar com precisão "você rejeitou este daqui antes".
//
// Toda interação degrada em silêncio: se a tabela não for encontrada (404 do
// schema, migration pendente ou RLS apertada demais), o Radar continua
// funcionando exatamente como antes — descartes morrem em memória e não
// bloqueiam o aluno. O código nunca inventa dados de matching a partir de
// storage quebrado.

export const TABELA = 'radar_descartes';

/**
 * Grava (ou atualiza) a reação de 1 toque do aluno para uma oportunidade.
 * Tipos válidos: 'descartado' ("Não faz sentido") e 'feito' ("Já fiz").
 *
 * @param {string} userId
 * @param {string|number} opportunityId
 * @param {'descartado'|'feito'} tipo
 * @param {object} supabaseClient  cliente do Supabase já autenticado (anon + sessão)
 * @returns {Promise<{error: object|null}>}
 *   error.code === 'TABELA_AUSENTE' quando a migration ainda não rodou
 *   (nenhum dado foi persistido, mas a operação do usuário não falha).
 */
export async function gravarDescarte(userId, opportunityId, tipo, supabaseClient) {
  if (!userId || opportunityId == null) return { error: { message: 'usuário ou oportunidade ausentes' } };
  if (tipo !== 'descartado' && tipo !== 'feito') return { error: { message: `tipo inválido: ${tipo}` } };

  const { error } = await supabaseClient
    .from(TABELA)
    .upsert(
      {
        user_id: userId,
        opportunity_id: opportunityId,
        reacao: tipo,
        // ON CONFLICT (user_id, opportunity_id) atualiza a reação e o momento
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'user_id,opportunity_id' }
    );

  if (error) {
    // 404 do PostgREST = tabela não existe (migration pendente)
    const tabelaAusente = error.code === 'PGRST205' || /schema cache|Could not find the table/.test(error.message || '');
    if (tabelaAusente) return { error: { code: 'TABELA_AUSENTE', message: error.message } };
    return { error };
  }
  return { error: null };
}

/**
 * Lê todos os descartes do aluno em um intervalo por mapa de id → reação.
 *
 * @param {string} userId
 * @param {object} supabaseClient
 * @returns {Promise<{descartes: Map<string, 'descartado'|'feito'>, error: object|null}>}
 *   Map vazio quando a tabela não existe — nunca lança.
 */
export async function listarDescartes(userId, supabaseClient) {
  const descartes = new Map();
  if (!userId) return { descartes, error: null };

  const { data, error } = await supabaseClient
    .from(TABELA)
    .select('opportunity_id, reacao')
    .eq('user_id', userId);

  if (error) {
    const tabelaAusente = error.code === 'PGRST205' || /schema cache|Could not find the table/.test(error.message || '');
    if (tabelaAusente) return { descartes, error: { code: 'TABELA_AUSENTE', message: error.message } };
    return { descartes, error };
  }

  (data || []).forEach((row) => {
    if (row?.opportunity_id != null && (row.reacao === 'descartado' || row.reacao === 'feito')) {
      descartes.set(String(row.opportunity_id), row.reacao);
    }
  });
  return { descartes, error: null };
}
