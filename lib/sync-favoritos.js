// lib/sync-favoritos.js
//
// CommonJS por contrato (como matching.js/radar.js): os testes carregam com
// createRequire e o client importa os exports nomeados via interop.
//
// Sincroniza favoritos entre abas/abas-dispositivo via Supabase Realtime
// (postgres_changes). A página /oportunidades continua sendo a fonte de
// verdade no primeiro render — o canal só injeta o que mudou DEPOIS que a
// aba abriu, dedupe garantido porque o Set da página já é idempotente.
//
// Design importante:
//  - Um único canal global por aba (`favoritos:<userId>`), inscrito em
//    INSERT e DELETE da tabela favorites com filtro RLS do próprio usuário.
//    O payload traz opportunity_id em new (INSERT) ou old (DELETE).
//  - O subscription devolve um desinscrever() idempotente para o cleanup do
//    React — removeo canal da memória (removeChannel), não só o listener.
//  - Sem Realtime disponível (hosting offline, rede do aluno) a aba funciona
//    como antes: nada de polling novo, nada de erro visível.

function tratarEvento(payload) {
  const tipo = payload?.eventType;
  if (tipo === 'INSERT') return { opportunityId: payload.new?.opportunity_id, salvo: true };
  if (tipo === 'DELETE') {
    const id = payload.old?.opportunity_id;
    // old OU new cobre deletes por RLS borrados (algumas versões só povoam old).
    return { opportunityId: id ?? payload.new?.opportunity_id, salvo: false };
  }
  if (tipo === 'UPDATE') {
    // favorites não tem colunas mutáveis hoje — UPDATE não anuncia nada útil;
    // tratamos como INSERT para segurança (idempotente no Set da página).
    return { opportunityId: payload.new?.opportunity_id, salvo: true };
  }
  return null;
}

/**
 * Inscreve um canal Realtime para os favoritos de um usuário.
 *
 * @param {object} supabaseClient  cliente já autenticado (com sessão válida)
 * @param {string} userId
 * @param {(opportunityId: string, salvo: boolean) => void} aoMudar
 * @returns {() => void} função desinscrever (idempotente)
 */
export function sincronizarFavoritos(supabaseClient, userId, aoMudar) {
  if (!supabaseClient || !userId || typeof aoMudar !== 'function') {
    return () => {};
  }

  const canal = supabaseClient
    .channel(`favoritos:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'favorites', filter: `user_id=eq.${userId}` },
      (payload) => {
        const evento = tratarEvento(payload);
        if (evento?.opportunityId != null) aoMudar(String(evento.opportunityId), evento.salvo);
      }
    )
    .subscribe(() => {
      // estados possíveis: SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED
      // todos são aceitos em silêncio — a sincronização é um aperfeiçoamento,
      // não uma dependência.
    });

  let encerrado = false;
  return () => {
    if (encerrado) return;
    encerrado = true;
    try {
      supabaseClient.removeChannel(canal);
    } catch {
      // client já saído/desmontado: nada a fazer
    }
  };
}

// Export para testes: mesma função usada inside do handler do canal.
export const _tratarEvento = tratarEvento;
