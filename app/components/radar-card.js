'use client';

import { useState } from 'react';
import { supabase as supabaseClient } from '@/lib/supabase';
import { addFavoriteForUser, removeFavoriteForUser } from '@/lib/favorites.js';
import { gravarDescarte } from '@/lib/radar-descartes.js';
import { prazoStatus, formatarData } from '@/lib/prazos.js';

// Cartão de novidade do Radar (design do mock: "NOVIDADES PARA VOCÊ").
// Diferença essencial para o OppCard: aqui a reação é de 1 toque e alimenta o
// matching — Salvar (vira favorito), "Não faz sentido" (descarte, some do
// Radar e do acervo até a próxima visita) e "Já fiz" (confirmado, some).
//
// O CSS vive em app/oportunidades/page.js (.radar-*, reuso de .btn-*, .dot,
// .grifo), como já acontece com o OppCard (.cartao-*).

// Client compartilhado do app: um por clique disparava o warning de
// GoTrueClient múltiplo (mesma storage key) entre clientes.

function RotuloPrazo({ opp }) {
  const status = prazoStatus(opp);
  if (!status.data) return null;
  return <>{status.rotuloMono}</>;
}

function dataCurta(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return formatarData(d);
}

export default function RadarCard({ item, userId, onResolvido, onFavoriteChange }) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);

  // Mesmo contrato do OppCard: a página é a fonte da verdade para favoritos.
  // item.favorito cobre o caso "o usuário já tinha salvo antes desse programa
  // virar novidade do Radar".
  const salvo = Boolean(item.favorito);

  const mostrar = (texto, tipo = 'ok') => {
    setAviso({ texto, tipo });
    setTimeout(() => setAviso(null), 5000);
  };

    const opp = item.opp;
  const porques = (opp.compatibility?.reasons || []).slice(0, 2);

  async function salvar() {
    setOcupado(true);
    try {
      const { error } = await addFavoriteForUser(userId, opp.id, supabaseClient);
      if (error) throw error;
      onFavoriteChange?.(opp.id, true);
      mostrar('Salvo nos favoritos.');
      // Salvar resolve a novidade: o programa está declarado, não é mais "novo".
      onResolvido?.(item, 'salvo');
    } catch {
      mostrar('Não foi possível salvar o favorito.', 'erro');
    } finally {
      setOcupado(false);
    }
  }

  async function descartar() {
    // "Não faz sentido": a opinião vale como reação de 1 toque. Se o programa
    // já estava favoritado, remove — coerência entre o botão e o estado.
    setOcupado(true);
    try {
      if (salvo || item.favorito) {
        const { error } = await removeFavoriteForUser(userId, opp.id, supabaseClient);
        if (error) throw error;
        onFavoriteChange?.(opp.id, false);
      }
    } catch {
      // o descarte em si nunca deve falhar por causa do favorito
    }
    // A reação persiste para o matching aprender com o que o aluno rejeitou.
    // Falha é silenciosa (migration pendente ou rede): resolver a novidade
    // NUNCA depende de gravar o sigilo — o toque do usuário vale mais.
    gravarDescarte(userId, opp.id, 'descartado', supabaseClient).catch(() => {});
    setOcupado(false);
    onResolvido?.(item, 'descartado');
  }

  async function jaFiz() {
    // "Já fiz": o aluno confirma que já participou/se inscreveu — também é
    // sinal para o matching (não recomendar de novo o que já foi feito).
    gravarDescarte(userId, opp.id, 'feito', supabaseClient).catch(() => {});
    setOcupado(false);
    onResolvido?.(item, 'feito');
  }

  const rotuloTopo =
    item.tipo === 'prazo'
      ? item.antes
        ? `PRAZO ADIADO · ERA ${formatarData(item.antes)}`
        : 'PRAZO MUDOU'
      : 'NOVA';

  return (
    <article className="radar-cartao">
      {aviso && (
        <p className={`cartao-aviso ${aviso.tipo === 'erro' ? 'cartao-aviso--erro' : 'cartao-aviso--ok'}`} role="status">
          {aviso.texto}
        </p>
      )}

      <p className={`radar-rotulo ${item.tipo === 'prazo' ? 'radar-rotulo--prazo' : ''}`}>
        {rotuloTopo}
        {item.tipo === 'novo' && <RotuloPrazo opp={opp} />}
      </p>

      <h3 className="cartao-nome">
        {opp.official_url ? (
          <a href={opp.official_url} target="_blank" rel="noopener noreferrer">{opp.name || 'Programa sem nome'}</a>
        ) : (
          opp.name || 'Programa sem nome'
        )}
      </h3>

      <p className="cartao-prov">
        {[opp.type, opp.country, dataCurta(opp.application_deadline) ? `fecha em ${dataCurta(opp.application_deadline)}` : null]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {porques.length > 0 && (
        <p className="radar-porque">
          <em>Combina com você:</em> {porques.join('; ')}
        </p>
      )}

      <div className="radar-acoes">
        <button type="button" className={`btn-secundario radar-btn${salvo ? ' salvo' : ''}`} onClick={salvar} disabled={ocupado}>
          Salvar
        </button>
        <button type="button" className="btn-secundario radar-btn" onClick={descartar} disabled={ocupado}>
          Não faz sentido
        </button>
        <button
          type="button"
          className="btn-secundario radar-btn"
          onClick={jaFiz}
          disabled={ocupado}
        >
          Já fiz
        </button>
      </div>
    </article>
  );
}
