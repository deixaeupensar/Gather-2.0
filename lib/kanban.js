// Kanban do time: tarefas, pessoas e colunas, salvos em data/kanban.json.
// API: GET /api/kanban (?v=versão para saber se mudou) · POST /api/kanban { op, ... }
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRIORITIES = ['baixa', 'media', 'alta', 'critica'];
const TYPES = ['tarefa', 'bug', 'melhoria', 'estudo', 'reuniao'];
const COLORS = ['#EE3124', '#F37021', '#F9B10B', '#3BA55C', '#2D7DD2', '#7B4FC9', '#D6458B', '#1FA3A3', '#8A6A4F', '#5B6470'];
const id = () => crypto.randomBytes(6).toString('hex');
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);

function defaults() {
  // pessoas iniciais (dá para editar no quadro)
  const people = ['Carlos Alex', 'Daniel', 'Nicolas', 't_jessica.paivap', 'Tamy', 'Zézin', 'wagnerferraz']
    .map((name, i) => ({ id: id(), name, color: COLORS[i % COLORS.length] }));
  const columns = [
    { id: id(), name: 'A fazer', done: false },
    { id: id(), name: 'Em andamento', done: false },
    { id: id(), name: 'Em revisão', done: false },
    { id: id(), name: 'Bloqueado', done: false },
    { id: id(), name: 'Concluído', done: true },
  ];
  return { version: 1, people, columns, tasks: [] };
}

class Kanban {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'kanban.json');
    try { this.board = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.board = defaults(); this.save(); }
  }
  // quem entra no jogo é cadastrado em Pessoas pelo e-mail (o nome exibido é atualizado se mudar)
  ensurePerson(name, email) {
    email = String(email || '').trim().toLowerCase();
    if (!email) return false;
    const b = this.board;
    let p = b.people.find(x => (x.email || '').toLowerCase() === email);
    if (!p) p = b.people.find(x => !x.email && x.name.trim().toLowerCase() === String(name).trim().toLowerCase());
    if (p) {
      if (p.email === email && p.name === name) return false;
      p.email = email; if (name) p.name = str(name, 40);
    } else {
      b.people.push({ id: id(), name: str(name, 40) || email.split('@')[0], email, color: COLORS[b.people.length % COLORS.length] });
    }
    b.version++; this.save();
    return true;
  }
  save() {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.board, null, 1));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  cleanTask(t, old = {}) {
    const b = this.board;
    const out = { ...old };
    if ('title' in t) out.title = str(t.title, 200).trim() || 'Sem título';
    if ('description' in t) out.description = str(t.description, 8000);
    if ('assignee' in t) out.assignee = b.people.some(p => p.id === t.assignee) ? t.assignee : null;
    if ('priority' in t) out.priority = PRIORITIES.includes(t.priority) ? t.priority : 'media';
    if ('type' in t) out.type = TYPES.includes(t.type) ? t.type : 'tarefa';
    if ('status' in t) out.status = b.columns.some(c => c.id === t.status) ? t.status : b.columns[0].id;
    if ('tags' in t) out.tags = (Array.isArray(t.tags) ? t.tags : String(t.tags || '').split(',')).map(s => str(s, 30).trim()).filter(Boolean).slice(0, 10);
    if ('due' in t) out.due = /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null;
    if ('estimate' in t) out.estimate = Number.isFinite(+t.estimate) && t.estimate !== '' && t.estimate !== null ? Math.max(0, Math.min(999, +t.estimate)) : null;
    if ('azureId' in t) out.azureId = str(t.azureId, 40).trim();
    if ('link' in t) out.link = /^https?:\/\//i.test(t.link || '') ? str(t.link, 500) : '';
    if ('order' in t && Number.isFinite(+t.order)) out.order = +t.order;
    return out;
  }
  // aplica uma operação; devolve { ok, error }
  apply(m, who) {
    const b = this.board;
    const task = m.id ? b.tasks.find(t => t.id === m.id) : null;
    const now = new Date().toISOString();
    const by = str(who, 40) || 'alguém';
    switch (m.op) {
      case 'createTask': {
        if (b.tasks.length >= 5000) return { error: 'limite de tarefas' };
        const t = this.cleanTask({ title: '', description: '', assignee: null, priority: 'media', type: 'tarefa', status: b.columns[0].id, tags: [], due: null, estimate: null, azureId: '', link: '', ...m.task });
        Object.assign(t, { id: id(), comments: [], createdAt: now, updatedAt: now, createdBy: by, order: Date.now() });
        b.tasks.push(t);
        break;
      }
      case 'updateTask': {
        if (!task) return { error: 'tarefa não encontrada' };
        Object.assign(task, this.cleanTask(m.patch || {}, task), { updatedAt: now, updatedBy: by });
        break;
      }
      case 'deleteTask': {
        if (!task) return { error: 'tarefa não encontrada' };
        b.tasks = b.tasks.filter(t => t !== task);
        break;
      }
      case 'addComment': {
        if (!task) return { error: 'tarefa não encontrada' };
        const text = str(m.text, 2000).trim();
        if (!text) return { error: 'comentário vazio' };
        task.comments.push({ id: id(), author: by, text, at: now });
        task.updatedAt = now;
        break;
      }
      case 'setPeople': {
        if (!Array.isArray(m.people)) return { error: 'lista inválida' };
        b.people = m.people.slice(0, 100).map((p, i) => ({
          id: typeof p.id === 'string' && p.id ? str(p.id, 20) : id(), name: str(p.name, 40).trim() || 'Pessoa',
          email: /^[^\s@]+@[^\s@]+$/.test(p.email || '') ? str(p.email, 80).trim().toLowerCase() : '',
          color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : COLORS[i % COLORS.length],
        }));
        for (const t of b.tasks) if (t.assignee && !b.people.some(p => p.id === t.assignee)) t.assignee = null;
        break;
      }
      case 'setColumns': {
        if (!Array.isArray(m.columns) || !m.columns.length) return { error: 'precisa de pelo menos uma coluna' };
        const cols = m.columns.slice(0, 20).map(c => ({ id: typeof c.id === 'string' && c.id ? str(c.id, 20) : id(), name: str(c.name, 40).trim() || 'Coluna', done: !!c.done }));
        const removed = b.columns.filter(c => !cols.some(n => n.id === c.id));
        for (const r of removed) if (b.tasks.some(t => t.status === r.id)) return { error: `a coluna "${r.name}" ainda tem tarefas` };
        b.columns = cols;
        break;
      }
      default: return { error: 'operação desconhecida' };
    }
    b.version++;
    this.save();
    return { ok: true };
  }
}

module.exports = { Kanban };
