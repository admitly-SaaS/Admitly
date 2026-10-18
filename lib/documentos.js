// Mapa de documentos por candidatura (feedback de usuários 15/10):
// a dificuldade "o que já tenho / o que ainda preciso pedir" de forma organizada.
//
// O catálogo de documentos é FIXO (curado, curto e universal): cada candidatura
// mostra a mesma lista de tipos e o aluno marca o estado de cada um. O estado
// vem do upsert em application_documents; tipo sem linha no banco = 'falta'
// (ainda não marcado). Revela progresso como a mesma linguagem do checklist.
//
// Estados por tipo:
// - 'falta'    — precisa desse documento e ainda não tem/não pediu
// - 'pedindo'  — pedido (escola, professor, órgão), à espera
// - 'pronto'   — tenho em mãos (arquivo salvo, carta recebida, teste enviado)
// - 'nao-pede' — esta candidatura não exige esse tipo (sai da conta de progresso)

export const TABELA = 'application_documents';

// Cíclico: toque avança falta → pedindo → pronto → falta. 'nao-pede' é
// escolhido pelo botão "não pede" (e volta clicando de novo).
export function proximoEstado(atual) {
  if (atual === 'nao-pede') return 'falta';
  if (atual === 'pedindo') return 'pronto';
  if (atual === 'pronto') return 'falta'; // fecha o ciclo em 3 toques
  return 'pedindo'; // falta (e qualquer valor estranho) → pedindo
}

// Reset direto (feedback 18/10): o botão "desmarcar" não cicla — um documento
// em qualquer estado volta a 'falta' num toque só (ex.: 'pedindo' começou a
// andar para trás por engano e o ciclo daria 'pronto'). O botão só aparece
// quando faz sentido (pedindo/pronto); não-pede tem o "pede sim" próprio.
export function desmarcarEstado() {
  return 'falta';
}

// Documentos essenciais de candidatura internacional, na ordem de quê vira
// gargalo primeiro. Um tipo: uma linha, um estado.
export const TIPOS = [
  { id: 'transcricao', nome: 'Transcrição escolar (histórico)', dica: 'Peça na secretaria — uns dias de prazo.' },
  { id: 'passaporte', nome: 'Passaporte válido', dica: 'Se não tem, comece ele agora: é o mais lento.' },
  { id: 'redacao', nome: 'Redação / personal statement', dica: 'Monte na aba Redações.' },
  { id: 'recomendacao', nome: 'Carta(s) de recomendação', dica: 'Convide cedo: professores levam semanas.' },
  { id: 'proficiencia', nome: 'Proficiência (TOEFL, IELTS, Duolingo)', dica: 'Só quando pedir o formato exato.' },
  { id: 'financeiro', nome: 'Comprovante financeiro', dica: 'Bolsa integral às vezes dispensa — confira o site.' },
  { id: 'extracurriculares', nome: 'Lista de atividades', dica: 'Monte na aba Extracurriculares.' },
];

const TIPOS_IDS = new Set(TIPOS.map((t) => t.id));
const ESTADOS_VALIDOS = new Set(['falta', 'pedindo', 'pronto', 'nao-pede']);

// Sugestão automática (feedback 15/10 seguindo 16/10): quando o prazo fecha
// em menos de LIMITE_CRITICO dias, os tipos de documento que costumam virar
// gargalo — os que dependem de terceiros ou de órgãos lentos — e que ainda
// estão 'falta' viram CRÍTICOS no mapa. Proficiência e recomendação primeiro:
// professor/agendamento de teste levam semanas; é isso que perde aplicação.
export const LIMITE_CRITICO = 30;
export const CRITICOS = [
  { id: 'proficiencia', motivo: 'agendar e receber o resultado leva semanas' },
  { id: 'recomendacao', motivo: 'professores levam semanas para escrever e enviar' },
  { id: 'passaporte', motivo: 'emissão é lenta — se não tem, comece hoje' },
];

// Pura e testada. diasRestantes vem do prazoStatus da página (prazo.dias):
// null/negativo = sem urgência nenhuma (sem data ou encerrada). Devolve os
// TIPOS críticos ainda em 'falta', na ordem de CRITICOS (lead time desce). O
// estado 'nao-pede' nunca é crítico — o aluno disse que aquela candidatura
// não exige o documento.
export function criticosFaltando(documentosMap, applicationId, diasRestantes, limite = LIMITE_CRITICO) {
  if (!applicationId || !documentosMap || typeof documentosMap.get !== 'function') return [];
  if (diasRestantes == null || diasRestantes < 0 || diasRestantes >= limite) return [];

  return CRITICOS
    .map((critico) => TIPOS.find((t) => t.id === critico.id))
    .filter((tipo) => {
      if (!tipo) return false; // id de CRITICOS fora do catálogo: fora
      const estado = documentosMap.get(`${applicationId}__${tipo.id}`) || 'falta';
      return estado === 'falta';
    });
}

// É o tipo PGRST205 (tabela ausente no schema cache — migration não rodou).
function erroTabelaAusente(error) {
  return error?.code === 'PGRST205' || /schema cache|Could not find the table/i.test(error?.message || '');
}

// Lista os documentos do aluno como Map "appId__tipo" → estado. Falha de
// leitura vira TABELA_AUSENTE (a página mostra tudo como 'falta' e desativa
// a marcação com um aviso — sem fingir que salvou).
export async function carregarDocumentos(userId, supabaseClient) {
  if (!userId) return { documentos: new Map(), error: { code: 'SEM_USUARIO' } };

  const { data, error } = await supabaseClient
    .from(TABELA)
    .select('application_id, tipo, estado')
    .eq('user_id', userId);

  if (error) {
    return {
      documentos: new Map(),
      error: erroTabelaAusente(error)
        ? { code: 'TABELA_AUSENTE', message: error.message }
        : error,
    };
  }

  const documentos = new Map();
  for (const linha of data || []) {
    if (!linha?.application_id || !linha?.tipo || !ESTADOS_VALIDOS.has(linha.estado)) continue;
    if (!TIPOS_IDS.has(linha.tipo)) continue;
    documentos.set(`${linha.application_id}__${linha.tipo}`, linha.estado);
  }
  return { documentos, error: null };
}

// Grava UM estado: upsert em (user_id, application_id, tipo).
export async function gravarEstado(userId, applicationId, tipo, estado, supabaseClient) {
  if (!userId || !applicationId || !TIPOS_IDS.has(tipo) || !ESTADOS_VALIDOS.has(estado)) {
    return { error: { code: 'ARGUMENTO', message: 'argumentos inválidos' } };
  }

  const { error } = await supabaseClient.from(TABELA).upsert(
    {
      user_id: userId,
      application_id: applicationId,
      tipo,
      estado,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'user_id,application_id,tipo' }
  );

  if (error) {
    return {
      error: erroTabelaAusente(error)
        ? { code: 'TABELA_AUSENTE', message: error.message }
        : error,
    };
  }
  return { error: null };
}
