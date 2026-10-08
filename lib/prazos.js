// lib/prazos.js
//
// Um só vocabulário de prazo para a interface (moodboard v3):
//   lacre    → inscrições abertas (> 21 dias)
//   vazado   → agendada (fecha em 8–21 dias)
//   vermelho → urgência real (≤ 7 dias)
//   tinta    → encerrada / sem data
// O estado é o dot — nada de emoji (regra "✕ emoji como UI" do moodboard).
//
// Datas do banco vêm como 'AAAA-MM-DD' (data pura). O new Date('2026-02-02')
// do JS lê isso como meia-noite UTC e, no fuso do Brasil (UTC-3), mostra
// 01/02 — um dia antes do prazo escrito. paraData() lê data-pura no fuso
// local e preserva o dia que está no banco.

const MESES_CURTOS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const DIA_MS = 24 * 60 * 60 * 1000;

// Data (ou texto de data) → Date local, sem o deslocamento de fuso das datas puras.
function paraData(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const texto = String(value).trim();
  if (!texto) return null;

  const dataPura = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dataPura) {
    const d = new Date(Number(dataPura[1]), Number(dataPura[2]) - 1, Number(dataPura[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

function meiaNoite(d) {
  const copia = new Date(d.getTime());
  copia.setHours(0, 0, 0, 0);
  return copia;
}

// Dias inteiros até a data (negativo = já passou). null quando não há data válida.
function diasAte(value) {
  const alvo = paraData(value);
  if (!alvo) return null;
  const hoje = meiaNoite(new Date());
  return Math.round((meiaNoite(alvo).getTime() - hoje.getTime()) / DIA_MS);
}

// Estado do prazo no vocabulário v3.
// tipo: 'sem-data' · 'encerrada' · 'urgente' · 'agendada' · 'aberta'
function prazoStatus(opp) {
  const data = paraData(opp?.application_deadline);

  if (!data) {
    return {
      tipo: 'sem-data',
      dot: 'dot--tinta',
      rotulo: 'Sem data de inscrição',
      rotuloMono: 'SEM DATA DE INSCRIÇÃO',
      data: null,
      dias: null,
    };
  }

  const dias = diasAte(data);
  const rotuloMono = `FECHA EM ${formatarData(data)}`;

  if (dias < 0) {
    return { tipo: 'encerrada', dot: 'dot--tinta', rotulo: 'Encerrada', rotuloMono: `ENCERRADA EM ${formatarData(data)}`, data, dias };
  }
  if (dias === 0) {
    return { tipo: 'urgente', dot: 'dot--vermelho', rotulo: 'Fecha hoje', rotuloMono, data, dias };
  }
  if (dias === 1) {
    return { tipo: 'urgente', dot: 'dot--vermelho', rotulo: 'Fecha amanhã', rotuloMono, data, dias };
  }
  if (dias <= 7) {
    return { tipo: 'urgente', dot: 'dot--vermelho', rotulo: `Fecha em ${dias} dias`, rotuloMono, data, dias };
  }
  if (dias <= 21) {
    return { tipo: 'agendada', dot: 'dot--vazado', rotulo: `Fecha em ${dias} dias`, rotuloMono, data, dias };
  }
  return { tipo: 'aberta', dot: 'dot--lacre', rotulo: 'Inscrições abertas', rotuloMono, data, dias };
}

// '2026-02-02' → '02 FEV 2026' (formato dos dados no painel, IBM Plex Mono).
function formatarData(value) {
  const data = paraData(value);
  if (!data) return null;
  const dia = String(data.getDate()).padStart(2, '0');
  return `${dia} ${MESES_CURTOS[data.getMonth()]} ${data.getFullYear()}`;
}

module.exports = { paraData, diasAte, prazoStatus, formatarData, DIA_MS };
