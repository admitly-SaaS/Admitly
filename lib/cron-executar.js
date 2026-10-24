// lib/cron-executar.js
//
// Os loops de envio, EXTRAÍDOS das rotas cron — que agora só autorizam e
// chamam daqui. Quem também chama é o agendador automático
// (instrumentation.js) — o fluxo é o mesmo, muda só o gatilho:
//
//   rota manual/cron do host → executarDigest({ filtroEmail })
//   agendador interno        → executarDigest()  (todos os usuários)
//
// Sem RLS: coleta de TODOS os alunos via service role (mesma regra já usada
// pelas rotas). Usuário sem conteúdo é suprimido; falha de um não para o lote.

import { createClient } from '@supabase/supabase-js'
import { coletarDadosDoUsuario, catalogo, decidirDigest, alertasDePrazo, alertasDeFavoritos, montarDigestHtml, montarAlertaHtml } from './digest.js'
import { enviarEmail } from './email.js'
import { lerPrefs, devePausar } from './email-prefs.js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ---- usuários (REST admin; padrão do webhook-kiwify) -----------------------

async function listarUsuarios(filtroEmail = null) {
  const url = filtroEmail
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(filtroEmail)}`
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=200&page=1`

  const resposta = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  if (!resposta.ok) return { error: { message: `admin users: ${resposta.status}` }, usuarios: [] }

  const dados = await resposta.json().catch(() => null)
  let usuarios = Array.isArray(dados?.users) ? dados.users : []

  // Sem filtro, segue as páginas até acabar (o filtro vem 1 página só).
  if (!filtroEmail && usuarios.length === 200) {
    for (let page = 2; ; page += 1) {
      const rs = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=200&page=${page}`, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      })
      if (!rs.ok) break
      const rd = await rs.json().catch(() => null)
      const lote = Array.isArray(rd?.users) ? rd.users : []
      if (lote.length === 0) break
      usuarios = usuarios.concat(lote)
      if (lote.length < 200) break
    }
  }

  return { error: null, usuarios: usuarios.filter((u) => u.email) }
}

const primeiroNome = (usuario) => {
  const m = usuario.user_metadata || {}
  const bruto = String(m.nome || m.name || m.full_name || '').trim()
  return bruto.split(/\s+/)[0] || null
}

// Migration digest_foto ausente no painel (PGRST205) degrada para instantâneo
// nulo: o digest sai sem o Δ da semana, nunca quebra por causa dele.
const erroTabelaAusente = (error) =>
  error?.code === 'PGRST205' || /schema cache|Could not find the table/i.test(error?.message || '')

// O instantâneo da segunda ANTERIOR (o insumo do Δ). null = primeira semana ou
// migration ainda não aplicada — as duas coisas dizem "sem comparação".
async function lerInstantaneo(adminClient, userId) {
  if (!userId) return null
  const { data, error } = await adminClient.from('digest_foto').select('foto').eq('user_id', userId).maybeSingle()
  if (error) {
    if (erroTabelaAusente(error)) return null
    console.error('[digest_foto] leitura falhou:', error.message)
    return null
  }
  return data?.foto || null
}

// Grava o instantâneo DESTE digest para o Δ da próxima segunda. Um a menos aqui
// custa pouco: a semana seguinte simplesmente sai sem delta (nada segue
// quebrado). Falhas reais não são engolidas em silêncio.
async function salvarInstantaneo(adminClient, userId, instantaneo) {
  if (!userId || !instantaneo) return
  const { error } = await adminClient
    .from('digest_foto')
    .upsert({ user_id: userId, foto, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error && !erroTabelaAusente(error)) console.error(`[digest_foto] gravação falhou (${userId}):`, error.message)
}

// ---- digest -----------------------------------------------------------------

export async function executarDigest({ filtroEmail = null } = {}) {
  const { error, usuarios } = await listarUsuarios(filtroEmail)
  if (error) return { erroEstrutural: error.message, resumo: null }

  const alvo = filtroEmail
    ? usuarios.filter((u) => String(u.email || '').toLowerCase() === String(filtroEmail).toLowerCase())
    : usuarios

  if (alvo.length === 0) return { erroEstrutural: `usuário não encontrado: ${filtroEmail}`, resumo: null }

  const cat = await catalogo(admin)
  const resumo = { enviados: 0, suprimidos: 0, pausados: 0, falhas: 0, detalhes: [] }

  for (const usuario of alvo) {
    try {
      const { prefs } = await lerPrefs(admin, usuario.id)
      // Pausa (preferências no perfil): o aluno pediu silêncio — só o E-MAIL
      // cessa. Coleta e instantâneo continuam, para o Δ voltar exato quando reativar.
      const pausado = devePausar(prefs, 'digest')

      const coletado = await coletarDadosDoUsuario(admin, usuario.id)
      const instantaneoAnterior = await lerInstantaneo(admin, usuario.id)
      const decisao = decidirDigest(coletado, cat, { instantaneoAnterior })

      if (pausado) {
        resumo.pausados += 1
        resumo.detalhes.push({ email: usuario.email, resultado: 'pausado (preferências do perfil)' })
        await salvarInstantaneo(admin, usuario.id, decisao.instantaneoHoje)
        continue
      }

      if (!decisao.vale) {
        resumo.suprimidos += 1
        resumo.detalhes.push({ email: usuario.email, resultado: 'suprimido (sem conteúdo)' })
        // Instantâneo gravado MESMO suprimido: o Δ da próxima semana parte do mais
        // recente estado conhecido, não da última semana em que houve e-mail.
        await salvarInstantaneo(admin, usuario.id, decisao.instantaneoHoje)
        continue
      }

      const assuntos =
        decisao.prazos.length > 0
          ? `Sua semana no Admitly — ${decisao.prazos[0].university}: ${decisao.prazos[0].dias === 0 ? 'fecha hoje' : decisao.prazos[0].dias === 1 ? 'fecha amanhã' : `faltam ${decisao.prazos[0].dias} dias`}`
          : 'Sua semana no Admitly'

      const { error: erroEnvio } = await enviarEmail({
        to: usuario.email,
        subject: assuntos,
        html: montarDigestHtml({
          primeiroNome: primeiroNome(usuario),
          prazos: decisao.prazos,
          progresso: decisao.progresso,
          catalogo: decisao.catalogo,
          delta: decisao.delta,
        }),
      })
      if (erroEnvio) {
        resumo.falhas += 1
        resumo.detalhes.push({ email: usuario.email, resultado: 'falha', erro: erroEnvio.message })
      } else {
        resumo.enviados += 1
        resumo.detalhes.push({ email: usuario.email, resultado: 'enviado' })
      }
      await salvarInstantaneo(admin, usuario.id, decisao.instantaneoHoje)
    } catch (erro) {
      resumo.falhas += 1
      resumo.detalhes.push({ email: usuario.email, resultado: 'falha', erro: String(erro) })
    }
  }

  return { erroEstrutural: null, resumo }
}

// ---- alerta ------------------------------------------------------------------

export async function executarAlerta({ filtroEmail = null } = {}) {
  const { error, usuarios } = await listarUsuarios(filtroEmail)
  if (error) return { erroEstrutural: error.message, resumo: null }

  const alvo = filtroEmail
    ? usuarios.filter((u) => String(u.email || '').toLowerCase() === String(filtroEmail).toLowerCase())
    : usuarios

  if (alvo.length === 0) return { erroEstrutural: `usuário não encontrado: ${filtroEmail}`, resumo: null }

  const resumo = { enviados: 0, semAlertas: 0, pausados: 0, falhas: 0, detalhes: [] }

  // Catálogo do radar com prazo: uma leitura por rodada serve todos os alunos
  // (mesma lista que alimenta o digest). Favorito sem linha no favoritos do
  // aluno nunca dispara — nada alertado se o aluno não guardou.
  const oportunidades = await catalogo(admin)

  for (const usuario of alvo) {
    try {
      const { prefs } = await lerPrefs(admin, usuario.id)
      if (devePausar(prefs, 'alerta')) {
        // Pausa de alerta é limpa mesmo: nem candidaturas lemos para o aluno
        // pausado — nenhum e-mail sai, sem custo nenhum de lado.
        resumo.pausados += 1
        resumo.detalhes.push({ email: usuario.email, resultado: 'pausado (preferências do perfil)' })
        continue
      }
      const { data: candidaturas } = await admin
        .from('applications')
        .select('id, university, status, deadline')
        .eq('user_id', usuario.id)
      const ativas = (candidaturas || []).filter((ap) => !['enviado', 'aceito', 'recusado'].includes(String(ap?.status || '').toLowerCase()))

      const { data: favoritosDoAluno } = await admin
        .from('favorites')
        .select('opportunity_id')
        .eq('user_id', usuario.id)

      // Candidatura ativa reserva o nome: o favorito com o MESMO prazo não
      // ganha segundo e-mail (o alerta de candidatura já o cobre).
      const alertas = [
        ...alertasDePrazo(candidaturas || []),
        ...alertasDeFavoritos(oportunidades, (favoritosDoAluno || []).map((f) => f.opportunity_id), {
          nomesReservados: ativas.map((ap) => ap.university),
        }),
      ]
      if (alertas.length === 0) {
        resumo.semAlertas += 1
        resumo.detalhes.push({ email: usuario.email, resultado: 'sem alertas hoje' })
        continue
      }

      for (const alerta of alertas) {
        const subject =
          alerta.dias === 0
            ? `PRAZO HOJE — ${alerta.university}`
            : alerta.dias === 1
              ? `PRAZO AMANHÃ — ${alerta.university}`
              : `Faltam ${alerta.dias} dias — ${alerta.university}`

        const { error: erroEnvio } = await enviarEmail({
          to: usuario.email,
          subject,
          html: montarAlertaHtml(alerta),
        })
        if (erroEnvio) {
          resumo.falhas += 1
          resumo.detalhes.push({ email: usuario.email, candidatura: alerta.university, resultado: 'falha', erro: erroEnvio.message })
        } else {
          resumo.enviados += 1
          resumo.detalhes.push({ email: usuario.email, candidatura: alerta.university, resultado: 'enviado' })
        }
      }
    } catch (erro) {
      resumo.falhas += 1
      resumo.detalhes.push({ email: usuario.email, resultado: 'falha', erro: String(erro) })
    }
  }

  return { erroEstrutural: null, resumo }
}
