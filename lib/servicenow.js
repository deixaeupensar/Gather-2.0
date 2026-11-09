// Integração com o ServiceNow (Table API): tarefas de catálogo (sc_task) dos grupos do time,
// em duas vias — mover/atribuir no Kanban atualiza o chamado no ServiceNow.
// Configuração em data/servicenow.json (veja data/servicenow.example.json). A senha pode vir de SN_PASSWORD.
'use strict';
const fs = require('fs');
const path = require('path');

const COLORS = ['#EE3124', '#F37021', '#F9B10B', '#3BA55C', '#2D7DD2', '#7B4FC9', '#D6458B', '#1FA3A3', '#8A6A4F', '#5B6470'];
// estados da sc_task → colunas do Kanban
const COLUMNS = [
  { id: '1', name: 'Aberto', done: false },
  { id: '2', name: 'Em andamento', done: false },
  { id: '-5', name: 'Pendente', done: false },
  { id: 'closed', name: 'Fechado', done: true },
];
const stateToCol = s => (['3', '4', '7'].includes(String(s)) ? 'closed' : COLUMNS.some(c => c.id === String(s)) ? String(s) : '1');
const colToState = { '1': '1', '2': '2', '-5': '-5', closed: '3' };
const PRIO = { 1: 'critica', 2: 'alta', 3: 'media', 4: 'baixa', 5: 'baixa' };
// título do cartão: primeira frase útil da descrição da requisição (ou da tarefa), sem saudações nem textos-padrão
const GREETING = /^(bom dia|boa tarde|boa noite|ol[aá]|oi|prezad[oa]s?|caro|cara|tudo bem)\b[\s!,.]*$/i;
const TEMPLATE = /^(realizar (o |a )?(desenvolvimento|an[aá]lise|entendimento|implementa)|refer[eê]ncia da solicita|fluxo de aprova)/i;
function firstUseful(text) {
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.replace(/^(bom dia|boa tarde|boa noite|ol[aá]|prezad[oa]s?)[\s!,.]+/i, '').trim();
    if (line.length < 8 || GREETING.test(line) || TEMPLATE.test(line)) continue;
    return line.length > 90 ? line.slice(0, 88).replace(/\s+\S*$/, '') + '…' : line;
  }
  return '';
}
const cardTitle = t => firstUseful(t['request_item.description']) || firstUseful(t.description) || t['request_item.short_description'] || t.short_description || '(sem descrição)';
const EXAMPLE = {
  instance: 'https://SUA-INSTANCIA.service-now.com',
  user: 'usuario.de.integracao',
  password: '',
  table: 'sc_task',
  pollSeconds: 60,
  closedDays: 7,
  groups: [
    { key: 'aprovadores', label: 'Aprovadores / Avaliadores', name: 'NOME EXATO DO GRUPO NO SERVICENOW' },
    { key: 'devs', label: 'Desenvolvedores', name: 'NOME EXATO DO GRUPO NO SERVICENOW' },
  ],
};

class ServiceNow {
  constructor(dataDir, onChange) {
    this.file = path.join(dataDir, 'servicenow.json');
    this.example = path.join(dataDir, 'servicenow.example.json');
    if (!fs.existsSync(this.example)) fs.writeFileSync(this.example, JSON.stringify(EXAMPLE, null, 2));
    this.onChange = onChange || (() => {});
    this.boards = new Map();   // key -> board
    this.users = new Map();    // e-mail -> sys_id
    this.journals = new Map(); // sys_id -> { at, list } (cache curto do histórico)
    this.load();
    // editou o data/servicenow.json? recarrega sozinho, sem reiniciar o servidor
    fs.watchFile(this.file, { interval: 3000 }, () => {
      const ok = this.load();
      console.log(ok ? `ServiceNow: configuração recarregada (${this.cfg.groups.map(g => g.label).join(', ')})` : `ServiceNow: configuração incompleta — falta ${this.publicConfig().missing.join(', ') || '?'}${this.configError ? ' / ' + this.configError : ''}`);
      for (const g of this.cfg.groups) this.onChange(g.key, -1);
    });
  }
  load() {
    let cfg = {};
    this.configError = null;
    if (fs.existsSync(this.file)) {
      try { cfg = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^﻿/, '')); } // tolera BOM do Bloco de Notas
      catch (e) { this.configError = 'data/servicenow.json inválido: ' + e.message; console.error(this.configError); }
    }
    cfg = { ...EXAMPLE, ...cfg };
    if (process.env.SN_INSTANCE) cfg.instance = process.env.SN_INSTANCE;
    if (process.env.SN_USER) cfg.user = process.env.SN_USER;
    if (process.env.SN_PASSWORD) cfg.password = process.env.SN_PASSWORD;
    cfg.instance = String(cfg.instance || '').replace(/\/+$/, '');
    cfg.groups = (cfg.groups || []).filter(g => g && /^[a-z0-9_-]{1,30}$/.test(g.key) && g.name && !/NOME EXATO/.test(g.name));
    this.cfg = cfg;
    this.enabled = /^https?:\/\//.test(cfg.instance) && !/SUA-INSTANCIA/.test(cfg.instance) && !!cfg.user && !!cfg.password && cfg.groups.length > 0;
    clearInterval(this.timer);
    if (this.enabled) {
      this.refreshAll();
      this.timer = setInterval(() => this.refreshAll(), Math.max(20, +cfg.pollSeconds || 60) * 1000);
    }
    return this.enabled;
  }
  publicConfig() {
    return {
      enabled: this.enabled, instance: this.enabled ? this.cfg.instance : null, table: this.cfg.table,
      groups: this.cfg.groups.map(g => ({ key: g.key, label: g.label || g.name })),
      configError: this.configError,
      missing: this.enabled ? [] : [
        !/^https?:\/\//.test(this.cfg.instance) || /SUA-INSTANCIA/.test(this.cfg.instance) ? 'instance (URL da instância)' : null,
        !this.cfg.user ? 'user' : null, !this.cfg.password ? 'password (ou variável SN_PASSWORD)' : null,
        !this.cfg.groups.length ? 'groups (nomes dos grupos)' : null,
      ].filter(Boolean),
    };
  }
  async api(method, url, body) {
    const auth = Buffer.from(`${this.cfg.user}:${this.cfg.password}`).toString('base64');
    const r = await fetch(this.cfg.instance + url, {
      method, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Basic ' + auth, Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch {}
    if (!r.ok) {
      const msg = (data && data.error && (data.error.message + (data.error.detail ? ' — ' + data.error.detail : ''))) || text.slice(0, 200) || ('HTTP ' + r.status);
      throw new Error(`ServiceNow respondeu ${r.status}: ${msg}`);
    }
    if (r.headers.get('x-direct-response')) throw new Error('bloqueado pelo filtro da rede');
    return data;
  }
  async refreshAll() { for (const g of this.cfg.groups) await this.refreshGroup(g).catch(() => {}); }
  async refreshGroup(g) {
    const prev = this.boards.get(g.key);
    try {
      const enc = encodeURIComponent;
      const name = g.name.replace(/\^/g, '');
      const q = `assignment_group.name=${name}^active=true^NQassignment_group.name=${name}^active=false^closed_at>=javascript:gs.daysAgoStart(${+this.cfg.closedDays || 7})`;
      const fields = ['sys_id', 'number', 'short_description', 'description', 'state', 'priority', 'assigned_to', 'assigned_to.email', 'assigned_to.name',
        'due_date', 'opened_at', 'sys_updated_on', 'closed_at', 'request_item.number', 'request_item.short_description', 'request_item.description', 'request_item.cat_item.name', 'request_item.request.requested_for.name'].join(',');
      const [tasks, members] = await Promise.all([
        this.api('GET', `/api/now/table/${this.cfg.table}?sysparm_query=${enc(q)}&sysparm_fields=${enc(fields)}&sysparm_limit=500&sysparm_display_value=false&sysparm_exclude_reference_link=true`),
        this.api('GET', `/api/now/table/sys_user_grmember?sysparm_query=${enc('group.name=' + name)}&sysparm_fields=${enc('user,user.name,user.email')}&sysparm_limit=500&sysparm_exclude_reference_link=true`),
      ]);
      const people = new Map();
      const addPerson = (sys, nm, email) => {
        const key = (email || '').toLowerCase() || sys;
        if (!key || people.has(key)) return key;
        if (email) this.users.set(email.toLowerCase(), sys);
        people.set(key, { id: key, sys_id: sys, name: nm || email || 'Sem nome', email: (email || '').toLowerCase(), color: COLORS[people.size % COLORS.length] });
        return key;
      };
      for (const m of (members && members.result) || []) addPerson(m.user, m['user.name'], m['user.email']);
      const list = ((tasks && tasks.result) || []).map(t => ({
        id: t.sys_id, number: t.number, azureId: t.number,
        // títulos da tarefa e do item costumam ser genéricos: o cartão usa o começo do que a pessoa escreveu
        title: cardTitle(t), taskType: t.short_description || '',
        description: [t['request_item.description'], t.description && t.description !== t['request_item.description'] ? '— Tarefa —\n' + t.description : ''].filter(Boolean).join('\n\n'),
        status: stateToCol(t.state), state: t.state,
        assignee: t.assigned_to ? addPerson(t.assigned_to, t['assigned_to.name'], t['assigned_to.email']) : null,
        priority: PRIO[t.priority] || 'media', type: 'tarefa',
        due: t.due_date ? t.due_date.slice(0, 10) : null,
        tags: [t['request_item.short_description'] && t.short_description, t['request_item.cat_item.name']].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2),
        ritm: t['request_item.number'] || '', requestedFor: t['request_item.request.requested_for.name'] || '',
        openedAt: t.opened_at, updatedAt: t.sys_updated_on, closedAt: t.closed_at,
        link: `${this.cfg.instance}/${this.cfg.table}.do?sys_id=${t.sys_id}`, order: Date.parse((t.opened_at || '').replace(' ', 'T')) || 0, comments: [],
      }));
      const board = { key: g.key, label: g.label || g.name, group: g.name, columns: COLUMNS, people: [...people.values()], tasks: list, fetchedAt: new Date().toISOString(), error: null };
      const sig = JSON.stringify([board.people, board.tasks]);
      board.version = prev && prev.sig === sig ? prev.version : ((prev && prev.version) || 0) + 1;
      board.sig = sig;
      this.boards.set(g.key, board);
      if (!prev || prev.version !== board.version || prev.error) this.onChange(g.key, board.version);
      return board;
    } catch (e) {
      const board = { ...(prev || { key: g.key, label: g.label || g.name, group: g.name, columns: COLUMNS, people: [], tasks: [], version: 0 }), error: e.message, fetchedAt: new Date().toISOString() };
      board.version = (board.version || 0) + (prev && prev.error === e.message ? 0 : 1);
      this.boards.set(g.key, board);
      if (!prev || prev.error !== e.message) this.onChange(g.key, board.version);
      throw e;
    }
  }
  board(key) {
    const g = this.cfg.groups.find(x => x.key === key);
    if (!g) return null;
    const b = this.boards.get(key);
    if (!b) return { key, label: g.label || g.name, group: g.name, columns: COLUMNS, people: [], tasks: [], version: 0, loading: true };
    const { sig, ...out } = b;
    return out;
  }
  // mover / atribuir / anotar — só para tarefas que estão no quadro do grupo
  async update(key, sysId, patch, who) {
    const g = this.cfg.groups.find(x => x.key === key);
    const b = this.boards.get(key);
    if (!g || !b) throw new Error('grupo não encontrado');
    const t = b.tasks.find(x => x.id === sysId);
    if (!t) throw new Error('chamado não está no quadro deste grupo');
    const body = {}, changes = [];
    if (patch.status !== undefined && colToState[patch.status] && stateToCol(t.state) !== patch.status) {
      body.state = colToState[patch.status];
      changes.push(`estado → ${COLUMNS.find(c => c.id === patch.status).name}`);
    }
    if (patch.assignee !== undefined && (patch.assignee || null) !== (t.assignee || null)) {
      if (!patch.assignee) { body.assigned_to = ''; changes.push('atribuição removida'); }
      else {
        const p = b.people.find(x => x.id === patch.assignee);
        let sys = p && p.sys_id;
        const email = (p && p.email) || (String(patch.assignee).includes('@') ? patch.assignee : '');
        if (!sys && email) {
          sys = this.users.get(email);
          if (!sys) { const r = await this.api('GET', `/api/now/table/sys_user?sysparm_query=${encodeURIComponent('email=' + email)}&sysparm_fields=sys_id,name&sysparm_limit=1`); sys = r && r.result && r.result[0] && r.result[0].sys_id; if (sys) this.users.set(email, sys); }
        }
        if (!sys) throw new Error('não achei essa pessoa no ServiceNow (o e-mail precisa ser o mesmo do cadastro lá)');
        body.assigned_to = sys; changes.push(`atribuído a ${(p && p.name) || email}`);
      }
    }
    const note = String(patch.note || '').trim().slice(0, 4000);
    const comment = String(patch.comment || '').trim().slice(0, 4000);
    if (!changes.length && !note && !comment) return b;
    const whoTxt = `${who.name || 'alguém'}${who.email ? ' (' + who.email + ')' : ''}`;
    if (changes.length || note) body.work_notes = `[Voxel Hub] ${whoTxt}: ${[changes.join(', '), note].filter(Boolean).join(' — ')}`;
    // comentário adicional (visível para o solicitante): o autor no SN é o usuário de integração, então o nome vai no texto
    if (comment) body.comments = `${who.name || 'Equipe'} escreveu:\n${comment}`;
    await this.api('PATCH', `/api/now/table/${this.cfg.table}/${encodeURIComponent(sysId)}`, body);
    this.journals.delete(sysId);
    return this.refreshGroup(g);
  }
  // histórico de comentários e anotações de um chamado do quadro
  async journal(key, sysId) {
    const b = this.boards.get(key);
    if (!b || !b.tasks.some(x => x.id === sysId)) throw new Error('chamado não está no quadro deste grupo');
    const hit = this.journals.get(sysId);
    if (hit && Date.now() - hit.at < 15000) return hit.list;
    const enc = encodeURIComponent;
    let list;
    try {
      const r = await this.api('GET', `/api/now/table/sys_journal_field?sysparm_query=${enc(`element_id=${sysId}^elementINcomments,work_notes^ORDERBYDESCsys_created_on`)}&sysparm_fields=${enc('sys_created_on,sys_created_by,element,value')}&sysparm_limit=100`);
      list = ((r && r.result) || []).map(j => ({ at: j.sys_created_on, by: j.sys_created_by, kind: j.element === 'comments' ? 'comment' : 'note', text: j.value }));
    } catch {
      // sem acesso à sys_journal_field: usa o texto pronto dos campos do chamado
      const r = await this.api('GET', `/api/now/table/${this.cfg.table}/${enc(sysId)}?sysparm_fields=comments,work_notes&sysparm_display_value=true`);
      const rec = (r && r.result) || {};
      list = [];
      for (const [field, kind] of [['comments', 'comment'], ['work_notes', 'note']]) {
        for (const block of String(rec[field] || '').split(/\n(?=\d{4}-\d\d-\d\d \d\d:\d\d:\d\d - )/)) {
          const m = block.match(/^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) - (.+?)(?: \([^)]*\))?\n([\s\S]*)$/);
          if (m) list.push({ at: m[1], by: m[2], kind, text: m[3].trim() });
          else if (block.trim()) list.push({ at: '', by: '', kind, text: block.trim() });
        }
      }
      list.sort((a, c) => (c.at > a.at ? 1 : -1));
    }
    this.journals.set(sysId, { at: Date.now(), list });
    if (this.journals.size > 300) this.journals.delete(this.journals.keys().next().value);
    return list;
  }
}

module.exports = { ServiceNow };
