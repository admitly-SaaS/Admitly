'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase.js';
import { temAssinaturaAtiva } from '@/lib/subscriptions.js';
import { calcularMatches, filterOpportunities } from '@/lib/matching.js';
import { bateBusca } from '@/lib/busca.js';
import { formatarData, diasAte, prazoStatus } from '@/lib/prazos.js';
import { carregarSnapshot, salvarSnapshot, calcularRadar } from '@/lib/radar.js';
import { listarDescartes } from '@/lib/radar-descartes.js';
import { sincronizarFavoritos } from '@/lib/sync-favoritos.js';
import OppCard from '../components/opp-card';
import RadarCard from '../components/radar-card';

// Catálogo no design v3: cartões-papel com letterhead de linha, prazo em mono
// e o acento reservado para dinheiro (grifo do custo) e compatibilidade.
const FILTROS = [
  { valor: 'Todas', rotulo: 'Todas' },
  { valor: 'Compatíveis', rotulo: 'Compatíveis' },
  { valor: 'Grátis', rotulo: 'Grátis' },
  { valor: 'Com bolsa', rotulo: 'Com bolsa' },
  { valor: 'Online', rotulo: 'Online' },
  { valor: 'Presencial', rotulo: 'Presencial' },
  { valor: 'Prazo próximo', rotulo: 'Prazo próximo' },
];

const ORDENS = [
  { valor: 'compatibilidade', rotulo: 'Compatibilidade' },
  { valor: 'prazo', rotulo: 'Prazo' },
];

const ESCUDO = (
  <svg className="marca-mini-escudo" viewBox="-60 -74 120 158" role="img" aria-label="Escudo Admitly">
    <path d="M-56 -70 L56 -70 L56 5 C56 45 28 68 0 80 C-28 68 -56 45 -56 5 Z" fill="#F6F2EA" stroke="#1F3A5F" strokeWidth="5.5" />
    <g transform="translate(0 -10) scale(1.02)">
      <polygon points="-39,-9 39,-9 0,-36" fill="#1F3A5F" />
      <rect x="-35" y="-6" width="70" height="4.5" fill="#1F3A5F" />
      <rect x="-29" y="-1.5" width="10" height="25" fill="#1F3A5F" />
      <rect x="-5" y="-1.5" width="10" height="25" fill="#1F3A5F" />
      <rect x="19" y="-1.5" width="10" height="25" fill="#1F3A5F" />
      <rect x="-36" y="23.5" width="72" height="4" fill="#1F3A5F" />
      <rect x="-40" y="27.5" width="80" height="4.5" fill="#1F3A5F" />
    </g>
  </svg>
);

// traço de tinteiro + filtro de tinta imperfeita: usados pelos grifos dos cartões
// (mesma definição provada em /login e /welcome)
function DefsTraco() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id="tinta">
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" result="ruido" />
        <feDisplacementMap in="SourceGraphic" in2="ruido" scale="1.4" />
      </filter>
      <symbol id="traco-tinteiro" viewBox="0 0 100 8" preserveAspectRatio="none">
        <path d="M2 5.2 C 22 3.2, 46 6.4, 68 4.2 S 92 2.8, 98 3.6" strokeWidth={2.4} fill="none" strokeLinecap="round" />
        <path d="M8 6 C 30 4.8, 58 7, 92 5" strokeWidth={1} fill="none" strokeLinecap="round" opacity={0.55} />
      </symbol>
    </svg>
  );
}

function Topo({ menuAberto, setMenuAberto, sair }) {
  return (
    <header className="opps-topo">
      <div className="marca-mini">
        {ESCUDO}
        <span>Admitly</span>
      </div>

      <nav className="opps-nav">
        <a href="/oportunidades" className="ativo" aria-current="page">Oportunidades</a>
        <a href="/aplicacoes">Aplicações</a>
        <a href="/redacoes">Redações</a>
        <a href="/extracurriculares">Extracurriculares</a>
        <a href="/perfil">Perfil</a>
        <a href="/chat">Voltar ao chat</a>
        <div className="menu-conta">
          <button
            type="button"
            className="btn-conta"
            onClick={() => setMenuAberto((v) => !v)}
            aria-label="Menu da conta"
            aria-expanded={menuAberto}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
          {menuAberto && (
            <>
              <button type="button" className="menu-scrim" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} />
              <div className="menu-popover" role="menu">
                <a href="/perfil" role="menuitem">Meu perfil acadêmico</a>
                <button type="button" role="menuitem" className="menu-sair" onClick={sair}>Sair da conta</button>
              </div>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

// O Radar: "o que mudou desde a última vez que você abriu". Sem novidade,
// sem aviso — o painel nem aparece (a não ser dobrado para reabrir).
function Radar({ radar, radarAtivo, setRadarAtivo, userId, onResolvido, onFavoriteChange }) {
  if (radar.primeiraVisita) {
    return (
      <section className="radar" aria-label="Radar de novidades">
        <div className="radar-cabecalho">
          <span className="caps-sec">Novidades para você</span>
        </div>
        <p className="radar-silencio mono-linha">
          PRIMEIRA VISITA — DA PRÓXIMA VEZ ESTE ESPAÇO MOSTRA SÓ O QUE MUDOU.
        </p>
      </section>
    );
  }

  if (radar.itens.length === 0) {
    if (!radarAtivo) return null; // sem novidade, sem aviso
    return (
      <section className="radar" aria-label="Radar de novidades">
        <div className="radar-cabecalho">
          <span className="caps-sec">Novidades para você</span>
          <button
            type="button"
            className="radar-fechar"
            onClick={() => setRadarAtivo(false)}
            aria-label="Fechar o radar"
          >
            ×
          </button>
        </div>
        <p className="radar-silencio mono-linha">NADA MUDOU DESDE SUA ÚLTIMA VISITA.</p>
      </section>
    );
  }

  return (
    <section className="radar" aria-label="Radar de novidades">
      <div className="radar-cabecalho">
        <span className="caps-sec">Novidades para você</span>
        <span className="mono-linha">{radar.itens.length} DESDE SUA ÚLTIMA VISITA</span>
      </div>
      <div className="radar-lista">
        {radar.itens.map((item) => (
          <RadarCard
            key={`${item.tipo}-${item.opp.id}`}
            item={item}
            userId={userId}
            onResolvido={onResolvido}
            onFavoriteChange={onFavoriteChange}
          />
        ))}
      </div>
    </section>
  );
}

export default function Oportunidades() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [opps, setOpps] = useState([]);
  const [favoritos, setFavoritos] = useState(new Set());
  // Reações do Radar (radar_descartes de lib/radar-descartes.js): mapa
  // opportunity_id → 'descartado' | 'feito'. Vazio até o load/devolver.
  const [descartes, setDescartes] = useState(() => new Map());
  // Múltiplos filtros ('Todas' desmarca tudo e é exclusivo): Set de valores
  // que casam com OU pela lib de matching. Carregamos como ['Todas'] (vazio =
  // nada filtrado) e cada chip vira toggle independente.
  const [filtro, setFiltro] = useState(() => new Set());
  const [busca, setBusca] = useState('');
  const [ordenar, setOrdenar] = useState('compatibilidade');
  const [carregando, setCarregando] = useState(true);
  const [semSessao, setSemSessao] = useState(false);
  const [erro, setErro] = useState(null);
  const [menuAberto, setMenuAberto] = useState(false);
  // Radar: snapshot da última visita, semeado no callback do load.
  const [snapshot, setSnapshot] = useState(null);
  const [resolvidos, setResolvidos] = useState(() => new Set());
  const [radarAtivo, setRadarAtivo] = useState(true);
  const carregouRef = useRef(false);

  useEffect(() => {
    let ativo = true;

    const relogio = setTimeout(() => {
      if (ativo && !carregouRef.current) {
        setErro('O carregamento demorou demais. Recarregue a página e tente de novo.');
        setCarregando(false);
      }
    }, 12000);

    supabase.auth
      .getUser()
      .then(async ({ data, error: erroAuth }) => {
        if (!ativo) return;

        if (erroAuth) {
          console.warn('auth.getUser error', erroAuth);
          carregouRef.current = true;
          setErro('Não foi possível verificar sua sessão. Entre de novo para continuar.');
          setCarregando(false);
          return;
        }

        const userData = data?.user ?? null;
        setUsuario(userData);

        if (!userData) {
          carregouRef.current = true;
          setSemSessao(true);
          setCarregando(false);
          router.push('/login');
          return;
        }

        // Assinatura obrigatória, como no /chat: sem ela, vai direto para o paywall.
        const ativa = await temAssinaturaAtiva(supabase, userData.id);
        if (!ativa) {
          carregouRef.current = true;
          setCarregando(false);
          router.push('/assinar');
          return;
        }

        Promise.all([
          supabase.from('opportunities').select('*'),
          supabase.from('favorites').select('opportunity_id').eq('user_id', userData.id),
          // Reações do Radar ("Não faz sentido" / "Já fiz"): degrada em vazio
          // quando a migration do radar_descartes ainda não rodou.
          listarDescartes(userData.id, supabase),
        ])
          .then(([resOpps, resFav, resDesc]) => {
            if (!ativo) return;

            // O perfil acadêmico é salvo no user_metadata pelo /perfil,
            // não em uma tabela separada. Adaptamos os campos em pt-BR
            // para o formato que o matching lê.
            const meta = userData.user_metadata?.perfil_academico ?? null;
            setPerfil(adaptarPerfil(meta));

            const cruas = (resOpps.data || []).map((opp) => ({
              ...opp,
              areas: Array.isArray(opp.areas) ? opp.areas : [],
            }));

            setOpps(cruas);
            setFavoritos(new Set((resFav.data || []).map((f) => f.opportunity_id)));
            setDescartes(resDesc.descartes || new Map());

            // Radar: semeia o snapshot ANTES do primeiro render com dados, no
            // mesmo callback do load (não no corpo de um effect).
            setSnapshot(carregarSnapshot(window.localStorage));

            carregouRef.current = true;
            setCarregando(false);
          })
          .catch((err) => {
            if (!ativo) return;
            console.warn('load data error', err);
            carregouRef.current = true;
            setErro('Não foi possível carregar o acervo agora. Tente de novo.');
            setCarregando(false);
          });
      })
      .catch((err) => {
        if (!ativo) return;
        console.warn('auth user error', err);
        carregouRef.current = true;
        setErro('Não foi possível verificar sua sessão. Entre de novo para continuar.');
        setCarregando(false);
      });

    return () => {
      ativo = false;
      clearTimeout(relogio);
    };
  }, [router]);

  // Compatibilidade calculada na renderização, não em effect: é valor derivado
  // de (opps, perfil) — guardar em state custaria um segundo render por carga.
  // calcularMatches (= prepareOpportunities em lib/matching.js) espera
  // (oportunidades, perfil), nessa ordem.
  const matcheados = useMemo(() => {
    if (!usuario || !opps.length) return [];
    const comReacao = (opp) => ({
      ...opp,
      // reação persistida do Radar ('descartado'|'feito'|undefined): sinal
      // vivo para o matching e para a ordenação da página.
      descarte: descartes.get(String(opp.id)) || undefined,
    });
    return perfil
      ? calcularMatches(opps.map(comReacao), perfil)
      : opps.map((o) => ({ ...comReacao(o), compatibility: null }));
  }, [usuario, opps, perfil, descartes]);

  const sair = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // ---- Radar: o que mudou desde a última visita ---------------------------
  // O snapshot é lido UMA vez, no carregamento do acervo (callback async do
  // load): as novidades ficam fixas enquanto a aba está aberta — resolver um
  // cartão não muda o diff, é um boletim, não um borrador. O snapshot novo
  // só é gravado ao sair da página, então a próxima visita compara contra
  // ESTE momento.

  // O diff é valor derivado de (matcheados, snapshot): useMemo, não effect.
  const radar = useMemo(() => {
    const bruto = calcularRadar(matcheados, snapshot, favoritos);
    return { ...bruto, itens: bruto.itens.filter((item) => !resolvidos.has(item.opp.id)) };
  }, [matcheados, snapshot, favoritos, resolvidos]);

  useEffect(() => {
    if (!opps.length) return undefined;
    // grava o snapshot na saída: a próxima visita compara contra ESTE
    // momento, já incluindo tudo que o usuário viu hoje.
    const gravar = () => salvarSnapshot(window.localStorage, opps);
    // pagehide cobre navegação real (<a href>) e fechamento de aba: o cleanup
    // do React não roda de forma confiável durante o unload do documento.
    window.addEventListener('pagehide', gravar);
    return () => {
      window.removeEventListener('pagehide', gravar);
      // unmount SPA (navegação interna por router): grava aqui também.
      gravar();
    };
  }, [opps]);

  // Favorito mudou em qualquer cartão (Radar ou catálogo): a página é a fonte
  // da verdade e todos os cartões acompanham o Set — sem recarregar.
  const mudarFavorito = (opportunityId, agoraSalvo) => {
    setFavoritos((atual) => {
      const proximo = new Set(atual);
      if (agoraSalvo) proximo.add(opportunityId);
      else proximo.delete(opportunityId);
      return proximo;
    });
  };

  // Ref estável do callback: o canal do Realtime é inscrito UMA vez por
  // sessão (evita re-subscrições por render) e lê o callback sempre fresco.
  const refMudarFavorito = useRef(mudarFavorito);
  useEffect(() => {
    refMudarFavorito.current = mudarFavorito;
  }, [mudarFavorito]);

  // Sync de favoritos entre abas (Supabase Realtime, postgres_changes): uma
  // aba nova/estreita injeta favoritos do banco direto no Set desta aba.
  // O canal usa o filtro user_id=eq.<id> — só chega o que é do aluno (RLS é
  // a barreira de verdade; o filtro só poupa rede). Sem realtime disponível
  // a aba funciona como antes: nunca é dependência crítica.
  useEffect(() => {
    if (!usuario?.id) return undefined;
    return sincronizarFavoritos(supabase, usuario.id, (id, salvo) => refMudarFavorito.current(id, salvo));
  }, [usuario?.id]);

  const resolverRadar = (item) => {
    setResolvidos((atual) => {
      const proximo = new Set(atual);
      proximo.add(item.opp.id);
      return proximo;
    });
  };

  const acervo = useMemo(() => {
    const ultima = opps.reduce((acc, o) => (o.last_verified && (!acc || o.last_verified > acc) ? o.last_verified : acc), null);
    return { total: opps.length, ultima };
  }, [opps]);

  const temBusca = busca.trim().length > 0;
  const semPerfil = !perfil;
  const modoOrdem = semPerfil ? 'prazo' : ordenar;

  const visiveis = useMemo(() => {
    const filtrosAtivos = filtro.size ? Array.from(filtro) : 'Todas';
    const filtradas = matcheados.filter(
      (opp) => filterOpportunities([opp], filtrosAtivos, perfil).length > 0 && bateBusca(opp, busca)
    );
    // Programas com inscrição encerrada (ou sem data) nunca abrem a lista:
    // o que dá para aplicar agora vem primeiro, em qualquer modo de ordenação.
    const abertos = filtradas.filter((opp) => prazoStatus(opp).tipo !== 'encerrada' && opp.application_deadline);
    const fechados = filtradas.filter((opp) => !abertos.includes(opp));
    const abertosOrdenados = modoOrdem === 'prazo' ? [...abertos].sort(porPrazo) : abertos;
    const fechadosOrdenados = modoOrdem === 'prazo' ? [...fechados].sort(porPrazo) : fechados;
    return [...abertosOrdenados, ...fechadosOrdenados];
  }, [matcheados, filtro, perfil, busca, modoOrdem]);

  const limparFiltros = () => {
    setBusca('');
    setFiltro(new Set());
  };

  return (
    <main className="opps-pagina">
      <style>{CSS}</style>
      <DefsTraco />
      <Topo menuAberto={menuAberto} setMenuAberto={setMenuAberto} sair={sair} />

      {erro ? (
        <div className="opps-folha">
          <div className="opps-painel" role="alert">
            <p className="opps-painel-titulo">{erro}</p>
            <p className="opps-painel-texto">
              Se o problema continuar, recarregue a página ou entre de novo na sua conta.
            </p>
            <div className="opps-painel-acoes">
              <button type="button" className="btn-secundario" onClick={() => window.location.reload()}>
                Recarregar
              </button>
              <a className="btn-link" href="/login">Ir para o login</a>
            </div>
          </div>
        </div>
      ) : carregando || semSessao ? (
        <div className="opps-folha">
          <p className="carregando">
            {semSessao ? 'Levando você para o login...' : 'Carregando o acervo...'}
          </p>
        </div>
      ) : (
        <div className="opps-folha">
          <header className="opps-cabecalho">
            <span className="caps-sec">Catálogo verificado</span>
            <h1>Seu acervo de <em>oportunidades</em>.</h1>
            <p className="opps-intro">
              Olimpíadas, pesquisas e programas de verão com prazo, custo e chance real —
              filtrados pelo seu momento. O que combina com você vem primeiro.
            </p>
            <p className="opps-meta">
              <span>{acervo.total} {acervo.total === 1 ? 'PROGRAMA' : 'PROGRAMAS'} NO ACERVO</span>
              {acervo.ultima && <span>ÚLTIMA VERIFICAÇÃO: {formatarData(acervo.ultima)}</span>}
            </p>
            {/* Incentivo de retorno (feedback de usuários 15/10): prometer cadência,
                sem prometer dia exato — o acervo é revisado semanalmente e o que
                mudou aparece no Radar e no digest semanal por e-mail. */}
            <p className="opps-cadencia mono-linha">
              NOVIDADES TODA SEMANA — O QUE MUDOU APARECE NO RADAR ABAIXO E NO RESUMO SEMANAL POR E-MAIL
            </p>
          </header>

          <Radar
            radar={radar}
            radarAtivo={radarAtivo}
            setRadarAtivo={setRadarAtivo}
            userId={usuario.id}
            onResolvido={resolverRadar}
            onFavoriteChange={mudarFavorito}
          />

          <div className="opps-controles">
            <div className="campo-busca">
              <label className="caps-sec" htmlFor="busca-acervo">Buscar no acervo</label>
              <div className="busca-caixa">
                <svg className="busca-lupa" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.6-3.6" />
                </svg>
                <input
                  id="busca-acervo"
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="nome, área, país ou tipo — ex.: cs, bio, Stanford"
                  autoComplete="off"
                  spellCheck={false}
                />
                {temBusca && (
                  <button type="button" className="busca-limpar" onClick={() => setBusca('')} aria-label="Limpar busca">
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="chips">
              <span className="caps-sec">Filtros</span>
              <div className="chips-linha">
                {FILTROS.map((f) => {
                  if (f.valor === 'Todas') {
                    return (
                      <button
                        key={f.valor}
                        type="button"
                        className={`chip ${filtro.size === 0 ? 'ativo' : ''}`}
                        aria-pressed={filtro.size === 0}
                        onClick={() => setFiltro(new Set())}
                      >
                        {f.rotulo}
                      </button>
                    );
                  }
                  const ativo = filtro.has(f.valor);
                  return (
                    <button
                      key={f.valor}
                      type="button"
                      className={`chip ${ativo ? 'ativo' : ''}`}
                      aria-pressed={ativo}
                      disabled={f.valor === 'Compatíveis' && semPerfil}
                      title={
                        f.valor === 'Compatíveis' && semPerfil
                          ? 'Preencha seu perfil para calcular compatibilidade'
                          : undefined
                      }
                      onClick={() =>
                        setFiltro((atual) => {
                          const proximo = new Set(atual);
                          if (proximo.has(f.valor)) proximo.delete(f.valor);
                          else proximo.add(f.valor);
                          return proximo;
                        })
                      }
                    >
                      {f.rotulo}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="opps-resumo">
            <span className="mono-linha">
              {visiveis.length === 0
                ? 'NENHUM PROGRAMA'
                : `${visiveis.length} DE ${acervo.total} ${visiveis.length === 1 ? 'PROGRAMA' : 'PROGRAMAS'}`}
              {temBusca ? ` · BUSCA: ${busca.trim().toUpperCase()}` : ''}
              {filtro.size ? ` · ${filtro.size} ${filtro.size === 1 ? 'FILTRO' : 'FILTROS'}` : ''}
            </span>
            <div className="ordenar" role="group" aria-label="Ordenar resultados">
              <span className="caps-sec">Ordem</span>
              <div className="ordenar-linha">
                {ORDENS.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    className={modoOrdem === o.valor ? 'ativo' : ''}
                    aria-pressed={modoOrdem === o.valor}
                    disabled={o.valor === 'compatibilidade' && semPerfil}
                    onClick={() => setOrdenar(o.valor)}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {semPerfil && (
            <div className="opps-painel opps-painel--acao">
              <p className="opps-painel-titulo">Seu perfil ainda está em branco.</p>
              <p className="opps-painel-texto">
                Sem ele, você navega pelo catálogo inteiro — mas sem compatibilidade calculada
                nem ordem personalizada. São nove campos, dois minutos.
              </p>
              <div className="opps-painel-acoes">
                <a className="btn-primario" href="/perfil">Preencher meu perfil</a>
              </div>
            </div>
          )}

          {visiveis.length === 0 ? (
            <div className="opps-painel">
              <p className="opps-painel-titulo">
                {temBusca ? 'Nada encontrado para essa busca.' : 'Nenhum programa para este filtro.'}
              </p>
              <p className="opps-painel-texto">
                {temBusca
                  ? 'Tente outro termo (ex.: “olimpíada”, “Stanford”, “grátis”) ou limpe a busca.'
                  : 'Escolha outro filtro — ou veja o acervo inteiro de novo.'}
              </p>
              <div className="opps-painel-acoes">
                <button type="button" className="btn-secundario" onClick={limparFiltros}>
                  {temBusca ? 'Limpar busca' : 'Ver todas'}
                </button>
              </div>
            </div>
          ) : (
            <div className="opps-grade">
              {visiveis.map((opp) => (
                <OppCard
                  key={opp.id}
                  opp={opp}
                  isFavorite={favoritos.has(opp.id)}
                  userId={usuario.id}
                  onFavoriteChange={mudarFavorito}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

// ---------- dados ----------

function converterAnoEscolar(ano) {
  const mapa = {
    '8º ano do ensino fundamental': '8th',
    '9º ano do ensino fundamental': '9th',
    '1º ano do ensino médio': '9th',
    '2º ano do ensino médio': '10th',
    '3º ano do ensino médio': '11th',
    'já concluí o ensino médio': '12th',
  };
  return mapa[ano] || null;
}

// Adapta o perfil_academico (user_metadata) para o formato do matching.
// budget vai como texto original: o matching extrai o número e detecta a moeda
// (ex.: "R$ 80 mil por ano" → 80000 BRL).
function adaptarPerfil(meta) {
  if (!meta) return null;
  return {
    school_year: converterAnoEscolar(meta.anoEscolar),
    area: meta.areaInteresse ?? null,
    budget: meta.orcamento ?? null,
    country_preference: meta.paisPreferencia ?? null,
    goals: meta.objetivo ?? null,
  };
}

// Prazo mais próximo primeiro; encerradas e sem data vão para o fim.
function porPrazo(a, b) {
  const da = diasAte(a.application_deadline);
  const db = diasAte(b.application_deadline);
  const semPrazo = Number.POSITIVE_INFINITY;
  const va = da == null || da < 0 ? semPrazo : da;
  const vb = db == null || db < 0 ? semPrazo : db;
  if (va !== vb) return va - vb;
  return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');

.opps-pagina{
  --papel:#F6F2EA; --papel-elev:#FCFAF5; --tinta:#191512; --tinta-sec:#5C554B; --hairline:#E2DACB;
  --lacre:#1A4D3A; --vermelho:#A6301F; --acento:#1F3A5F;
  --serif:'Instrument Serif',Georgia,serif; --corpo:'Libre Caslon Text',Georgia,serif;
  --sans:'Instrument Sans','Helvetica Neue',sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  min-height:100vh; background:var(--papel); color:var(--tinta);
  font-family:var(--corpo); -webkit-font-smoothing:antialiased;
}
.opps-pagina h1, .opps-pagina p{ margin:0; }

.caps-sec{
  font-family:var(--sans); text-transform:uppercase; letter-spacing:.16em;
  font-size:11px; font-weight:600; color:var(--tinta-sec);
}
.mono-linha{ font-family:var(--mono); font-size:11px; letter-spacing:.08em; color:var(--tinta-sec); }

.carregando{
  padding:64px 0; text-align:center;
  font-family:var(--mono); font-size:12px; letter-spacing:.08em; color:var(--tinta-sec);
}

/* ===== topo (mesma anatomia de /chat e /perfil) ===== */
.opps-topo{
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:14px 24px; border-bottom:1px solid var(--hairline); background:var(--papel);
}
.marca-mini{ display:flex; align-items:center; gap:10px; }
.marca-mini-escudo{ width:22px; height:auto; }
.marca-mini span{
  font-family:var(--sans); font-weight:600; font-size:12px;
  text-transform:uppercase; letter-spacing:.18em; color:var(--acento);
}
.opps-nav{ display:flex; align-items:center; gap:20px; }
.opps-nav > a{ font:600 13px/1 var(--sans); color:var(--tinta-sec); text-decoration:none; }
.opps-nav > a:hover{ color:var(--acento); }
.opps-nav > a.ativo{ color:var(--acento); }
.menu-conta{ position:relative; }
.btn-conta{
  width:30px; height:30px; border-radius:50%; border:1px solid var(--hairline);
  background:var(--papel-elev); color:var(--tinta-sec); cursor:pointer;
  display:grid; place-items:center; transition:border-color .15s ease, color .15s ease;
}
.btn-conta:hover{ border-color:var(--acento); color:var(--acento); }
.menu-scrim{ position:fixed; inset:0; z-index:20; background:transparent; border:0; cursor:default; }
.menu-popover{
  position:absolute; top:38px; right:0; z-index:30; min-width:190px;
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:4px; overflow:hidden;
}
.menu-popover a, .menu-sair{
  display:block; width:100%; padding:11px 16px; text-align:left;
  font:600 13px/1 var(--sans); color:var(--tinta); text-decoration:none;
  border:0; background:transparent; cursor:pointer;
}
.menu-popover a:hover, .menu-sair:hover{ background:rgba(31,58,95,.06); }
.menu-sair{ color:var(--vermelho) !important; }

/* ===== folha ===== */
.opps-folha{ max-width:1080px; margin:0 auto; padding:44px 28px 80px; }

.opps-cabecalho h1{ font:400 46px/1.08 var(--serif); letter-spacing:-.005em; margin-top:12px; }
.opps-cabecalho h1 em{ font-style:italic; }
.opps-intro{ margin-top:16px; font-size:16.5px; line-height:1.75; color:var(--tinta-sec); max-width:56ch; }
.opps-meta{
  margin-top:24px; padding-top:14px; border-top:1px solid var(--tinta);
  display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap;
  font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; color:var(--tinta-sec);
}
.opps-cadencia{ margin-top:14px; }

/* ===== radar (o que mudou desde a última visita) ===== */
.radar{ margin-top:30px; padding:20px 22px 18px;
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:6px; }
.radar-cabecalho{ display:flex; align-items:baseline; justify-content:space-between; gap:14px;
  padding-bottom:12px; border-bottom:1px solid var(--tinta); }
.radar-fechar{ flex:none; width:24px; height:24px; display:grid; place-items:center;
  border:1px solid var(--hairline); border-radius:50%; background:transparent;
  color:var(--tinta-sec); cursor:pointer; font:400 14px/1 var(--sans); }
.radar-fechar:hover{ border-color:var(--tinta-sec); color:var(--tinta); }
.radar-silencio{ padding:14px 0 2px; }
.radar-lista{ margin-top:16px; display:flex; flex-direction:column; gap:14px; }
.radar-cartao{ padding:18px 20px 16px; background:var(--papel);
  border:1px solid var(--hairline); border-radius:4px; }
.radar-cartao .cartao-nome{ margin-top:10px; font-size:23px; }
.radar-rotulo{ font-family:var(--mono); font-size:10.5px; letter-spacing:.1em;
  text-transform:uppercase; color:var(--lacre); }
.radar-rotulo--prazo{ color:var(--vermelho); }
.radar-porque{ margin-top:8px; font-size:14.5px; line-height:1.65; color:var(--tinta-sec); max-width:56ch; }
.radar-porque em{ font-family:var(--corpo); font-style:italic; color:var(--tinta); }
.radar-acoes{ margin-top:14px; display:flex; gap:10px; flex-wrap:wrap; }
.radar-btn{ padding:9px 14px; font-size:12.5px; }
.radar-btn.salvo{ border-color:var(--lacre); color:var(--lacre); }
@media (max-width:640px){
  .radar{ padding:16px 14px 14px; }
  .radar-btn{ padding:12px 16px; font-size:13.5px; }
}

/* ===== controles ===== */
.opps-controles{ margin-top:34px; display:flex; flex-direction:column; gap:22px; }
.campo-busca{ display:flex; flex-direction:column; gap:7px; max-width:560px; }
.busca-caixa{
  display:flex; align-items:center; gap:10px;
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:4px;
  padding:11px 14px; transition:border-color .15s ease;
}
.busca-caixa:focus-within{ border-color:var(--lacre); }
.busca-lupa{ flex:none; color:var(--tinta-sec); }
.busca-caixa input{
  flex:1; min-width:0; border:0; outline:none; background:transparent;
  font:400 15.5px var(--corpo); color:var(--tinta);
}
.busca-caixa input::placeholder{ color:#B4AB9C; }
.busca-caixa input::-webkit-search-cancel-button{ display:none; }
.busca-limpar{
  flex:none; width:22px; height:22px; display:grid; place-items:center;
  border:1px solid var(--hairline); border-radius:50%; background:transparent;
  color:var(--tinta-sec); cursor:pointer; font:400 14px/1 var(--sans);
}
.busca-limpar:hover{ border-color:var(--tinta-sec); color:var(--tinta); }

.chips{ display:flex; flex-direction:column; gap:10px; }
.chips-linha{ display:flex; flex-wrap:wrap; gap:8px; }
.chip{
  font:600 13px/1 var(--sans); padding:9px 15px; border-radius:3px; cursor:pointer;
  border:1px solid var(--hairline); background:var(--papel-elev); color:var(--tinta);
  transition:border-color .15s ease, background-color .15s ease, color .15s ease;
}
.chip:hover{ border-color:var(--acento); }
.chip.ativo{ background:var(--tinta); border-color:var(--tinta); color:var(--papel-elev); }
.chip:disabled{ opacity:.4; cursor:not-allowed; }

/* ===== resumo + ordem ===== */
.opps-resumo{
  margin-top:28px; padding-top:14px; border-top:1px solid var(--hairline);
  display:flex; align-items:center; justify-content:space-between; gap:18px; flex-wrap:wrap;
}
.ordenar{ display:flex; align-items:center; gap:10px; }
.ordenar-linha{ display:flex; border:1px solid var(--hairline); border-radius:3px; overflow:hidden; }
.ordenar-linha button{
  font:500 10.5px/1 var(--mono); letter-spacing:.1em; text-transform:uppercase;
  padding:7px 11px; border:0; cursor:pointer; background:var(--papel-elev); color:var(--tinta-sec);
}
.ordenar-linha button + button{ border-left:1px solid var(--hairline); }
.ordenar-linha button.ativo{ background:var(--tinta); color:var(--papel-elev); }
.ordenar-linha button:disabled{ opacity:.4; cursor:not-allowed; }

/* ===== painéis (erro, vazio, sem perfil) ===== */
.opps-painel{
  margin-top:26px; max-width:640px; padding:34px 32px 30px;
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:6px;
}
.opps-painel--acao{ border-left:3px solid var(--acento); }
.opps-painel-titulo{ font:400 24px/1.25 var(--serif); }
.opps-painel-texto{ margin-top:10px; font-size:15.5px; line-height:1.7; color:var(--tinta-sec); max-width:48ch; }
.opps-painel-acoes{ margin-top:22px; display:flex; align-items:center; gap:20px; }

/* ===== botões ===== */
.btn-primario{
  display:inline-block; font:600 15px/1 var(--sans); letter-spacing:.01em;
  padding:13px 24px; border-radius:3px; cursor:pointer; text-decoration:none;
  background:var(--acento); color:var(--papel-elev); border:1px solid var(--acento);
  transition:background-color .15s ease, border-color .15s ease;
}
.btn-primario:hover{ background:#19304E; border-color:#19304E; }
.btn-secundario{
  display:inline-block; font:600 13px/1 var(--sans); padding:10px 16px;
  border-radius:3px; cursor:pointer; text-decoration:none;
  background:transparent; color:var(--tinta); border:1px solid var(--hairline);
  transition:border-color .15s ease, color .15s ease;
}
.btn-secundario:hover{ border-color:var(--acento); color:var(--acento); }
.btn-link{
  font:600 13px/1 var(--sans); color:var(--acento); background:none; border:0; cursor:pointer;
  text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1.5px;
}
.btn-link:hover{ color:#19304E; }

/* ===== dots de status (linguagem do moodboard v3) ===== */
.dot{ display:inline-block; width:8px; height:8px; border-radius:50%; flex:none; }
.dot--lacre{ background:var(--lacre); box-shadow:0 0 0 3px rgba(26,77,58,.14); }
.dot--vazado{ background:transparent; border:1.5px solid var(--tinta-sec); }
.dot--acento{ background:var(--acento); box-shadow:0 0 0 3px rgba(31,58,95,.14); }
.dot--vermelho{ background:var(--vermelho); box-shadow:0 0 0 3px rgba(166,48,31,.14); }
.dot--tinta{ background:var(--tinta-sec); opacity:.45; }

/* ===== grade e cartões (markup em components/opp-card.js) ===== */
.opps-grade{
  margin-top:26px; display:grid;
  grid-template-columns:repeat(2, minmax(0, 1fr)); gap:22px; align-items:stretch;
}

.cartao{
  display:flex; flex-direction:column;
  background:var(--papel-elev); border:1px solid var(--hairline); border-radius:6px;
  padding:22px 26px 20px;
}
.cartao-aviso{ margin-bottom:14px; font-family:var(--mono); font-size:11px; letter-spacing:.04em; }
.cartao-aviso--ok{ color:var(--lacre); }
.cartao-aviso--erro{ color:var(--vermelho); }

.cartao-topo{
  display:flex; align-items:center; justify-content:space-between; gap:14px;
  padding-bottom:14px; border-bottom:1px solid var(--hairline);
  font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; color:var(--tinta-sec);
}.cartao-topo > span:first-child, .cartao-topo .cartao-verif{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tag-status{ display:flex; align-items:center; gap:8px; flex:none; white-space:nowrap; }

@media (max-width:640px){
  /* na tela estreita o topo do cartão quebra em duas linhas em vez de
     empurrar a grade além da largura da tela */
  .cartao-topo{ flex-wrap:wrap; row-gap:6px; }
}

.cartao-nome{ margin-top:18px; font:400 26px/1.15 var(--serif); letter-spacing:-.005em; }
.cartao-nome a{ color:inherit; text-decoration:none; }
.cartao-nome a:hover{ color:var(--acento); }
.cartao-prov{
  margin-top:8px; font-family:var(--mono); font-size:10.5px; letter-spacing:.08em;
  text-transform:uppercase; color:var(--tinta-sec);
}
.cartao-dados{ margin-top:14px; font-size:15.5px; line-height:1.7; }
.cartao-custo{ margin-top:8px; font-size:15.5px; line-height:1.7; color:var(--tinta-sec); }
.cartao-custo strong{ font-weight:400; color:var(--tinta); }

/* o grifo: única aparição do acento no cartão */
.grifo{ position:relative; white-space:nowrap; color:var(--tinta); }
.grifo svg{ position:absolute; left:-2%; bottom:-5px; width:104%; height:8px; overflow:visible; stroke:var(--acento); }

.cartao-motivos{
  margin-top:18px; padding-left:18px; border-left:2px solid var(--hairline);
  display:flex; flex-direction:column; gap:9px;
}
.motivos-rotulo{
  font-family:var(--mono); font-size:10px; letter-spacing:.14em; color:var(--tinta-sec);
  margin-bottom:2px;
}
.motivos-rotulo--acento{ color:var(--acento); }
.motivo{ display:flex; align-items:baseline; gap:10px; font-size:14.5px; line-height:1.6; max-width:44ch; }
.motivo .dot{ margin-top:7px; }
.motivo--alerta{ color:var(--vermelho); }
.motivo--nota{ font-family:var(--mono); font-size:11px; letter-spacing:.03em; color:var(--tinta-sec); }

.cartao-rodape{ margin-top:auto; padding-top:16px; border-top:1px solid var(--hairline); }
.cartao-base{ display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; }
.prazo-mono{ font-family:var(--mono); font-weight:500; font-size:11px; letter-spacing:.07em; color:var(--tinta-sec); }
.cartao-acoes{ margin-top:14px; display:flex; gap:10px; }
.cartao-acoes .btn-secundario{ padding:11px 16px; }
.cartao-acoes .btn-secundario.salvo{ border-color:var(--lacre); color:var(--lacre); }
.cartao-acoes .btn-primario{ flex:1; padding:11px 16px; font-size:14px; text-align:center; }
.cartao-acoes .btn-primario:disabled{ background:#DAD2C2; border-color:#DAD2C2; color:#8F8678; cursor:not-allowed; }

@media (max-width:880px){
  .opps-grade{ grid-template-columns:minmax(0, 1fr); }
  .opps-cabecalho h1{ font-size:36px; }
}
@media (max-width:640px){
  .opps-topo{ padding:6px 16px 2px; gap:2px 8px; flex-wrap:wrap; }
  .opps-nav{ flex:1 1 auto; min-width:0; flex-wrap:wrap; justify-content:space-between; gap:6px 14px; }
  /* alvos de toque: 44px de altura é o mínimo confortável no polegar */
  .opps-nav > a{ font-size:13px; padding:15px 6px; white-space:nowrap; }
  .btn-conta{ width:40px; height:40px; }
  /* marca compacta na linha de cima */
  .marca-mini{ gap:6px; }
  .marca-mini-escudo{ width:18px; }
  .marca-mini span{ font-size:11px; letter-spacing:.12em; }
  .opps-folha{ padding:32px 16px 60px; }
  .cartao{ padding:20px 20px 18px; }
  .chips-linha{ gap:10px; }
  .chip{ font-size:14px; padding:13px 18px; }
  .ordenar-linha button{ font-size:11.5px; padding:12px 14px; }
  /* 16px evita o zoom automático do iOS Safari ao focar o campo */
  .busca-caixa input{ font-size:16px; }
  .busca-caixa{ padding:13px 14px; }
  .busca-limpar{ width:28px; height:28px; }
  .cartao-acoes .btn-secundario{ padding:13px 18px; }
  .cartao-acoes .btn-primario{ padding:13px 16px; font-size:14.5px; }
  .cartao-base .btn-secundario{ padding:13px 18px; }
}
`;
