// lib/radar.js
//
// CommonJS por contrato, como lib/matching.js e lib/prazos.js: os testes o
// carregam com createRequire e o cliente (page.js) importa os exports via
// interop do Next.
//
// O Radar é a tela de "o que mudou desde a última vez que você abriu" — não
// uma lista nova de oportunidades. Este módulo calcula o diff entre o estado
// atual do catálogo e o snapshot guardado na última visita, e produz dois
// tipos de novidade:
//
//   'novo'        → oportunidade que o usuário ainda não viu
//                    (entrou no catálogo depois da última visita, OU sempre
//                    esteve lá mas nunca apareceu para ele)
//   'prazo'       → oportunidade já vista cujo prazo mudou de data
//                    (adiamento, antecipação — em relação ao que ele viu)
//
// O snapshot (ids vistos + prazo visto por id + timestamp) vive no
// localStorage do navegador — não cria tabela, migração nem endpoint. Se não
// houver snapshot (primeira visita), o Radar não adivinha: fica em silêncio e
// a primeira visita apenas semeia o snapshot. "Sem novidade, sem aviso."

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { diasAte } = require('./prazos.js');

const CHAVE = 'admitly:radar:v1';

// ---- snapshot -------------------------------------------------------------

// Estado visto pelo usuário: { em: ISO, vistos: {id: 'AAAA-MM-DD'} }
// vistos[id] = deadline do prazo como o usuário o viu (null = sem data).
function carregarSnapshot(storage) {
  try {
    const cru = storage?.getItem(CHAVE);
    if (!cru) return null;
    const lido = JSON.parse(cru);
    if (!lido || typeof lido !== 'object' || typeof lido.vistos !== 'object' || lido.vistos === null) {
      return null;
    }
    return { em: typeof lido.em === 'string' ? lido.em : null, vistos: lido.vistos };
  } catch {
    return null;
  }
}

function salvarSnapshot(storage, opps, agora = new Date()) {
  const vistos = {};
  (opps || []).forEach((o) => {
    if (o?.id == null) return;
    vistos[String(o.id)] = o.application_deadline ?? null;
  });
  const snapshot = { em: agora.toISOString(), vistos };
  try {
    storage?.setItem(CHAVE, JSON.stringify(snapshot));
  } catch {
    // localStorage cheio ou bloqueado: o Radar simplesmente não tem memória
    // na próxima visita — degrada para "primeira visita", nunca quebra.
  }
  return snapshot;
}

// ---- diff -----------------------------------------------------------------

// Um prazo "mudou" quando a data vista difere da atual (adiado/antecipado).
function prazoMudou(dataAntes, oppAgora) {
  return String(dataAntes ?? '') !== String(oppAgora?.application_deadline ?? '');
}

/**
 * Calcula o diff do catálogo contra o snapshot.
 *
 * @param {Array}  opps     catálogo atual (já com compatibility calculado quando houver perfil)
 * @param {object|null} snapshot  saída de carregarSnapshot
 * @param {Set}    favoritos   ids favoritados (não são novidade: o usuário já os declarou)
 * @returns {{ itens: Array, primeiraVisita: boolean }}
 *   itens: [{ tipo:'novo'|'prazo', opp, antes? }] — ordenados, prazo-mudado
 *   primeiro (ação imediata), depois novidades; dentro do tipo, urgência.
 */
function calcularRadar(opps, snapshot, favoritos = new Set()) {
  if (!snapshot || !snapshot.vistos) return { itens: [], primeiraVisita: true };

  const itens = [];
  const vistos = snapshot.vistos;

  (opps || []).forEach((op) => {
    if (op?.id == null) return;
    const id = String(op.id);
    const jaViu = Object.prototype.hasOwnProperty.call(vistos, id);
    const favorito = favoritos.has(op.id) || favoritos.has(id);

    if (!jaViu) {
      // Nova para o usuário — salvo se ele já a declarou (favorito não é
      // "novidade", é decisão tomada).
      if (!favorito) itens.push({ tipo: 'novo', opp: op });
      return;
    }

    if (prazoMudou(vistos[id], op) && !favorito) {
      itens.push({ tipo: 'prazo', opp: op, antes: vistos[id] });
    }
  });

  itens.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'prazo' ? -1 : 1;
    // dentro do tipo: urgência primeiro (menos dias até o prazo), depois nome
    const da = diasAte(a.opp?.application_deadline) ?? Number.POSITIVE_INFINITY;
    const db = diasAte(b.opp?.application_deadline) ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return String(a.opp.name || '').localeCompare(String(b.opp.name || ''), 'pt-BR');
  });

  return { itens, primeiraVisita: false };
}

// ---- porquê do matching ----------------------------------------------------

// O "Combina com você" vem do perfil do aluno (compatibility calculado pelo
// lib/matching.js), nunca de uma nota inventada. Extrai de reasons/warnings
// até N frases curtas.
function porquesDoMatching(opp, max = 2) {
  const compat = opp?.compatibility;
  if (!compat) return [];
  const porques = [...(compat.reasons || []), ...(compat.warnings || [])];
  return porques.slice(0, max).map(String).filter((s) => s.trim().length > 0);
}

module.exports = { CHAVE, carregarSnapshot, salvarSnapshot, calcularRadar, porquesDoMatching };
