// Kanban do time — visão por estado e por pessoa, edição completa, arrastar e soltar.
const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const ME = qs.get('me') || '';
const EMBED = qs.get('embed') === '1';
// dentro do jogo o botão direito é do jogo: sem o menu do navegador (exceto em campos de texto,
// para poder colar/corrigir ortografia, e em links, para copiar o endereço)
if (EMBED) document.addEventListener('contextmenu', e => {
  if (e.target.closest && e.target.closest('input, textarea, [contenteditable="true"], a[href]')) return;
  e.preventDefault();
});
const PRIO = { critica: { label: 'Crítica', color: '#EE3124', w: 0 }, alta: { label: 'Alta', color: '#F37021', w: 1 }, media: { label: 'Média', color: '#F9B10B', w: 2 }, baixa: { label: 'Baixa', color: '#3BA55C', w: 3 } };
const TYPE = { tarefa: '📋', bug: '🐞', melhoria: '✨', estudo: '📚', reuniao: '🗓️' };

const MY_EMAIL = (qs.get('email') || '').toLowerCase();
let board = null, view = qs.get('view') || 'estado', personFilter = '', editing = null, dragId = null;
// fonte do quadro: 'time' (Kanban interno) ou 'sn:<grupo>' (chamados do ServiceNow)
let source = qs.get('board') || 'time', snCfg = { enabled: false, groups: [] };
const isSn = () => source.startsWith('sn:');
const NONE_LABEL = () => (isSn() ? 'Sem atribuição' : 'Sem responsável');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => n.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
const person = id => board.people.find(p => p.id === id);
const column = id => board.columns.find(c => c.id === id);
const isDone = t => !!(column(t.status) || {}).done;
const today = () => new Date().toISOString().slice(0, 10);
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('show'), 2200); }

async function load(force) {
  const base = isSn() ? '/api/sn/board?key=' + encodeURIComponent(source.slice(3)) : '/api/kanban';
  const v = board && !force ? (isSn() ? '&v=' : '?v=') + board.version : '';
  const r = await fetch(base + v, { cache: 'no-store' });
  const data = await r.json();
  if (data.same) return;
  if (!r.ok) { board = { columns: [], people: [], tasks: [], version: 0, error: data.error }; render(); return; }
  const first = !board;
  board = data;
  if (first && qs.get('mine') === '1') {
    const p = board.people.find(p => (MY_EMAIL && (p.email || '') === MY_EMAIL) || p.name.trim().toLowerCase() === ME.trim().toLowerCase());
    if (p) personFilter = p.id;
    else toast(`"${ME}" ainda não está em Pessoas — adicione para ver suas tarefas`);
  }
  if (first && qs.get('person')) personFilter = qs.get('person');
  render();
  if (editing && editing.id) refreshComments();
}
async function op(m) {
  // no quadro do ServiceNow, mover/atribuir vira uma atualização do chamado
  if (isSn()) {
    if (m.op !== 'updateTask') return false;
    return snUpdate({ id: m.id, status: m.patch.status, assignee: 'assignee' in m.patch ? m.patch.assignee : undefined });
  }
  const r = await fetch('/api/kanban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...m, by: ME }) });
  const data = await r.json();
  if (!r.ok) { toast('Erro: ' + (data.error || r.status)); return false; }
  board = data; render(); return true;
}
async function snUpdate(patch) {
  toast('Gravando no ServiceNow…');
  const r = await fetch('/api/sn/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: source.slice(3), ...patch, by: ME, email: MY_EMAIL }) });
  const data = await r.json();
  if (!r.ok) { toast('ServiceNow: ' + (data.error || r.status)); await load(true); return false; }
  board = data; render(); toast('Atualizado no ServiceNow ✓'); return true;
}
setInterval(() => load().catch(() => {}), 2500);

// ---------------------------------------------------------------- render
function filtered(tasks) {
  const q = $('#fSearch').value.trim().toLowerCase(), pr = $('#fPrio').value;
  return tasks.filter(t =>
    (!pr || t.priority === pr) &&
    (!q || [t.title, t.description, t.azureId, (t.tags || []).join(' '), (person(t.assignee) || {}).name].join(' ').toLowerCase().includes(q)));
}
const sortTasks = list => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

function render() {
  if (!board) return;
  const sn = isSn();
  $('#sub').textContent = `${board.tasks.filter(t => !isDone(t)).length} ${sn ? 'chamados abertos' : 'abertas'} · ${board.tasks.filter(isDone).length} ${sn ? 'fechados (7 dias)' : 'concluídas'}` + (ME ? ` · você: ${ME}` : '');
  document.querySelectorAll('#views button').forEach(b => b.classList.toggle('sel', b.dataset.view === view));
  // no ServiceNow os chamados nascem lá: sem criar tarefas, pessoas ou colunas por aqui
  for (const id of ['#btnNew', '#btnPeople', '#btnCols']) $(id).classList.toggle('hidden', sn);
  const bar = $('#snBar');
  bar.classList.toggle('hidden', !sn);
  if (sn) {
    const when = board.fetchedAt ? new Date(board.fetchedAt).toLocaleTimeString('pt-BR') : '—';
    bar.classList.toggle('err', !!board.error);
    bar.innerHTML = board.error
      ? `⚠️ Não consegui falar com o ServiceNow: ${esc(board.error)}`
      : board.loading ? 'Buscando chamados no ServiceNow…'
      : `🔗 ServiceNow · grupo <b>${esc(board.group || '')}</b> · tarefas de catálogo · atualizado às ${when} · arraste para mudar o estado, troque o atribuído no cartão <a id="snRefresh" href="#">atualizar agora</a>`;
    const rf = $('#snRefresh'); if (rf) rf.onclick = async e => { e.preventDefault(); await fetch('/api/sn/refresh', { method: 'POST' }); load(true); };
  }
  // filtro de pessoa
  const fp = $('#fPerson');
  fp.innerHTML = `<option value="">Todas as pessoas</option><option value="__none">${NONE_LABEL()}</option>` + board.people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  fp.value = personFilter;
  fp.disabled = view === 'pessoa';
  const pf = person(personFilter);
  const boardName = sn ? (board.label || 'ServiceNow') : 'Kanban do time';
  $('#title').textContent = view === 'estado' && pf ? `${sn ? 'Chamados' : 'Tarefas'} de ${pf.name}` : boardName;
  const crumb = $('#crumb');
  crumb.classList.toggle('hidden', !(view === 'estado' && personFilter));
  if (view === 'estado' && personFilter) crumb.innerHTML = `<a id="backPeople">← Todas as pessoas</a> &nbsp;/&nbsp; ${esc(pf ? pf.name : NONE_LABEL())}`;
  const back = $('#backPeople'); if (back) back.onclick = () => { view = 'pessoa'; personFilter = ''; render(); };

  const el = $('#board'); el.innerHTML = '';
  if (view === 'estado') {
    let tasks = filtered(board.tasks);
    if (personFilter === '__none') tasks = tasks.filter(t => !t.assignee); else if (personFilter) tasks = tasks.filter(t => t.assignee === personFilter);
    for (const c of board.columns) {
      const list = sortTasks(tasks.filter(t => t.status === c.id));
      el.appendChild(colEl({ key: c.id, name: c.name, done: c.done, list, preset: { status: c.id, assignee: personFilter && personFilter !== '__none' ? personFilter : null } }));
    }
  } else {
    // colunas = pessoas; só tarefas não finalizadas; clicar no nome abre o kanban por estado da pessoa
    const tasks = filtered(board.tasks).filter(t => !isDone(t));
    const cols = [...board.people.map(p => ({ key: p.id, name: p.name, color: p.color })), { key: '__none', name: NONE_LABEL(), color: '#9a918a' }];
    for (const p of cols) {
      const list = sortTasks(tasks.filter(t => (p.key === '__none' ? !t.assignee : t.assignee === p.key)))
        .sort((a, b) => PRIO[a.priority].w - PRIO[b.priority].w);
      if (p.key === '__none' && !list.length) continue;
      el.appendChild(colEl({ key: p.key, name: p.name, color: p.color, list, personCol: true, preset: { assignee: p.key === '__none' ? null : p.key } }));
    }
  }
}

function colEl({ key, name, done, list, color, personCol, preset }) {
  const col = document.createElement('section'); col.className = 'col';
  const head = document.createElement('div'); head.className = 'colHead' + (personCol ? ' person' : '') + (done ? ' done' : '');
  head.innerHTML = (personCol ? `<span class="avatar" style="background:${color}">${esc(initials(name))}</span>` : '') +
    `<span class="name" title="${esc(name)}">${esc(name)}${done ? ' ✓' : ''}</span><span class="count">${list.length}</span><button class="add" title="Nova tarefa aqui">+</button>`;
  if (personCol) head.querySelector('.name').onclick = head.querySelector('.avatar').onclick = () => { view = 'estado'; personFilter = key; render(); };
  head.querySelector('.add').onclick = e => { e.stopPropagation(); openTask(null, preset); };
  if (isSn()) head.querySelector('.add').remove();
  if (personCol) head.title = 'Clique no nome para ver o kanban por estado desta pessoa';
  const cards = document.createElement('div'); cards.className = 'cards';
  if (!list.length) cards.innerHTML = `<div class="empty">${personCol ? 'Nada em aberto 🎉' : 'Arraste tarefas para cá'}</div>`;
  for (const t of list) cards.appendChild(cardEl(t, personCol));
  col.append(head, cards);
  // soltar: muda o estado (visão por estado) ou o responsável (visão por pessoa)
  col.addEventListener('dragover', e => { if (dragId) { e.preventDefault(); col.classList.add('over'); } });
  col.addEventListener('dragleave', () => col.classList.remove('over'));
  col.addEventListener('drop', e => {
    e.preventDefault(); col.classList.remove('over');
    const id = dragId; dragId = null; if (!id) return;
    const t = board.tasks.find(x => x.id === id); if (!t) return;
    // posição: antes do cartão sob o mouse
    const after = [...cards.querySelectorAll('.card')].find(c => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    const ordered = list.filter(x => x.id !== id);
    const idx = after ? ordered.findIndex(x => x.id === after.dataset.id) : ordered.length;
    const prev = ordered[idx - 1], next = ordered[idx];
    const order = prev && next ? (prev.order + next.order) / 2 : prev ? prev.order + 1000 : next ? next.order - 1000 : Date.now();
    const patch = personCol ? { assignee: key === '__none' ? null : key, order } : { status: key, order };
    if (isSn() && (personCol ? (t.assignee || null) === patch.assignee : t.status === patch.status)) return; // no ServiceNow a ordem não existe
    op({ op: 'updateTask', id, patch });
  });
  return col;
}

function cardEl(t, personCol) {
  const c = document.createElement('article'); c.className = 'card' + (isDone(t) ? ' isdone' : ''); c.draggable = true; c.dataset.id = t.id;
  c.style.setProperty('--prio', PRIO[t.priority].color);
  const p = person(t.assignee), late = t.due && !isDone(t) && t.due < today();
  const statusName = personCol ? `<span class="badge">${esc((column(t.status) || {}).name || '')}</span>` : '';
  c.innerHTML = `<div class="t">${TYPE[t.type] || '📋'} ${esc(t.title)}</div>` +
    (t.tags && t.tags.length ? `<div class="tags">${t.tags.map(g => `<span class="tag">${esc(g)}</span>`).join('')}</div>` : '') +
    `<div class="foot"><span class="badge" style="color:${PRIO[t.priority].color}">● ${PRIO[t.priority].label}</span>${statusName}` +
    (t.due ? `<span class="${late ? 'late' : ''}">📅 ${t.due.split('-').reverse().slice(0, 2).join('/')}</span>` : '') +
    (t.estimate != null ? `<span>⏱ ${t.estimate}h</span>` : '') +
    (t.azureId ? `<span>#${esc(t.azureId)}</span>` : '') +
    (t.comments && t.comments.length ? `<span>💬 ${t.comments.length}</span>` : '') +
    `<span class="sp"></span>` + (p && !personCol ? `<span class="avatar" title="${esc(p.name)}" style="background:${p.color}">${esc(initials(p.name))}</span>` : '') + `</div>`;
  c.addEventListener('dragstart', e => { dragId = t.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); c.classList.add('dragging'); });
  c.addEventListener('dragend', () => { c.classList.remove('dragging'); dragId = null; });
  c.onclick = () => (isSn() ? openSnTask(t) : openTask(t));
  return c;
}

// ---------------------------------------------------------------- chamado do ServiceNow
let snEditing = null;
function openSnTask(t) {
  snEditing = t.id;
  const f = $('#snForm').elements;
  $('#snNumber').textContent = t.number || 'Chamado';
  $('#snLink').href = t.link || '#';
  $('#snTitle').textContent = t.title;
  $('#snMeta').textContent = [t.ritm && `Requisição ${t.ritm}`, t.tags && t.tags[0], t.requestedFor && `para ${t.requestedFor}`, `prioridade ${PRIO[t.priority].label}`, t.due && `prazo ${t.due.split('-').reverse().join('/')}`, t.openedAt && `aberto em ${t.openedAt}`].filter(Boolean).join(' · ');
  $('#snDesc').textContent = t.description || '';
  f.status.innerHTML = board.columns.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  f.assignee.innerHTML = `<option value="">— ${NONE_LABEL()} —</option>` + board.people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.email ? ' · ' + esc(p.email) : ''}</option>`).join('');
  f.status.value = t.status; f.assignee.value = t.assignee || ''; f.note.value = ''; f.comment.value = '';
  $('#snStatus').textContent = '';
  $('#dlgSn').showModal();
  loadJournal(t.id);
}
async function loadJournal(id) {
  const box = $('#snJournal');
  box.innerHTML = '<div class="muted">Carregando…</div>';
  try {
    const r = await fetch(`/api/sn/journal?key=${encodeURIComponent(source.slice(3))}&id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const data = await r.json();
    if (snEditing !== id) return;
    if (!r.ok) { box.innerHTML = `<div class="muted">Não deu para ler o histórico: ${esc(data.error || r.status)}</div>`; return; }
    box.innerHTML = data.list.length ? data.list.map(j => `<div class="jEntry ${j.kind}"><div class="jHead"><span class="jKind">${j.kind === 'comment' ? '💬 Comentário' : '🔒 Anotação interna'}</span> <b>${esc(j.by || '')}</b> <span class="muted">${esc(j.at || '')}</span></div><div class="jText">${esc(j.text)}</div></div>`).join('')
      : '<div class="muted">Nenhum comentário ou anotação ainda.</div>';
  } catch { if (snEditing === id) box.innerHTML = '<div class="muted">Não deu para ler o histórico.</div>'; }
}
$('#snForm').addEventListener('submit', async e => {
  if (!e.submitter || e.submitter.value !== 'save') return;
  e.preventDefault();
  const f = $('#snForm').elements;
  $('#snStatus').textContent = 'Gravando…';
  const ok = await snUpdate({ id: snEditing, status: f.status.value, assignee: f.assignee.value || null, note: f.note.value, comment: f.comment.value });
  if (ok) $('#dlgSn').close(); else $('#snStatus').textContent = 'Não foi possível salvar (veja a mensagem acima).';
});

// ---------------------------------------------------------------- tarefa (criar/editar)
const form = $('#taskForm');
function openTask(t, preset = {}) {
  editing = t ? { id: t.id } : { id: null };
  const f = form.elements;
  f.status.innerHTML = board.columns.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  f.assignee.innerHTML = `<option value="">— ninguém —</option>` + board.people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const v = t || { title: '', description: '', status: preset.status || board.columns[0].id, assignee: preset.assignee || null, priority: 'media', type: 'tarefa', due: '', estimate: '', azureId: '', link: '', tags: [] };
  f.title.value = v.title; f.description.value = v.description || ''; f.status.value = v.status; f.assignee.value = v.assignee || '';
  f.priority.value = v.priority; f.type.value = v.type; f.due.value = v.due || ''; f.estimate.value = v.estimate ?? '';
  f.azureId.value = v.azureId || ''; f.link.value = v.link || ''; f.tags.value = (v.tags || []).join(', ');
  $('#taskTitle').textContent = t ? 'Editar tarefa' : 'Nova tarefa';
  $('#taskMeta').textContent = t ? `criada por ${t.createdBy || '?'} em ${new Date(t.createdAt).toLocaleString('pt-BR')}` + (t.updatedBy ? ` · editada por ${t.updatedBy}` : '') : '';
  $('#btnDelete').classList.toggle('hidden', !t);
  $('#commentsBox').classList.toggle('hidden', !t);
  refreshComments();
  $('#dlgTask').showModal();
  setTimeout(() => f.title.focus(), 0);
}
function refreshComments() {
  const t = editing && editing.id && board.tasks.find(x => x.id === editing.id);
  $('#comments').innerHTML = t && t.comments.length ? t.comments.map(c => `<div class="comment"><b>${esc(c.author)}</b> <span class="muted">${new Date(c.at).toLocaleString('pt-BR')}</span><div>${esc(c.text)}</div></div>`).join('') : '<div class="muted">Nenhum comentário ainda.</div>';
}
form.addEventListener('submit', async e => {
  if (!e.submitter || e.submitter.value !== 'save') { editing = null; return; }
  const f = form.elements;
  const task = { title: f.title.value, description: f.description.value, status: f.status.value, assignee: f.assignee.value || null, priority: f.priority.value, type: f.type.value, due: f.due.value || null, estimate: f.estimate.value === '' ? null : +f.estimate.value, azureId: f.azureId.value, link: f.link.value, tags: f.tags.value };
  if (editing.id) await op({ op: 'updateTask', id: editing.id, patch: task });
  else if (await op({ op: 'createTask', task })) toast('Tarefa criada');
  editing = null;
});
$('#dlgTask').addEventListener('close', () => { editing = null; });
$('#btnDelete').onclick = async () => {
  if (!editing || !editing.id || !confirm('Excluir esta tarefa?')) return;
  await op({ op: 'deleteTask', id: editing.id }); $('#dlgTask').close();
};
$('#btnComment').onclick = async () => {
  const text = $('#commentText').value.trim(); if (!text || !editing || !editing.id) return;
  if (!ME) { toast('Abra o quadro pelo jogo para comentar com seu nome'); }
  if (await op({ op: 'addComment', id: editing.id, text })) { $('#commentText').value = ''; refreshComments(); }
};
$('#commentText').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#btnComment').click(); } });

// ---------------------------------------------------------------- pessoas e colunas
let peopleDraft = [], colsDraft = [];
function renderPeople() {
  $('#peopleList').innerHTML = '';
  peopleDraft.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'item';
    row.innerHTML = `<input type="color" value="${p.color}"><input type="text" value="${esc(p.name)}" maxlength="40" placeholder="Nome"><input type="email" value="${esc(p.email || '')}" maxlength="80" placeholder="e-mail" style="flex:1"><button type="button" title="Remover">🗑</button>`;
    const [c, n, em, del] = row.children;
    c.oninput = () => (p.color = c.value); n.oninput = () => (p.name = n.value); em.oninput = () => (p.email = em.value.trim().toLowerCase());
    del.onclick = () => { if (confirm(`Remover ${p.name}? As tarefas dela ficam sem responsável.`)) { peopleDraft.splice(i, 1); renderPeople(); } };
    $('#peopleList').appendChild(row);
  });
}
$('#btnPeople').onclick = () => { peopleDraft = board.people.map(p => ({ ...p })); renderPeople(); $('#dlgPeople').showModal(); };
$('#btnAddPerson').onclick = () => { const colors = ['#EE3124', '#F37021', '#F9B10B', '#3BA55C', '#2D7DD2', '#7B4FC9', '#D6458B', '#1FA3A3']; peopleDraft.push({ name: ME && !peopleDraft.some(p => p.name === ME) ? ME : 'Nova pessoa', color: colors[peopleDraft.length % colors.length] }); renderPeople(); };
$('#btnSavePeople').onclick = () => op({ op: 'setPeople', people: peopleDraft });
function renderCols() {
  $('#colsList').innerHTML = '';
  colsDraft.forEach((c, i) => {
    const row = document.createElement('div'); row.className = 'item';
    row.innerHTML = `<input type="text" value="${esc(c.name)}" maxlength="40"><label style="flex-direction:row;align-items:center;gap:4px"><input type="checkbox" ${c.done ? 'checked' : ''}> finalizado</label><button type="button" title="Subir">↑</button><button type="button" title="Descer">↓</button><button type="button" title="Remover">🗑</button>`;
    const n = row.querySelector('input[type=text]'), d = row.querySelector('input[type=checkbox]'), [up, down, del] = row.querySelectorAll('button');
    n.oninput = () => (c.name = n.value); d.onchange = () => (c.done = d.checked);
    up.onclick = () => { if (i > 0) { [colsDraft[i - 1], colsDraft[i]] = [colsDraft[i], colsDraft[i - 1]]; renderCols(); } };
    down.onclick = () => { if (i < colsDraft.length - 1) { [colsDraft[i + 1], colsDraft[i]] = [colsDraft[i], colsDraft[i + 1]]; renderCols(); } };
    del.onclick = () => { colsDraft.splice(i, 1); renderCols(); };
    $('#colsList').appendChild(row);
  });
}
$('#btnCols').onclick = () => { colsDraft = board.columns.map(c => ({ ...c })); renderCols(); $('#dlgCols').showModal(); };
$('#btnAddCol').onclick = () => { colsDraft.splice(Math.max(0, colsDraft.length - 1), 0, { name: 'Nova coluna', done: false }); renderCols(); };
$('#btnSaveCols').onclick = () => op({ op: 'setColumns', columns: colsDraft });

// ---------------------------------------------------------------- barra
document.querySelectorAll('#views button').forEach(b => (b.onclick = () => { view = b.dataset.view; if (view === 'pessoa') personFilter = ''; render(); }));
$('#fPerson').onchange = e => { personFilter = e.target.value; render(); };
$('#fPrio').onchange = render;
$('#fSearch').oninput = render;
$('#btnNew').onclick = () => openTask(null, { assignee: personFilter && personFilter !== '__none' ? personFilter : null });
// fechar (quando aberto dentro do jogo)
const close = () => parent.postMessage({ kanban: 'close' }, '*');
$('#btnClose').classList.toggle('hidden', !EMBED);
$('#btnClose').onclick = close;
addEventListener('keydown', e => { if (e.key === 'Escape' && EMBED && !document.querySelector('dialog[open]')) close(); });

// quadros disponíveis: o do time + um por grupo do ServiceNow configurado
async function loadBoards() {
  try { snCfg = await (await fetch('/api/sn/config', { cache: 'no-store' })).json(); } catch {}
  const sel = $('#fBoard');
  sel.innerHTML = `<option value="time">📌 Kanban do time</option>` +
    ((snCfg.groups || []).length ? `<optgroup label="ServiceNow">` + snCfg.groups.map(g => `<option value="sn:${esc(g.key)}">🎫 ${esc(g.label)}</option>`).join('') + `</optgroup>` : '') +
    (!snCfg.enabled ? `<option value="" disabled>ServiceNow: não configurado</option>` : '');
  if (isSn() && !(snCfg.groups || []).some(g => 'sn:' + g.key === source)) source = 'time';
  sel.value = source;
}
$('#fBoard').onchange = e => { source = e.target.value; board = null; personFilter = ''; load(true).catch(() => {}); };
loadBoards().then(() => load(true)).catch(e => { $('#sub').textContent = 'Erro ao carregar: ' + e.message; });
