import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') { res.writeHead(405, CORS); return res.end(); }
  let b = '';
  req.on('data', c => b += c);
  req.on('end', () => {
    try { const { jwt } = JSON.parse(b); writeFileSync('.seed-jwt.txt', jwt); console.log('jwt recebido, len', jwt.length); }
    catch (e) { console.log('erro parse', String(e)); }
    res.writeHead(200, CORS); res.end('ok');
  });
}).listen(7391, () => console.log('sink em :7391 (com CORS preflight)'));
