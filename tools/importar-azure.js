// Substitui o Kanban do time pelos itens de um CSV exportado do board do Azure DevOps.
//   node tools/importar-azure.js "C:\caminho\data.csv"            -> importa (faz backup do kanban.json antes)
//   node tools/importar-azure.js "C:\caminho\data.csv" --resumo   -> só mostra o que seria importado
// O servidor precisa estar parado (ele guarda o quadro em memória e sobrescreveria o arquivo).
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

// colunas do board, na ordem da tela do Azure
const COLUMNS = ['Backlog', 'Análise', 'Andamento', 'Entrega Semana', 'Teste / QA', 'Deploy', 'Impedimento', 'Demanda EY / Ticket SN', 'Concluído'];
const DONE = new Set(['Concluído']);
const ORG_URL = 'https://dev.azure.com/tleonardoluz';
const COLORS = ['#EE3124', '#F37021', '#F9B10B', '#3BA55C', '#2D7DD2', '#7B4FC9', '#D6458B', '#1FA3A3', '#8A6A4F', '#5B6470'];
const BY_STATE = { 'to do': 'Backlog', new: 'Backlog', doing: 'Andamento', 'in progress': 'Andamento', done: 'Concluído', closed: 'Concluído' };
const PRIO ={ 1: 'alta', 2: 'media', 3: 'baixa', 4: 'baixa' };
const TYPE = { bug: 'bug', 'user story': 'melhoria', feature: 'melhoria', 'product backlog item': 'melhoria' };

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const csvFile = process.argv[2];
const dry = process.argv.includes('--resumo');
if (!csvFile) { console.log('uso: node tools/importar-azure.js arquivo.csv [--resumo]'); process.exit(1); }
const id = () => crypto.randomBytes(6).toString('hex');
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ''])));
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function htmlToText(h) {
  return String(h || '')
    .replace(/<a [^>]*data-vss-mention[^>]*>([^<]*)<\/a>/gi, '$1')
    .replace(/<img[^>]*>/gi, '[imagem]')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m))
    .replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const dateBr = s => { const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

const items = parseCsv(fs.readFileSync(csvFile, 'utf8').replace(/^\uFEFF/, ''));
const kFile = path.join(DATA_DIR, 'kanban.json');
const old = JSON.parse(fs.readFileSync(kFile, 'utf8'));

// colunas: mantém os ids antigos quando o nome bate, senão cria
const cols = COLUMNS.map(name => ({ id: (old.columns.find(c => norm(c.name) === norm(name)) || {}).id || id(), name, done: DONE.has(name) }));
const colByName = new Map(cols.map(c => [norm(c.name), c]));
const unknownCols = new Map();

// pessoas: as do CSV (com e-mail) + quem já está cadastrado com e-mail (login do jogo)
const people = [];
const byEmail = new Map();
const addPerson = (name, email) => {
  email = email.toLowerCase();
  if (byEmail.has(email)) return byEmail.get(email);
  const prev = old.people.find(p => (p.email || '').toLowerCase() === email);
  const p = { id: prev ? prev.id : id(), name: name || (prev && prev.name) || email.split('@')[0], email, color: prev ? prev.color : COLORS[people.length % COLORS.length] };
  people.push(p); byEmail.set(email, p);
  return p;
};

const now = new Date().toISOString();
const tasks = items.map((r, i) => {
  const who = String(r['Assigned To'] || '').match(/^(.*?)\s*<([^>]+)>$/);
  const assignee = who ? addPerson(who[1].trim(), who[2].trim()).id : null;
  let col = colByName.get(norm(r['Board Column']));
  // Tasks (filhas) não aparecem no board e vêm sem coluna: vão pela situação
  if (!r['Board Column']) col = colByName.get(norm(BY_STATE[norm(r.State)] || 'Backlog'));
  if (!col) { unknownCols.set(r['Board Column'], (unknownCols.get(r['Board Column']) || 0) + 1); col = cols[0]; }
  const extra = [
    r['Recursos Envolvidos'] && 'Recursos envolvidos:\n' + htmlToText(r['Recursos Envolvidos']),
    r.Recursos && 'Recursos: ' + htmlToText(r.Recursos),
    (r['Completed Work'] || r['Remaining Work']) && `Trabalho: ${r['Completed Work'] || 0}h feito · ${r['Remaining Work'] || 0}h restante`,
    r['Area Path'] && 'Área: ' + r['Area Path'],
  ].filter(Boolean);
  const tags = String(r.Tags || '').split(';').map(s => s.trim()).filter(Boolean);
  if (r.State) tags.unshift(r.State);
  if (r['Work Item Type'] && norm(r['Work Item Type']) !== 'issue') tags.unshift(r['Work Item Type']);
  return {
    id: id(), title: String(r.Title || '').trim().slice(0, 200) || 'Sem título',
    description: [htmlToText(r.Description), ...extra].filter(Boolean).join('\n\n').slice(0, 8000),
    assignee, priority: PRIO[+r.Priority] || 'media', type: TYPE[norm(r['Work Item Type'])] || 'tarefa',
    status: col.id, tags: [...new Set(tags)].map(s => s.slice(0, 30)).slice(0, 10),
    due: dateBr(r['Entrega Prevista']), estimate: r.Effort !== '' && Number.isFinite(+r.Effort) ? Math.min(999, +r.Effort) : null,
    azureId: String(r.ID || '').trim(), link: r.ID ? `${ORG_URL}/_workitems/edit/${r.ID}` : '',
    comments: [], createdAt: now, updatedAt: now, createdBy: 'Importação Azure', order: i,
  };
});
for (const p of old.people) if (p.email && !byEmail.has(p.email.toLowerCase())) { people.push(p); byEmail.set(p.email.toLowerCase(), p); }

console.log(`${items.length} itens no CSV`);
for (const c of cols) console.log(`  ${c.name.padEnd(24)} ${tasks.filter(t => t.status === c.id).length}`);
if (unknownCols.size) console.log('colunas desconhecidas (foram para Backlog):', Object.fromEntries(unknownCols));
console.log(`${people.length} pessoas:`, people.map(p => `${p.name} <${p.email}>`).join(', '));
console.log(`sem responsável: ${tasks.filter(t => !t.assignee).length}`);
if (dry) process.exit(0);

const port = +process.env.PORT || 3000;
const sock = net.connect(port, '127.0.0.1');
sock.on('connect', () => { console.error(`O servidor está rodando na porta ${port}. Pare com Ctrl+C antes de importar.`); process.exit(2); });
sock.on('error', () => {
  const bak = kFile.replace(/\.json$/, `.antes-azure-${now.slice(0, 19).replace(/[:T]/g, '-')}.json`);
  fs.copyFileSync(kFile, bak);
  const board = { version: (old.version || 0) + 1, people, columns: cols, tasks };
  fs.writeFileSync(kFile + '.tmp', JSON.stringify(board, null, 1));
  fs.renameSync(kFile + '.tmp', kFile);
  console.log(`Importado. Backup do quadro anterior: ${bak}`);
});
