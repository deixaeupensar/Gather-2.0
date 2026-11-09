// Desenha o Kanban num canvas (para os quadros no mundo), nas cores da Hapvida.
const PRIO = { critica: '#EE3124', alta: '#F37021', media: '#F9B10B', baixa: '#3BA55C' };
const PW = { critica: 0, alta: 1, media: 2, baixa: 3 };
const TYPE = { tarefa: '📋', bug: '🐞', melhoria: '✨', estudo: '📚', reuniao: '🗓️' };
let logo = null;
function getLogo() {
  if (!logo) { logo = new Image(); logo.src = '/img/hapvida.png'; }
  return logo.complete && logo.naturalWidth ? logo : null;
}
const initials = n => n.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
function fitText(x, text, maxW) {
  if (x.measureText(text).width <= maxW) return text;
  let s = text; while (s.length > 1 && x.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
function wrap2(x, text, maxW) {
  const words = text.split(/\s+/); let l1 = '', i = 0;
  for (; i < words.length; i++) { const t = l1 ? l1 + ' ' + words[i] : words[i]; if (x.measureText(t).width > maxW) break; l1 = t; }
  if (!l1) return [fitText(x, text, maxW)];
  const rest = words.slice(i).join(' ');
  return rest ? [l1, fitText(x, rest, maxW)] : [l1];
}

// Painel de alertas: chamados/tarefas abertos que estão ATRASADOS ou SEM RESPONSÁVEL.
// O cabeçalho pisca em vermelho (opts.blink alterna) enquanto houver alerta. Devolve o total de alertas.
export function drawAlerts(canvas, board, opts = {}) {
  const x = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const u = Math.min(W / 14, H / 7) / 10;
  x.fillStyle = '#1d2129'; x.fillRect(0, 0, W, H);
  const hh = Math.round(u * 10);
  const title = opts.title || 'Alertas';
  x.textBaseline = 'middle'; x.textAlign = 'left';
  if (!board || board.error || board.notConfigured) {
    x.fillStyle = '#3a404c'; x.fillRect(0, 0, W, hh);
    x.fillStyle = '#fff'; x.font = `bold ${u * 4.2}px system-ui, sans-serif`; x.fillText(`🚨 ${title}`, u * 3, hh / 2);
    x.fillStyle = '#aab2c0'; x.font = `${u * 2.8}px system-ui, sans-serif`;
    x.fillText(!board ? 'Carregando…' : board.notConfigured ? 'ServiceNow não configurado.' : fitText(x, '⚠️ ' + board.error, W - u * 6), u * 3, hh + u * 8);
    x.fillText('Shift + botão direito escolhe o quadro.', u * 3, hh + u * 12);
    return 0;
  }
  const today = new Date().toISOString().slice(0, 10);
  const done = new Set(board.columns.filter(c => c.done).map(c => c.id));
  const open = board.tasks.filter(t => !done.has(t.status));
  const late = open.filter(t => t.due && t.due < today).sort((a, b) => a.due.localeCompare(b.due));
  const noOwner = open.filter(t => !t.assignee).sort((a, b) => (PW[a.priority] - PW[b.priority]) || (a.order ?? 0) - (b.order ?? 0));
  const total = new Set([...late, ...noOwner].map(t => t.id)).size;
  // cabeçalho: verde se está tudo em dia; vermelho piscando se há alerta
  const alarm = total > 0;
  x.fillStyle = alarm ? (opts.blink ? '#b3151b' : '#EE3124') : '#2e8b57'; x.fillRect(0, 0, W, hh);
  x.fillStyle = '#fff'; x.font = `bold ${u * 4.4}px system-ui, sans-serif`;
  x.fillText(fitText(x, `${alarm ? '🚨' : '✅'} ${title}`, W * 0.62), u * 3, hh / 2);
  x.textAlign = 'right'; x.font = `bold ${u * 3.2}px system-ui, sans-serif`;
  x.fillText(alarm ? `${total} precisa${total > 1 ? 'm' : ''} de atenção` : 'Tudo em dia', W - u * 3, hh / 2); x.textAlign = 'left';
  const cols = [{ name: '⏰ Atrasados', list: late, sub: t => '📅 venceu ' + t.due.split('-').reverse().slice(0, 2).join('/') }, { name: '👤 Sem responsável', list: noOwner, sub: t => t.openedAt ? 'aberto ' + String(t.openedAt).slice(8, 10) + '/' + String(t.openedAt).slice(5, 7) : '' }];
  const gap = u * 1.4, cw = (W - gap * 3) / 2, top = hh + gap;
  cols.forEach((c, i) => {
    const cx = gap + i * (cw + gap);
    x.fillStyle = '#272c36'; x.beginPath(); x.roundRect(cx, top, cw, H - top - gap, u * 1.2); x.fill();
    x.fillStyle = c.list.length ? '#ff6b6b' : '#7bd88f'; x.font = `bold ${u * 3}px system-ui, sans-serif`;
    x.fillText(c.name, cx + u * 1.6, top + u * 3);
    x.textAlign = 'right'; x.font = `bold ${u * 4.6}px system-ui, sans-serif`; x.fillText(String(c.list.length), cx + cw - u * 1.6, top + u * 3.2); x.textAlign = 'left';
    const rh = u * 6.4; let y = top + u * 7;
    const max = Math.max(0, Math.floor((H - gap - y) / (rh + u * 0.6)));
    const shown = c.list.slice(0, c.list.length > max ? Math.max(0, max - 1) : max);
    for (const t of shown) {
      x.fillStyle = '#323846'; x.beginPath(); x.roundRect(cx + u, y, cw - u * 2, rh, u * 0.8); x.fill();
      x.fillStyle = PRIO[t.priority] || '#ccc'; x.fillRect(cx + u, y + u * 0.7, u * 0.6, rh - u * 1.4);
      x.fillStyle = '#eef1f6'; x.font = `bold ${u * 2}px system-ui, sans-serif`;
      x.fillText(fitText(x, `${t.number ? t.number + ' · ' : ''}${t.title}`, cw - u * 5), cx + u * 2.4, y + u * 2.1);
      x.fillStyle = '#9aa4b5'; x.font = `${u * 1.7}px system-ui, sans-serif`;
      const p = board.people.find(pp => pp.id === t.assignee);
      x.fillText(fitText(x, [c.sub(t), p ? '👤 ' + p.name : ''].filter(Boolean).join('   '), cw - u * 5), cx + u * 2.4, y + u * 4.6);
      y += rh + u * 0.6;
    }
    if (c.list.length > shown.length) { x.fillStyle = '#9aa4b5'; x.font = `bold ${u * 2}px system-ui, sans-serif`; x.fillText(`+ ${c.list.length - shown.length}`, cx + u * 2, y + u * 2); }
    if (!c.list.length) { x.fillStyle = '#7d8696'; x.font = `${u * 2.2}px system-ui, sans-serif`; x.fillText('Nenhum 🎉', cx + u * 2, top + u * 9); }
  });
  return total;
}

// opts: { mine: bool, me: nome do jogador }
export function drawKanban(canvas, board, opts = {}) {
  const x = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const u = Math.min(W / 14, H / 6) / 10; // unidade de tamanho
  x.fillStyle = '#f6f3ef'; x.fillRect(0, 0, W, H);
  // cabeçalho em degradê
  const hh = Math.round(u * 9);
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#EE3124'); g.addColorStop(0.45, '#F04E23'); g.addColorStop(0.75, '#F37021'); g.addColorStop(1, '#F9B10B');
  x.fillStyle = g; x.fillRect(0, 0, W, hh);
  const lg = getLogo();
  if (lg) { x.fillStyle = '#fff'; x.beginPath(); x.roundRect(u * 1.5, u * 1.2, hh - u * 2.4, hh - u * 2.4, u * 1.2); x.fill(); x.drawImage(lg, u * 2, u * 1.7, hh - u * 3.4, hh - u * 3.4); }
  x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left';
  let title = opts.title || 'Kanban do time';
  if (!board) { x.font = `bold ${u * 4}px system-ui, sans-serif`; x.fillText(opts.title ? `${opts.title} — carregando…` : 'Carregando o Kanban…', hh + u, hh / 2); return; }
  if (board.error || board.notConfigured) {
    x.font = `bold ${u * 4.2}px system-ui, sans-serif`; x.fillText(title, hh + u, hh / 2);
    x.fillStyle = '#7c726b'; x.font = `${u * 2.8}px system-ui, sans-serif`;
    x.fillText(board.notConfigured ? 'ServiceNow ainda não configurado (data/servicenow.json).' : '⚠️ ' + fitText(x, 'ServiceNow: ' + board.error, W - u * 6), u * 3, hh + u * 8);
    x.fillText('Shift + botão direito no quadro escolhe outro quadro.', u * 3, hh + u * 12);
    return;
  }
  let tasks = board.tasks;
  let meP = null;
  if (opts.mine) {
    meP = board.people.find(p => p.name.trim().toLowerCase() === String(opts.me || '').trim().toLowerCase());
    title = `Minhas tarefas — ${opts.me || '?'}`;
    tasks = meP ? tasks.filter(t => t.assignee === meP.id) : [];
  }
  x.font = `bold ${u * 4.2}px system-ui, sans-serif`;
  x.fillText(title, hh + u, hh / 2 - u * 0.6);
  x.font = `${u * 2.2}px system-ui, sans-serif`;
  const open = tasks.filter(t => !(board.columns.find(c => c.id === t.status) || {}).done).length;
  x.fillText(`${open} em aberto · ${opts.subtitle || 'botão direito para abrir e editar'}`, hh + u, hh / 2 + u * 3);
  if (opts.mine && !meP) {
    x.fillStyle = '#7c726b'; x.font = `${u * 3}px system-ui, sans-serif`;
    x.fillText(`"${opts.me}" ainda não está em Pessoas no Kanban.`, u * 3, hh + u * 8);
    x.fillText('Abra o quadro (botão direito) → Pessoas → adicione seu nome.', u * 3, hh + u * 12);
    return;
  }
  // colunas por estado (opts.cols: só as colunas escolhidas para este quadro na parede)
  let cols = board.columns;
  if (Array.isArray(opts.cols) && opts.cols.length) { const sel = cols.filter(c => opts.cols.includes(c.id)); if (sel.length) cols = sel; }
  const n = cols.length, gap = u * 1.2;
  const cw = (W - gap * (n + 1)) / n, top = hh + gap;
  cols.forEach((c, i) => {
    const cx = gap + i * (cw + gap), list = tasks.filter(t => t.status === c.id)
      .sort((a, b) => (c.done ? (b.updatedAt || '').localeCompare(a.updatedAt || '') : (PW[a.priority] - PW[b.priority]) || (a.order ?? 0) - (b.order ?? 0)));
    x.fillStyle = '#ece5de'; x.beginPath(); x.roundRect(cx, top, cw, H - top - gap, u * 1.2); x.fill();
    x.fillStyle = c.done ? '#3BA55C' : '#F37021'; x.fillRect(cx, top + u * 5.4, cw, u * 0.5);
    x.fillStyle = '#2b2522'; x.font = `bold ${u * 2.6}px system-ui, sans-serif`;
    x.fillText(fitText(x, `${c.name}${c.done ? ' ✓' : ''}`, cw - u * 8), cx + u * 1.2, top + u * 2.8);
    x.textAlign = 'right'; x.fillStyle = '#7c726b'; x.fillText(String(list.length), cx + cw - u * 1.2, top + u * 2.8); x.textAlign = 'left';
    // cartões
    const ch = u * 8.4, pad = u * 0.9;
    let y = top + u * 7;
    const maxCards = Math.max(0, Math.floor((H - gap - y) / (ch + pad)));
    const shown = list.slice(0, list.length > maxCards ? Math.max(0, maxCards - 1) : maxCards);
    for (const t of shown) {
      x.fillStyle = '#fff'; x.beginPath(); x.roundRect(cx + pad, y, cw - pad * 2, ch, u * 0.9); x.fill();
      x.fillStyle = PRIO[t.priority] || '#ccc'; x.fillRect(cx + pad, y + u * 0.8, u * 0.6, ch - u * 1.6);
      x.fillStyle = c.done ? '#9a918a' : '#2b2522'; x.font = `bold ${u * 2.1}px system-ui, sans-serif`;
      const lines = wrap2(x, `${TYPE[t.type] || ''} ${t.title}`, cw - pad * 2 - u * 7);
      lines.forEach((l, k) => x.fillText(l, cx + pad + u * 1.6, y + u * 2.2 + k * u * 2.5));
      // rodapé: prazo e responsável
      const p = board.people.find(pp => pp.id === t.assignee);
      x.font = `${u * 1.7}px system-ui, sans-serif`;
      const late = t.due && !c.done && t.due < new Date().toISOString().slice(0, 10);
      x.fillStyle = late ? '#EE3124' : '#7c726b';
      const foot = [t.due ? '📅 ' + t.due.split('-').reverse().slice(0, 2).join('/') : '', t.azureId ? '#' + t.azureId : ''].filter(Boolean).join('   ');
      if (foot) x.fillText(foot, cx + pad + u * 1.6, y + ch - u * 1.5);
      if (p) {
        const r = u * 2.1, ax = cx + cw - pad - r - u * 0.8, ay = y + ch / 2;
        x.fillStyle = p.color; x.beginPath(); x.arc(ax, ay, r, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#fff'; x.font = `bold ${u * 1.6}px system-ui, sans-serif`; x.textAlign = 'center';
        x.fillText(initials(p.name), ax, ay + u * 0.1); x.textAlign = 'left';
      }
      y += ch + pad;
    }
    if (list.length > shown.length) { x.fillStyle = '#7c726b'; x.font = `bold ${u * 2}px system-ui, sans-serif`; x.fillText(`+ ${list.length - shown.length} tarefas`, cx + pad + u, y + u * 2.5); }
  });
}
