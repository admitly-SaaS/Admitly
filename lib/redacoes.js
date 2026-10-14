// lib/redacoes.js
//
// CommonJS por contrato, como matching.js/radar.js/radar-descartes.js: os
// testes carregam com createRequire e o client importa via interop do Next.
//
// Camada de dados da aba /redacoes. Além do CRUD, guarda a LÓGICA DO BANNER
// DE SUGESTÃO: candidaturas vindas do catálogo com requirements de redação
// ("montarDetalhes" grava 'redação' em details.requirements quando
// opportunities.requires_essay) viram sugestões de 1 clique — nunca criação
// automática. "Não me lembre" persiste na candidatura
// (details.redacao_dispensada = true): sobrevive a logout, atualização e
// troca de navegador, sem tabela nova.

export const TABELA = 'essays';
export const TABELA_VERSOES = 'essay_versions';

export const STATUS = ['ideia', 'rascunho', 'revisao', 'final'];

// ---- CRUD ---------------------------------------------------------------

export async function criarEnsaioParaUsuario(userId, dados, supabaseClient) {
  const d = dados || {};
  const linha = {
    user_id: userId,
    title: d.title?.trim() || 'Redação sem título',
    prompt: d.prompt || '',
    body: d.body || '',
    status: STATUS.includes(d.status) ? d.status : 'ideia',
    word_limit: d.word_limit ?? null,
    application_id: d.application_id || null,
  };

  const { data, error } = await supabaseClient.from(TABELA).insert(linha).select('id').single();
  return { error, data };
}

export async function listarEnsaiosParaUsuario(userId, supabaseClient) {
  const { data, error } = await supabaseClient
    .from(TABELA)
    .select('id, application_id, title, prompt, body, status, word_limit, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) return { error, data: null };
  return { error: null, data: data || [] };
}

export async function salvarRascunho(ensaioId, body, supabaseClient) {
  const { error } = await supabaseClient
    .from(TABELA)
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', ensaioId);
  return { error };
}

export async function atualizarEnsaio(ensaioId, campos, supabaseClient) {
  const permitidos = ['title', 'prompt', 'status', 'word_limit', 'application_id'];
  const molde = {};
  for (const k of permitidos) if (k in campos) molde[k] = campos[k];
  if (Object.keys(molde).length === 0) return { error: null };

  if ('status' in molde && !STATUS.includes(molde.status)) {
    return { error: { message: `status inválido: ${molde.status}` } };
  }
  molde.updated_at = new Date().toISOString();

  const { error } = await supabaseClient.from(TABELA).update(molde).eq('id', ensaioId);
  return { error };
}

export async function removerEnsaio(ensaioId, supabaseClient) {
  const { error } = await supabaseClient.from(TABELA).delete().eq('id', ensaioId);
  return { error };
}

// ---- versões ------------------------------------------------------------

export async function salvarVersao(ensaioId, body, supabaseClient) {
  if (!body || !body.trim()) return { error: { message: 'versão vazia não é salva' } };
  const rotulo = `v · ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  const { data, error } = await supabaseClient
    .from(TABELA_VERSOES)
    .insert({ essay_id: ensaioId, label: rotulo, body })
    .select('id, label, body, created_at')
    .single();
  return { error, data };
}

export async function listarVersoes(ensaioId, supabaseClient) {
  const { data, error } = await supabaseClient
    .from(TABELA_VERSOES)
    .select('id, label, body, created_at')
    .eq('essay_id', ensaioId)
    .order('created_at', { ascending: false });
  if (error) return { error, data: null };
  return { error: null, data: data || [] };
}

// ---- banner de sugestão -------------------------------------------------

// A candidatura "pede redação" quando montarDetalhes gravou o requisito.
// Padrão em minusculas, acento optativo (redacao/redação).
const REQUISITO_REDAÇÃO = /reda[çc][ãa]o/i;

export function candidaturaPedeRedacao(aplicacao) {
  const req = aplicacao?.details?.requirements;
  return typeof req === 'string' && REQUISITO_REDAÇÃO.test(req);
}

/**
 * O que o banner mostra: candidaturas que pedem redação e ainda não têm
 * ensaio vinculado — exceto as dispensadas pelo aluno.
 *
 * @param {Array} aplicacoes       candidaturas do aluno (com details)
 * @param {Array} ensaios          redações já criadas
 * @returns {Array} [{ id, university, details }] sem as dispensadas/id já cobertas
 */
export function calcularSugestoes(aplicacoes, ensaios) {
  const vinculados = new Set((ensaios || []).map((e) => e.application_id).filter(Boolean));
  return (aplicacoes || [])
    .filter((ap) => ap?.details && !ap.details.redacao_dispensada)
    .filter((ap) => candidaturaPedeRedacao(ap))
    .filter((ap) => !vinculados.has(ap.id));
}

// ---- segmentação da análise (painel "Peça análise") ----

// Os rótulos são o contrato de saída pedido em /api/redacoes/analise — o
// painel quebra o texto nesses marcadores. Tolerantes a caixa e espaços.
const ROTULOS_ANALISE = ['Sumário do texto', 'Pontos fortes', 'A melhorar', 'Reescrita de exemplo', 'Pergunta'];
const PADRAO_ROTULOS = new RegExp(`\\b(${ROTULOS_ANALISE.join('|')})[ \\t]*:`, 'gi');

/**
 * Quebra o texto da análise em blocos rotulados, para o painel renderizar
 * seções em vez de um parágrafo corrido. Durante o streaming o texto chega
 * pela metade: segmenta só o que existe — a seção aberta vai preenchendo.
 *
 * @param {string} texto texto parcial ou completo da análise
 * @returns {Array<{rotulo: string, conteudo: string}>}
 */
export function segmentarAnalise(texto) {
  const t = (texto || '').toString();
  if (!t.trim()) return [];

  const marcadores = [];
  let m;
  PADRAO_ROTULOS.lastIndex = 0;
  while ((m = PADRAO_ROTULOS.exec(t)) !== null) {
    marcadores.push({ rotulo: m[1], start: m.index, contentStart: m.index + m[0].length });
  }
  if (marcadores.length === 0) {
    return [{ rotulo: 'Análise', conteudo: t.trim() }];
  }
  return marcadores.map((marca, i) => ({
    rotulo: marca.rotulo.charAt(0).toUpperCase() + marca.rotulo.slice(1),
    conteudo: t
      .slice(marca.contentStart, i + 1 < marcadores.length ? marcadores[i + 1].start : undefined)
      .trim(),
  }));
}

// ---- sugestão vinda do chat (/api/chat) ----

// Compara nomes sem acento e em minúsculas: "Yale" casa com "yale";
// "Boston College" casa com "boston" também não — borda de palavra evita
// que nomes curtos ("MIT") apariçam dentro de palavras comuns ("permitido").
const PALAVRAS_GENERICAS = new Set([
  'university', 'universidade', 'college', 'instituto', 'institute',
  'school', 'faculdade', 'de', 'da', 'do', 'dos', 'das', 'the',
]);

// "Yale University" casaria só como frase inteira; a menção no chat é quase
// sempre "Yale". Devolve o nome completo E a parte distintiva (palabras não
// genéricas) para casar nos dois jeitos.
function nomesParaCasar(university) {
  const nome = normalizarParaBusca(university);
  if (!nome || nome.length < 2) return [];
  // Prefixos progressivos das palavras distintivas: "Stanford Teste Dispensa"
  // vira "stanford teste dispensa", "stanford teste" e "stanford" — a menção no
  // chat quase sempre vem só com o primeiro nome.
  const distintivas = nome
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !PALAVRAS_GENERICAS.has(t));
  const candidatos = [nome];
  for (let i = 0; i < distintivas.length; i++) {
    candidatos.push(distintivas.slice(0, i + 1).join(' '));
  }
  return [...new Set(candidatos)].filter((c) => c.length >= 2);
}

export function sugestoesRedacaoDaMensagem(texto, aplicacoes, ensaios) {
  const dados = normalizarParaBusca(texto);
  if (!dados) return [];
  const base = calcularSugestoes(aplicacoes, ensaios);
  return base.filter((ap) =>
    nomesParaCasar(ap.university).some((nome) =>
      new RegExp(`\\b${escaparRegex(nome)}\\b`).test(dados)
    )
  );
}

function normalizarParaBusca(s) {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * "Não me lembre": grava a dispensa na candidatura (details merge).
 * Idempotente e defensivo: details ausente nunca quebra.
 *
 * @returns {Promise<{error: object|null}>}
 */
export async function dispensarSugestao(applicationId, supabaseClient) {
  if (!applicationId) return { error: { message: 'application_id ausente' } };

  const { data: ap, error: errFetch } = await supabaseClient
    .from('applications')
    .select('details')
    .eq('id', applicationId)
    .maybeSingle();
  if (errFetch) return { error: errFetch };

  const details = { ...(ap?.details || {}), redacao_dispensada: true };
  const { error } = await supabaseClient.from('applications').update({ details }).eq('id', applicationId);
  return { error };
}

/**
 * Desfaz o "Não me lembre": remove a chave redacao_dispensada do details,
 * preservando todo o resto. Idempotente (dispensa inexistente não é erro).
 *
 * @returns {Promise<{error: object|null}>}
 */
export async function removerDispensa(applicationId, supabaseClient) {
  if (!applicationId) return { error: { message: 'application_id ausente' } };

  const { data: ap, error: errFetch } = await supabaseClient
    .from('applications')
    .select('details')
    .eq('id', applicationId)
    .maybeSingle();
  if (errFetch) return { error: errFetch };

  const { redacao_dispensada: _removida, ...details } = ap?.details || {};
  const { error } = await supabaseClient.from('applications').update({ details }).eq('id', applicationId);
  return { error };
}
