// lib/subscriptions.js
//
// Regra única de "o aluno tem assinatura ativa?": existe AO MENOS UMA linha
// ativa — nunca "existe exatamente uma".
//
// O guard antigo usava .maybeSingle(), que devolve erro quando o aluno tem duas
// linhas. E duas linhas acontecem de verdade: o webhook do checkout fazia
// upsert sem chave de conflito e o banco não tem constraint única em user_id,
// então cada novo pagamento/renovação inseria uma linha nova. Resultado: o app
// lia o erro como "sem assinatura" e trancava quem havia pagado.
//
// Aqui a leitura é limitada a uma linha e o retorno é booleano: duplicata no
// banco não tira o acesso de ninguém.

export async function temAssinaturaAtiva(supabaseClient, userId) {
  if (!supabaseClient || !userId) return false

  const { data, error } = await supabaseClient
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)

  if (error) {
    // Falha de leitura não vira acusação: fica registrada e o acesso é negado
    // como antes (o comportamento seguro continua sendo não liberar sem conferir).
    console.warn('temAssinaturaAtiva: falha ao consultar assinatura', error)
    return false
  }

  return Array.isArray(data) && data.length > 0
}
