// lib/matching.js
// Este arquivo é CommonJS por contrato: os testes o carregam com createRequire
// e a rota do chat importa o objeto de exports — por isso o require abaixo.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { paraData, diasAte } = require('./prazos.js');

/**
 * Compatibilidade vs recomendação complementar
 * - compatibilidade: Alta / Média / Baixa, baseada em qualificadores do perfil
 * - recomendação complementar: seletividade + dificuldade, só afeta a ordem
 *
 * Regras de nível:
 * - Baixa: somente bloqueadores claros (ano escolar fora, GPA abaixo do mínimo,
 *   custo bem acima do orçamento na mesma moeda e sem apoio financeiro)
 * - Média: ressalvas suaves (país fora da preferência, custo levemente acima)
 * - Alta: sem bloqueadores nem ressalvas
 *
 * Regras de dados ausentes:
 * - campo faltante no perfil ou no programa nunca é veto
 * - requisitos (redação, entrevista, testes, recomendação) são informativos
 *   e NÃO afetam o nível de compatibilidade
 * - moedas diferentes entre orçamento e custo não são comparadas numericamente
 */

function normalizeString(value) {
  if (!value) return '';
  return String(value).toLowerCase();
}

function parseNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^(gratuito|gratis|free)$/i.test(text)) return 0;
  const cleaned = text.replace(/\./g, '');
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  let num = Number(match[0]);
  if (/mil/i.test(cleaned) || /\bk\b/i.test(cleaned)) num *= 1000;
  return num;
}

// '9th' → {min:9,max:9}; 'grades 9-12' → {min:9,max:12}; '10th and above' → {min:10,max:14}
// Entradas sem número (ex.: 'High School') retornam null e são ignoradas.
function parseGradeRange(value) {
  if (value == null) return null;
  const text = String(value).toLowerCase();
  const nums = text.match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const min = parseInt(nums[0], 10);
  const max = nums.length > 1 ? parseInt(nums[nums.length - 1], 10) : min;
  const isOpenEnded = /\+|above|acima|superior|ou superior/.test(text);
  return { min, max: isOpenEnded ? Math.max(max, 14) : max };
}

function detectCurrency(value) {
  const t = normalizeString(value);
  if (!t) return null;
  if (/r\$|brl|real/.test(t)) return 'BRL';
  if (/€|eur|euro/.test(t)) return 'EUR';
  if (/£|gbp|libra/.test(t)) return 'GBP';
  if (/us\$|usd|dólar|dolar|\$/.test(t)) return 'USD';
  return null;
}

const REGION_EUROPE = [
  'alemanha', 'germany', 'frança', 'france', 'países baixos', 'netherlands', 'holanda',
  'suíça', 'switzerland', 'dinamarca', 'denmark', 'suécia', 'sweden', 'noruega', 'norway',
  'irlanda', 'ireland', 'áustria', 'austria', 'bélgica', 'belgium', 'espanha', 'spain',
  'itália', 'italy', 'polônia', 'poland', 'república tcheca', 'czech', 'finlândia', 'finland',
  'portugal', 'grécia', 'greece', 'hungria', 'hungary', 'estônia', 'estonia', 'croácia',
  'croatia', 'reino unido', 'united kingdom', 'inglaterra', 'england', 'escócia', 'scotland',
  'romênia', 'romania', 'turquia', 'turkey',
];
const REGION_NORTH_AMERICA = ['estados unidos', 'eua', 'usa', 'united states', 'canadá', 'canada', 'méxico', 'mexico'];
const REGION_LATIN_AMERICA = ['brasil', 'brazil', 'argentina', 'chile', 'colômbia', 'colombia', 'méxico', 'mexico', 'peru', 'uruguai', 'uruguay'];

const COUNTRY_GROUPS = [
  { keys: ['europa'], aliases: REGION_EUROPE },
  { keys: ['américa do norte', 'america do norte'], aliases: REGION_NORTH_AMERICA },
  { keys: ['américa latina', 'america latina'], aliases: REGION_LATIN_AMERICA },
  { keys: ['estados unidos', 'eua', 'usa', 'united states'], aliases: ['eua', 'usa', 'united states', 'estados unidos'] },
  { keys: ['reino unido', 'uk', 'inglaterra', 'england'], aliases: ['united kingdom', 'uk', 'england', 'inglaterra', 'escócia', 'scotland', 'gales', 'wales'] },
  { keys: ['brasil', 'brazil'], aliases: ['brasil', 'brazil'] },
];

// "Estados Unidos ou Europa" → ['estados unidos', 'europa']
function preferenceTokens(text) {
  if (!text) return [];
  return normalizeString(text)
    .split(/[,;]|\bou\b|\be\b/gi)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function countryMatches(prefText, oppCountry) {
  const tokens = preferenceTokens(prefText);
  if (!tokens.length || !oppCountry) return { match: false, checked: false };
  const country = normalizeString(oppCountry);
  const match = tokens.some((token) => {
    if (country.includes(token) || token.includes(country)) return true;
    return COUNTRY_GROUPS.some((group) => {
      if (!group.keys.includes(token)) return false;
      return group.aliases.some((a) => country.includes(a));
    });
  });
  return { match, checked: true };
}

function evaluateCompatibility(opp, profile) {
  const reasons = [];
  const cautions = [];
  const blockers = [];
  const notes = [];

  // 1) Ano escolar (qualificador forte)
  // Compara numericamente e tolera formatos variados ('9th', 'grades 9-12', '10th and above').
  // Se nenhuma série do programa for interpretável, o critério fica neutro (sem veto).
  const yearInfo = parseGradeRange(profile?.school_year);
  const gradeRanges = (Array.isArray(opp.eligible_grades) ? opp.eligible_grades : [])
    .map((g) => parseGradeRange(g))
    .filter(Boolean);

  if (yearInfo && gradeRanges.length > 0) {
    const yearFits = gradeRanges.some(
      (r) => yearInfo.min >= r.min && yearInfo.max <= r.max
    );
    if (yearFits) {
      reasons.push('Seu ano escolar é elegível');
    } else {
      blockers.push('Ano escolar fora das séries elegíveis do programa');
    }
  }

  // 2) GPA (qualificador forte)
  const gpa = parseNumber(profile?.gpa);
  const minGpa = parseNumber(opp.minimum_gpa);
  if (gpa != null && minGpa != null) {
    if (gpa >= minGpa) {
      reasons.push('Seu GPA atende o mínimo exigido');
    } else {
      blockers.push('GPA abaixo do mínimo exigido');
    }
  }

  // 3) Orçamento
  const hasAid = opp.full_scholarship_available === true || opp.financial_aid_available === true;
  const budgetNum = parseNumber(profile?.budget);
  const costNum = parseNumber(opp.program_cost);

  if (budgetNum != null && costNum != null) {
    if (costNum === 0) {
      reasons.push('Programa gratuito');
    } else {
      const profileCurrency = detectCurrency(profile?.budget);
      const oppCurrency = opp.currency ? String(opp.currency).trim().toUpperCase() : null;
      const currenciesKnown = profileCurrency != null && oppCurrency != null;

      if (currenciesKnown && profileCurrency !== oppCurrency) {
        // Moedas diferentes: comparação numérica não é confiável.
        notes.push(`Custo em ${oppCurrency} — confira a conversão para o seu orçamento`);
      } else if (costNum <= budgetNum) {
        reasons.push('Está dentro do seu orçamento aproximado');
      } else if (hasAid) {
        notes.push('Custo acima do orçamento, mas há bolsa/auxílio disponível');
      } else if (costNum <= budgetNum * 1.5) {
        cautions.push('Custo um pouco acima do seu orçamento informado');
      } else {
        blockers.push('Custo bem acima do seu orçamento informado');
      }
    }
  } else if (costNum === 0) {
    reasons.push('Programa gratuito');
  }

  // 4) Localização / preferência de país
  const location = normalizeString(opp.location_type);
  const isOnline = location.includes('online');
  const isHybrid = location.includes('híbrido') || location.includes('hibrido');
  const { match: countryMatch, checked: countryChecked } = countryMatches(
    profile?.country_preference,
    opp.country
  );

  if (countryMatch) {
    reasons.push('Combina com sua região de interesse');
  } else if (countryChecked && !isOnline && !isHybrid) {
    cautions.push('País fora da sua preferência, mas pode ser relevante');
  }
  if (isOnline) reasons.push('Opção online disponível');
  else if (isHybrid) reasons.push('Formato híbrido disponível');

  // 5) Área e objetivo (afinidade)
  const haystack = `${normalizeString(opp.name)} ${normalizeString(opp.description)} ${normalizeString(opp.type)}`;
  const areaTokens = preferenceTokens(profile?.area);
  if (areaTokens.some((t) => haystack.includes(t))) {
    reasons.push('Área relacionada ao seu interesse');
  }
  const goalTokens = preferenceTokens(profile?.goals);
  if (goalTokens.some((t) => haystack.includes(t))) {
    reasons.push('Alinhado ao seu objetivo');
  }

  // 6) Apoio financeiro como motivo positivo
  if (opp.full_scholarship_available === true) reasons.push('Bolsa integral disponível');
  else if (opp.financial_aid_available === true) reasons.push('Auxílio financeiro disponível');

  // 7) Requisitos → informativos, não afetam o nível
  const reqs = [];
  if (opp.requires_essay) reqs.push('redação');
  if (opp.requires_recommendation) reqs.push('carta de recomendação');
  if (opp.requires_interview) reqs.push('entrevista');
  if (Array.isArray(opp.required_tests) && opp.required_tests.length > 0) {
    reqs.push(`testes (${opp.required_tests.join(', ')})`);
  } else if (opp.requires_test) {
    reqs.push('teste de proficiência');
  }
  if (reqs.length > 0) notes.push(`Requer: ${reqs.join(', ')}`);

  const level =
    blockers.length > 0 ? 'Baixa' : cautions.length > 0 ? 'Média' : 'Alta';

  return {
    level,
    reasons,
    warnings: [...blockers, ...cautions],
    notes,
  };
}

function selectivityLabel(selectivity) {
  if (selectivity == null) return null;
  const n = Number(selectivity);
  if (!Number.isFinite(n)) return null;
  if (n <= 2) return 'Acessível';
  if (n === 3) return 'Competitiva';
  return 'Muito concorrida';
}

function difficultyComponents(opp) {
  let score = 0;

  if (opp.requires_test) score += 1;
  if (opp.requires_essay) score += 1;
  if (opp.requires_recommendation) score += 1;
  if (opp.requires_interview) score += 1;

  if (opp.minimum_gpa != null) {
    const minGpa = Number(opp.minimum_gpa);
    if (Number.isFinite(minGpa)) {
      if (minGpa >= 3.5) score += 1;
      else if (minGpa >= 3.0) score += 0.5;
    }
  }

  if (Array.isArray(opp.required_tests) && opp.required_tests.length > 0) {
    score += Math.min(opp.required_tests.length, 2);
  }

  return score;
}

function recommendationScore(opp) {
  const selLabel = selectivityLabel(opp.selectivity);
  const selWeight =
    selLabel === 'Muito concorrida' ? 2 :
    selLabel === 'Competitiva' ? 1 :
    0;

  const difficulty = difficultyComponents(opp);

  return {
    selectivityLabel: selLabel,
    difficulty,
    score: selWeight + difficulty,
  };
}

// Estado do prazo em texto — usado pelo filtro 'Prazo próximo' e pelo contexto do chat.
// A leitura de datas e a contagem de dias vêm de lib/prazos.js (uma só regra para o app);
// sem emoji: a interface marca o estado com o dot do design v3.
function deadlineStatus(opp) {
  if (!opp.application_deadline) {
    return { tipo: 'sem-data', text: 'Sem data de inscrição' };
  }

  const deadline = paraData(opp.application_deadline);
  if (!deadline) {
    return { tipo: 'sem-data', text: 'Data inválida' };
  }

  const diff = diasAte(deadline);

  if (diff < 0) {
    return { tipo: 'encerrada', text: 'Deadline encerrada' };
  }
  if (diff === 1) {
    return { tipo: 'urgente', text: 'Deadline amanhã', date: opp.application_deadline };
  }
  if (diff <= 14) {
    return { tipo: 'agendada', text: `Deadline em ${diff} dias`, date: opp.application_deadline };
  }
  return { tipo: 'aberta', text: 'Inscrições abertas', date: opp.application_deadline };
}

function passaFiltro(opp, filtro, profile) {
  if (filtro === 'Todas') return true;

  if (filtro === 'Compatíveis') {
    const { level } = evaluateCompatibility(opp, profile);
    return level === 'Alta' || level === 'Média';
  }

  if (filtro === 'Grátis') {
    const cost = parseNumber(opp.program_cost);
    return opp.full_scholarship_available === true || cost === 0;
  }

  if (filtro === 'Com bolsa') {
    return opp.full_scholarship_available === true ||
           opp.financial_aid_available === true;
  }

  if (filtro === 'Online') {
    const loc = normalizeString(opp.location_type);
    return loc.includes('online') || loc.includes('híbrido') || loc.includes('hibrido');
  }

  if (filtro === 'Presencial') {
    const loc = normalizeString(opp.location_type);
    return loc.includes('presencial') || loc.includes('híbrido') || loc.includes('hibrido');
  }

  if (filtro === 'Prazo próximo') {
    const status = deadlineStatus(opp);
    if (!status.date) return false;
    const deadline = new Date(status.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil(
      (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diff >= 0 && diff <= 60;
  }

  return true;
}

// Aceita um filtro único (string, compatibilidade com chamadas antigas) ou um
// array de filtros — vários chips marcados ao mesmo tempo, lógica OU: o
// programa entra se casar com qualquer marcado. 'Todas' isolado ou array
// vazio significam nenhum filtro ativo.
function filterOpportunities(opportunities, filters, profile) {
  const list = Array.isArray(opportunities) ? opportunities : [];

  if (Array.isArray(filters)) {
    const ativos = filters.filter((f) => f && f !== 'Todas');
    if (ativos.length === 0) return list;
    return list.filter((opp) => ativos.some((f) => passaFiltro(opp, f, profile)));
  }

  return list.filter((opp) => passaFiltro(opp, filters, profile));
}

function prepareOpportunities(opportunities, profile, filters = 'Todas') {
  const list = filterOpportunities(opportunities, filters, profile);

  const enriched = list.map((opp) => {
    const compat = evaluateCompatibility(opp, profile);
    const score = recommendationScore(opp);
    const deadline = deadlineStatus(opp);

    return {
      ...opp,
      compatibility: {
        level: compat.level,
        reasons: compat.reasons,
        warnings: compat.warnings,
        notes: compat.notes,
      },
      recommendation: {
        selectivityLabel: score.selectivityLabel,
        difficulty: score.difficulty,
        score: score.score,
      },
      deadline,
    };
  });

  enriched.sort((a, b) => {
    const rank = { Alta: 0, Média: 1, Baixa: 2 };
    const aRank = rank[a.compatibility.level] ?? 3;
    const bRank = rank[b.compatibility.level] ?? 3;
    if (aRank !== bRank) return aRank - bRank;
    return (b.recommendation.score ?? 0) - (a.recommendation.score ?? 0);
  });

  return enriched;
}

module.exports = {
  calcularMatches: prepareOpportunities,
  evaluateCompatibility,
  explainWhy: evaluateCompatibility,
  recommendationScore,
  selectivityLabel,
  difficultyComponents,
  deadlineStatus,
  filterOpportunities,
  prepareOpportunities,
};
