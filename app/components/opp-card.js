'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { addFavoriteForUser, removeFavoriteForUser } from '@/lib/favorites.js';
import { createApplicationForUser } from '@/lib/applications.js';
import { prazoStatus, formatarData } from '@/lib/prazos.js';

// Cartão-carta do catálogo (design v3). O CSS vive em app/oportunidades/page.js
// (.cartao, .cartao-*), porque este componente só é usado lá e assim as regras
// ficam num só lugar em vez de se repetirem em cada cartão renderizado.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const SIMBOLOS_MOEDA = { USD: 'US$', BRL: 'R$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$' };

const ANOS = { '8th': '8º', '9th': '9º', '10th': '10º', '11th': '11º', '12th': '12º' };

const NIVEIS_SELETIVIDADE = { 1: 'Acessível', 2: 'Acessível', 3: 'Competitiva', 4: 'Muito concorrida' };

function normalizar(valor) {
  return valor ? String(valor).toLowerCase() : '';
}

function textoCusto(opp) {
  if (opp.program_cost == null || opp.program_cost === '') return null;
  const valor = Number(opp.program_cost);
  if (!Number.isFinite(valor)) return null;
  if (valor === 0) return 'gratuito';
  const simbolo = SIMBOLOS_MOEDA[String(opp.currency || '').toUpperCase()] || null;
  const numero = valor.toLocaleString('pt-BR');
  return simbolo ? `${simbolo} ${numero}` : `${numero} ${opp.currency || ''}`.trim();
}

function textoBolsa(opp) {
  const porcentagem = Number(opp.funding_percentage);
  const comPorcentagem = Number.isFinite(porcentagem) && porcentagem > 0 && porcentagem <= 100
    ? `bolsa de até ${porcentagem}%`
    : null;

  if (opp.full_scholarship_available) return comPorcentagem || 'bolsa integral disponível';
  if (opp.partial_scholarship_available) return comPorcentagem || 'bolsa parcial disponível';
  if (opp.financial_aid_available) return 'auxílio financeiro disponível';
  return null;
}

function textoLocalizacao(opp) {
  const tipo = normalizar(opp.location_type);
  if (tipo.includes('online')) return 'Online';
  if (tipo.includes('hibrido') || tipo.includes('híbrido')) return 'Híbrido';
  if (tipo.includes('presencial')) return 'Presencial';
  return opp.location_type ? String(opp.location_type) : null;
}

function textoAnos(opp) {
  const lista = Array.isArray(opp.eligible_grades) ? opp.eligible_grades.filter(Boolean) : [];
  const anos = [...new Set(lista.map((g) => ANOS[normalizar(g)] || null).filter(Boolean))];
  if (!anos.length) return null;
  if (anos.length === 1) return `${anos[0]} ano`;
  return `${anos[0]}–${anos[anos.length - 1]} ano`;
}

function rotuloSeletividade(opp) {
  const n = Number(opp.selectivity);
  if (!Number.isFinite(n)) return null;
  if (NIVEIS_SELETIVIDADE[n]) return NIVEIS_SELETIVIDADE[n];
  if (n <= 2) return 'Acessível';
  if (n === 3) return 'Competitiva';
  return 'Muito concorrida';
}

function Grifo({ children }) {
  return (
    <span className="grifo">
      {children}
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" filter="url(#tinta)" aria-hidden="true">
        <use href="#traco-tinteiro" />
      </svg>
    </span>
  );
}

export default function OppCard({ opp, isFavorite, userId, onFavoriteChange }) {
  const [ocupado, setOcupado] = useState(false);
  const [adicionado, setAdicionado] = useState(false);
  const [aviso, setAviso] = useState(null);

  // Único ponto de verdade para "este programa está salvo?" é o Set da página.
  // Salvar aqui otimista: o cartão confia antes de confirmar — se o banco
  // falhar, a página reverte pelo onFavoriteChange no catch.
  const salvo = Boolean(isFavorite);

  const mostrar = (texto, tipo = 'ok') => {
    setAviso({ texto, tipo });
    setTimeout(() => setAviso(null), 5000);
  };

  const makeClient = () => createClient(supabaseUrl, supabaseAnonKey);

  async function handleSave(e) {
    e.stopPropagation();
    setOcupado(true);
    try {
      const agoraSalvo = !salvo;
      // Otimista: a página já é a fonte de verdade e é atualizada primeiro — o
      // cartão re-renderiza na hora, e um Salvar no Radar reflete aqui
      // automaticamente.
      onFavoriteChange?.(opp.id, agoraSalvo);

      if (salvo) {
        const { error } = await removeFavoriteForUser(userId, opp.id, makeClient());
        if (error) throw error;
        mostrar('Programa removido dos favoritos.');
      } else {
        const { error } = await addFavoriteForUser(userId, opp.id, makeClient());
        if (error) throw error;
        mostrar('Programa salvo nos favoritos.');
      }
    } catch {
      // falhou no banco: reverte a mudança otimista
      onFavoriteChange?.(opp.id, salvo);
      mostrar('Não foi possível atualizar o favorito.', 'erro');
    } finally {
      setOcupado(false);
    }
  }

  async function handleAdd(e) {
    e.stopPropagation();
    setOcupado(true);
    try {
      const { error, duplicate } = await createApplicationForUser(userId, opp.id, opp, makeClient());
      if (error) throw error;
      setAdicionado(true);
      mostrar(
        duplicate
          ? `${opp.name || 'Programa'} já está nas suas aplicações.`
          : `${opp.name || 'Programa'} entrou nas suas aplicações.`
      );
      setTimeout(() => setAdicionado(false), 6000);
    } catch {
      mostrar('Não foi possível adicionar o programa às aplicações.', 'erro');
    } finally {
      setOcupado(false);
    }
  }

  const status = prazoStatus(opp);
  const nivel = opp.compatibility?.level ?? null;
  const motivos = opp.compatibility?.reasons || [];
  const ressalvas = opp.compatibility?.warnings || [];
  const notas = opp.compatibility?.notes || [];

  const custo = textoCusto(opp);
  const bolsa = textoBolsa(opp);
  const taxa = textoCusto({ program_cost: opp.application_fee, currency: opp.currency });

  // O acento aparece uma vez por cartão: no dinheiro (custo com bolsa) ou na
  // compatibilidade alta — nunca nos dois (regra do moodboard v3).
  const grifarCusto = Boolean(custo && custo !== 'gratuito' && bolsa);
  const destacarCompatibilidade = !grifarCusto && nivel === 'Alta';

  const local = textoLocalizacao(opp);
  const anos = textoAnos(opp);
  const dados = [opp.type, local, opp.country, anos].filter(Boolean).map(String);
  const seletividade = rotuloSeletividade(opp);

  const observacoes = [];
  if (seletividade) observacoes.push(`Seletividade: ${seletividade.toLowerCase()}`);
  notas.slice(0, 2).forEach((nota) => observacoes.push(String(nota)));

  const verificada = opp.last_verified
    ? `VERIFICADA ${formatarData(opp.last_verified)}`
    : opp.verification_status === 'verified'
      ? 'VERIFICADA'
      : 'EM VERIFICAÇÃO';

  const temFicha = Boolean(nivel || motivos.length || ressalvas.length || observacoes.length);
  const rotuloFicha = nivel === 'Baixa' ? 'ATENÇÃO' : 'POR QUE COMBINA';
  const url = opp.official_url || null;

  return (
    <article className="cartao">
      {aviso && (
        <p className={`cartao-aviso ${aviso.tipo === 'erro' ? 'cartao-aviso--erro' : 'cartao-aviso--ok'}`} role="status">
          {aviso.texto}
        </p>
      )}

      <div className="cartao-topo">
        <span className="cartao-verif">{verificada}</span>
        <span className="tag-status">
          <i className={`dot ${status.dot}`} aria-hidden="true" />
          {status.rotulo.toUpperCase()}
        </span>
      </div>

      <h3 className="cartao-nome">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">{opp.name || 'Programa sem nome'}</a>
        ) : (
          opp.name || 'Programa sem nome'
        )}
      </h3>

      {opp.provider && <p className="cartao-prov">{opp.provider}</p>}

      {dados.length > 0 && <p className="cartao-dados">{dados.join(' · ')}</p>}

      {(custo || bolsa || taxa) && (
        <p className="cartao-custo">
          {custo && <>Custo {grifarCusto ? <Grifo>{custo}</Grifo> : <strong>{custo}</strong>}</>}
          {bolsa && <>{custo ? ' — ' : 'Com '}{bolsa}</>}
          {taxa && <>{custo || bolsa ? ' · taxa de inscrição ' : 'Taxa de inscrição '}{taxa}</>}
        </p>
      )}

      {temFicha && (
        <div className="cartao-motivos">
          <span className={`motivos-rotulo${destacarCompatibilidade ? ' motivos-rotulo--acento' : ''}`}>
            {rotuloFicha}{nivel ? ` · COMPATIBILIDADE ${nivel.toUpperCase()}` : ''}
          </span>

          {motivos.slice(0, 3).map((motivo, i) => (
            <p key={`m-${i}`} className="motivo">
              <i className="dot dot--lacre" aria-hidden="true" />
              <span>{motivo}</span>
            </p>
          ))}

          {ressalvas.slice(0, 2).map((ressalva, i) => (
            <p key={`r-${i}`} className="motivo motivo--alerta">
              <i className="dot dot--vermelho" aria-hidden="true" />
              <span>{ressalva}</span>
            </p>
          ))}

          {observacoes.map((nota, i) => (
            <p key={`n-${i}`} className="motivo motivo--nota">
              <i className="dot dot--tinta" aria-hidden="true" />
              <span>{nota}</span>
            </p>
          ))}
        </div>
      )}

      <div className="cartao-rodape">
        <div className="cartao-base">
          {/* o prazo só aparece aqui quando existe: sem data, o topo já diz tudo */}
          <span className="prazo-mono">{status.data ? status.rotuloMono : ''}</span>
          {url && (
            <a className="btn-secundario" href={url} target="_blank" rel="noopener noreferrer">
              Ver programa ↗
            </a>
          )}
        </div>

        <div className="cartao-acoes">
          <button
            type="button"
            className={`btn-secundario${salvo ? ' salvo' : ''}`}
            onClick={handleSave}
            disabled={ocupado}
            aria-pressed={salvo}
          >
            {salvo ? 'Salvo' : 'Salvar'}
          </button>
          <button type="button" className="btn-primario" onClick={handleAdd} disabled={ocupado}>
            {ocupado ? 'Aguarde...' : adicionado ? 'Nas aplicações' : 'Adicionar às aplicações'}
          </button>
        </div>
      </div>
    </article>
  );
}
