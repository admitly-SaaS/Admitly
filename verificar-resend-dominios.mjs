// Temporário: status de verificação do admitly.com na Resend (rode devolvendo
// depois de colocar os registros DNS no provedor — a verificação acontece ao
// propagar; a Resend também aceita disparo manual, o que isto componente faz
// terminado o período: POST /domains/:id/verify).
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf8')
const key = (env.match(/^RESEND_API_KEY=(.*)$/m) || [])[1]?.trim().replace(/^"|"$/g, '')
const DOMAIN_ID = '904a715f-1318-44f0-9809-d994084e489b' // admitly.com

const det = await fetch(`https://api.resend.com/domains/${DOMAIN_ID}`, {
  headers: { Authorization: `Bearer ${key}` },
})
const dd = await det.json()
if (!det.ok) {
  console.log('erro:', det.status, dd?.message || dd)
  process.exit(1)
}

console.log('status: ' + dd.status)
const legendas = {
  not_started: '— registros DNS ainda não colocados (ou não propagados)',
  pending: '— registros colocados; aguardando a Resend re-verificar (pode demorar uns minutos)',
  verified: '✓ verificado — o app já pode enviar como semana@admitly.com',
  failed: '— verificação falhou: confira cada registro com atenção ao valor exato',
}
console.log(legendas[dd.status] || '')

if (dd.status !== 'verified' && (dd.records || []).length > 0) {
  console.log('\n== registros que a Resend espera ==')
  for (const rec of dd.records) {
    console.log(`${rec.record_type || rec.type} ${rec.name} → ${String(rec.value).slice(0, 48)}${String(rec.value).length > 48 ? '…' : ''}`)
  }
}
