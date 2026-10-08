// Busca do catálogo de oportunidades.
//
// O casamento é por substring sobre um haystack sem acentos (nome, provider,
// país, tipo e academic_focus), mas com três reforços além do includes puro:
//
// 1. SINONIMOS: abreviações e equivalentes EN↔PT ("cs" acha Computação/
//    Informática, "math" acha Matemática, "eua" acha USA). A chave é o termo
//    digitado (inteiro ou palavra); o valor lista substrings canônicas a
//    procurar no haystack. Prefixos já funcionam de graça ("bio" ⊂ "biologia").
// 2. Tolerância a plural: palavra com ≥5 letras terminada em "s" também tenta
//    o singular ("olimpiadas" acha "Olimpíada...").
// 3. Multi-palavra com semântica E: "matematica olimpiada" exige as duas
//    palavras (cada uma por substring ou sinônimo), sem exigir contiguidade.

const SINONIMOS = {
  // Abreviações e prefixos curtos (≤3 letras não casam substring, ver casar)
  cs: ['computacao', 'informatica', 'computing', 'computer science'],
  bio: ['biologia', 'biology', 'bioquimica', 'biochemistry'],
  mat: ['matematica', 'math', 'mathematics'],
  fis: ['fisica', 'physics'],
  quim: ['quimica', 'chemistry'],
  eua: ['usa', 'estados unidos'],
  'estados unidos': ['usa'],
  // EN → PT (o banco é majoritariamente em português)
  math: ['matematica'],
  physics: ['fisica'],
  biology: ['biologia'],
  chemistry: ['quimica'],
  astronomy: ['astronomia'],
  engineering: ['engenharia'],
  science: ['ciencias'],
  history: ['historia'],
  linguistics: ['linguistica'],
  robotics: ['robotica'],
  technology: ['tecnologia'],
  biochemistry: ['bioquimica'],
  genomics: ['genomica'],
  netherlands: ['paises baixos'],
  holland: ['paises baixos'],
  brazil: ['brasil'],
  stem: ['ciencias', 'matematica', 'fisica', 'biologia', 'computacao', 'informatica', 'engenharia', 'tecnologia'],
  // PT → EN (programas dos EUA/UK têm nomes em inglês)
  computacao: ['informatica', 'computing', 'computer science'],
  matematica: ['math'],
  fisica: ['physics'],
  biologia: ['biology'],
  quimica: ['chemistry'],
  astronomia: ['astronomy'],
  engenharia: ['engineering'],
  historia: ['history'],
  linguistica: ['linguistics'],
  robotica: ['robotics'],
  tecnologia: ['technology'],
};

export function removerAcentos(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Uma palavra/termo casa se for substring do haystack, tiver sinônimo que
// apareça no haystack, ou casar no singular (tolerância a plural).
function casar(termo, haystack) {
  // Termos curtos (≤3 letras) são ruidosos como substring ('cs' casaria
  // 'physics' e 'Academics'): só casam como palavra inteira ou via sinônimo.
  if (termo.length <= 3) {
    if (new RegExp(`\\b${escaparRegex(termo)}\\b`).test(haystack)) return true;
    const alvos = SINONIMOS[termo];
    return Array.isArray(alvos) && alvos.some((a) => haystack.includes(a));
  }
  if (haystack.includes(termo)) return true;
  if (termo.length >= 5 && termo.endsWith('s') && haystack.includes(termo.slice(0, -1))) {
    return true;
  }
  const alvos = SINONIMOS[termo];
  return Array.isArray(alvos) && alvos.some((a) => haystack.includes(a));
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function bateBusca(opp, termo) {
  if (!opp) return false;
  const t = removerAcentos(termo).trim().toLowerCase();
  if (!t) return true;
  const focos = Array.isArray(opp.academic_focus) ? opp.academic_focus.join(' ') : '';
  const haystack = removerAcentos(
    `${opp.name ?? ''} ${opp.provider ?? ''} ${opp.country ?? ''} ${opp.type ?? ''} ${focos}`
  ).toLowerCase();

  if (casar(t, haystack)) return true;

  const palavras = t.split(/\s+/);
  if (palavras.length > 1 && palavras.every((p) => casar(p, haystack))) return true;

  return false;
}
