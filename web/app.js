const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const WS_KEY = 'og_ws_url';
const URL_KEY = 'og_gateway_url';
const PROJ_KEY = 'og_projects_v1';
const ACTIVE_KEY = 'og_active_project';

const COLORS = ['#00a884','#53bdeb','#d4a373','#e879f9','#f87171','#fbbf24','#34d399','#60a5fa','#a78bfa','#fb7185'];
function uid() { return 'p_' + Math.random().toString(36).slice(2, 10); }
function esc(s){ return String(s||''); }
// ---------- Helpers (UI-only) ----------
function timeAgo(ts){
  if(!ts) return 'Never edited';
  const s = Math.max(1, Math.floor((Date.now()-ts)/1000));
  if(s<60) return 'Edited just now';
  if(s<3600) return `Edited ${Math.floor(s/60)}m ago`;
  if(s<86400) return `Edited ${Math.floor(s/3600)}h ago`;
  const d = Math.floor(s/86400);
  return `Edited ${d}d ago`;
}
function timeLabel(ts){
  if(!ts) return '';
  try{ return new Date(ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }catch{ return ''; }
}
function middleEllipsis(str, max=44){
  const s = String(str||''); if(s.length<=max) return s;
  const keep = Math.max(10, max-1);
  const head = Math.ceil(keep*0.45), tail = Math.floor(keep-head);
  return s.slice(0, head) + '…' + s.slice(-tail);
}
function shortPath(p){
  if(!p) return 'no folder';
  const parts = String(p).split('/').filter(Boolean);
  if(parts.length<=2) return (String(p).startsWith('/')?'/':'')+parts.join('/');
  return '… / ' + parts.slice(-2).join(' / ');
}
function folderName(p){
  const parts = String(p||'').split('/').filter(Boolean);
  return parts[parts.length-1] || 'Files';
}
function fileIcon(e){
  if(e.type==='dir') return '📁';
  if(e.type==='link') return '🔗';
  const n = String(e.name||'').toLowerCase();
  if(/\.(png|jpg|jpeg|gif|svg|webp)$/.test(n)) return '🖼';
  if(/\.(js|ts|tsx|jsx|json|kt|html|css|md|gradle|sh)$/.test(n)) return '📄';
  if(/\.(zip|tar|gz|apk)$/.test(n)) return '📦';
  return '📄';
}

// ---------- Username (header) — defaults to Pravesh Sharma, editable in Settings ----------
let userName = localStorage.getItem('og_username') || 'Pravesh Sharma';
function showUserName() {
  const el = $('#user-name');
  if (el && userName) {
    const h = new Date().getHours();
    const greet = h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
    el.textContent = `${greet}, ${userName.split(' ')[0]} ✨`;
  }
  const inp = $('#username'); if (inp && document.activeElement !== inp) inp.value = userName || '';
}
$('#save-username')?.addEventListener('click', () => {
  userName = ($('#username').value || '').trim();
  localStorage.setItem('og_username', userName);
  showUserName(); toast(userName ? 'Name saved' : 'Name cleared');
});
showUserName();

// ---------- Theme ----------
(function initTheme() {
  const saved = localStorage.getItem('og_theme');
  const root = document.documentElement;
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
})();
$('#theme-btn')?.addEventListener('click', () => {
  const root = document.documentElement;
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  localStorage.setItem('og_theme', next);
  toast(next === 'light' ? '☀️ Light mode' : '🌙 Dark mode');
});

// ---------- Project store ----------
let projects = [];
let activeProjectId = null;
let activeView = 'chat'; // 'chat' | 'terminal' | 'settings' | 'preview'
let defaultCwd = null;
let gatewayOnline = false;
let gitBranch = '';

function migrateProject(p) {
  if (p && !Array.isArray(p.sessions)) {
    const s = { id: uid(), name: 'Session 1', model: p.model || '', opencodeSession: p.opencodeSession || null, messages: Array.isArray(p.messages)?p.messages:[] };
    p.sessions = [s]; p.activeSessionId = s.id;
    delete p.model; delete p.opencodeSession; delete p.messages;
  }
  if (p && (!p.sessions || !p.sessions.length)) {
    const s = { id: uid(), name: 'Session 1', model: '', opencodeSession: null, messages: [] };
    p.sessions = [s]; p.activeSessionId = s.id;
  }
  if (p && !p.activeSessionId) p.activeSessionId = p.sessions[0].id;
  return p;
}
function loadProjects() {
  try { projects = JSON.parse(localStorage.getItem(PROJ_KEY) || '[]'); } catch { projects = []; }
  if (!Array.isArray(projects)) projects = [];
  projects = projects.map(migrateProject);
  activeProjectId = localStorage.getItem(ACTIVE_KEY) || (projects[0] && projects[0].id) || null;
}
function saveProjects() {
  try {
    localStorage.setItem(PROJ_KEY, JSON.stringify(projects.map(p => ({
      ...p,
      sessions: (p.sessions||[]).map(s => ({...s, messages: (s.messages||[]).slice(-200)}))
    }))));
  } catch {}
  if (activeProjectId) localStorage.setItem(ACTIVE_KEY, activeProjectId);
}
function getProject(id) { return projects.find(p => p.id === (id || activeProjectId)); }
function getActiveSession(p) { p = p || getProject(); if(!p) return null; return (p.sessions||[]).find(s=>s.id===p.activeSessionId) || p.sessions[0] || null; }
function createSession(p, name) {
  p = p || getProject(); if(!p) return null;
  const n = name || ('Session ' + ((p.sessions||[]).length + 1));
  const s = { id: uid(), name: n, model: '', opencodeSession: null, messages: [] };
  p.sessions = p.sessions || []; p.sessions.push(s); p.activeSessionId = s.id;
  saveProjects(); return s;
}
function ensureDefaultProject() {
  if (projects.length) return;
  const sid = uid();
  const p = { id: uid(), name: 'My Project', icon: '📁', color: COLORS[0], cwd: defaultCwd || '', activeSessionId: sid, sessions: [{ id: sid, name: 'Session 1', model: '', opencodeSession: null, messages: [] }] };
  projects.push(p); activeProjectId = p.id; saveProjects();
}
function projectSubtitle(p) {
  // keep for tooltips/modals; chat header uses chatSubtitle (reference style)
  const cwd = p.cwd ? p.cwd.replace(/^\/Users\/[^/]+/, '~').split('/').slice(-2).join('/') : 'no folder';
  const s = getActiveSession(p);
  const m = s && s.model ? s.model.split('/').pop() : 'default model';
  const sc = (p.sessions||[]).length;
  return `${cwd} · ${m}${sc>1 ? ' · '+sc+' sessions' : ''}`;
}
function chatSubtitle(p) {
  const br = gitBranch || 'main';
  return `${br} · ${gatewayOnline ? 'Connected' : 'Disconnected'}`;
}

// ---------- Markdown (small, dependency-free, safe) ----------
function inlineMd(s) {
  return s
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function renderMd(text) {
  const src = String(text || '');
  const blocks = [];
  // 1) extract fenced code first, escape everything at the end
  const fenced = src.replace(/```(\w*)?\n?([\s\S]*?)(?:\n```|$)/g, (_, lang, code) => {
    const id = '%%CODE' + blocks.length + '%%';
    blocks.push('<pre><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>');
    return '\n' + id + '\n';
  });
  const lines = fenced.split('\n');
  let html = '', inUl = false, inOl = false;
  const closeLists = () => { if (inUl) { html += '</ul>'; inUl = false; } if (inOl) { html += '</ol>'; inOl = false; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (/^%%CODE\d+%%$/.test(line)) { closeLists(); html += line; continue; }
    if (!line) { closeLists(); continue; }
    if (/^-{3,}$/.test(line)) { closeLists(); html += '<hr/>'; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeLists(); html += `<h${h[1].length + 2} class="md-h">${inlineMd(escapeHtml(h[2]))}</h${h[1].length + 2}>`; continue; }
    if (/^>/.test(line)) { closeLists(); html += `<blockquote>${inlineMd(escapeHtml(line.slice(1).trim()))}</blockquote>`; continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) { if (!inUl) { closeLists(); html += '<ul>'; inUl = true; } html += `<li>${inlineMd(escapeHtml(ul[1]))}</li>`; continue; }
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) { if (!inOl) { closeLists(); html += '<ol>'; inOl = true; } html += `<li>${inlineMd(escapeHtml(ol[1]))}</li>`; continue; }
    closeLists();
    const safe = inlineMd(escapeHtml(line));
    if (/^(https?:\/\/\S+)$/.test(line)) html += `<p><a href="${safe}" target="_blank" rel="noopener">${safe}</a></p>`;
    else html += `<p>${safe}</p>`;
  }
  closeLists();
  for (let i = 0; i < blocks.length; i++) html = html.replace('%%CODE' + i + '%%', blocks[i]);
  return html;
}

// ---------- Rendering ----------
function renderProjectList() {
  const pc = $('#projects-count'); if (pc) pc.textContent = `${projects.length} repositories`;
  const rs = $('#remote-sub'); if (rs) rs.innerHTML = gatewayOnline ? '<span class="sdot" style="background:var(--success)"></span>1 online' : 'offline — tap to open terminal';
  const list = $('#project-list'); if (!list) return;
  const q = ($('#project-search')?.value || '').toLowerCase();
  const items = projects.filter(p => !q || p.name.toLowerCase().includes(q) || (p.cwd||'').toLowerCase().includes(q));
  list.innerHTML = items.map(p => {
    const s = getActiveSession(p);
    const msgs = (s && s.messages) || [];
    const lastMsg = msgs.slice(-1)[0];
    const lastTs = lastMsg && lastMsg.time ? lastMsg.time : null;
    const br = gitBranch || 'main';
    const pathLine = p.cwd ? shortPath(p.cwd) : 'no folder';
    const edited = lastTs ? timeAgo(lastTs) : 'No messages yet';
    const status = gatewayOnline
      ? '<span class="project-status"><span class="sdot on"></span>Running</span>'
      : '<span class="project-status"><span class="sdot amber"></span>Stopped</span>';
    const av = p.icon || (p.name||'P').trim().charAt(0).toUpperCase();
    return `<div class="project-item ${p.id===activeProjectId && activeView==='chat' ? 'active':''}" data-id="${p.id}" role="button" tabindex="0">
      <div class="avatar" style="background:${p.color||COLORS[0]}">${escapeHtml(av)}</div>
      <div class="project-meta">
        <div class="name">${escapeHtml(p.name||'Project')}</div>
        <div class="path" title="${escapeHtml(p.cwd||'')}">${escapeHtml(pathLine)}</div>
        <div class="meta">${edited} · ${br}</div>
      </div>
      ${status}
    </div>`;
  }).join('') || `<div style="padding:18px;color:var(--muted);font-size:13px">No projects yet. Tap ＋ to create one.</div>`;
  list.querySelectorAll('.project-item').forEach(el => el.addEventListener('click', () => selectProject(el.dataset.id)));
}
function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderSessionTabs(p) {
  p = p || getProject(); const bar = $('#session-tabs'); if (!bar || !p) return;
  bar.innerHTML = (p.sessions||[]).map(s => `<button class="stab ${s.id===p.activeSessionId?'active':''} ${s.busy?'busy':''}" data-sid="${s.id}"><span class="dot"></span>${escapeHtml(s.name||'Session')}<span class="x" data-del="${s.id}" title="Close session">×</span></button>`).join('');
  bar.querySelectorAll('.stab').forEach(el => el.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]'); if (del) { deleteSession(p.id, del.dataset.del); e.stopPropagation(); return; }
    switchSession(p.id, el.dataset.sid);
  }));
  const s = getActiveSession(p); const sel = $('#session-model');
  if (sel) sel.value = (s && s.model) || '';
}
// True only when the reply actually contains a diff / code change.
function hasDiff(text){
  const t = String(text||'');
  if(/```\s*diff/i.test(t)) return true;
  if(/^diff --git /m.test(t)) return true;
  const lines = t.split('\n').filter(l => /^[+-](?![+-])\s*\S/.test(l));
  // at least 2 changed lines in a code block
  const inCode = /```[\s\S]*?\n[+-]/m.test(t);
  return inCode && lines.length >= 2;
}
function renderMessages(p, sid) {
  const box = $('#project-messages'); if (!box) return;
  p = p || getProject(); if (!p) { box.innerHTML=''; return; }
  const s = sid ? (p.sessions||[]).find(x=>x.id===sid) : getActiveSession(p);
  const msgs = (s && s.messages)||[];
  if (!msgs.length) {
    box.innerHTML = `<div class="starter-card">
      <h3>Start with an idea</h3>
      <p>Pick one to begin — it sends in this project.</p>
      <div class="starter-chips">
        <button class="chip" type="button" data-starter="Explain this project in simple words, then suggest 3 improvements.">Explain this project</button>
        <button class="chip" type="button" data-starter="Review this project and fix the first issue you find.">Fix first issue</button>
        <button class="chip" type="button" data-starter="Add a new small feature: ">Add a feature</button>
      </div>
    </div>`;
    return;
  }
  // Group consecutive messages from the same sender (gap 8dp inside, 12dp between groups).
  const groups = [];
  for (const m of msgs) {
    const g = groups[groups.length-1];
    if (g && g.role === m.role) g.msgs.push(m);
    else groups.push({ role: m.role, msgs: [m] });
  }
  box.innerHTML = groups.map(g => {
    const last = g.msgs[g.msgs.length-1];
    const t = last.time ? timeLabel(last.time) : '';
    // AI replies render as decorated markdown; user messages stay plain.
    const bubbles = g.msgs.map(m => m.role === 'assistant'
      ? `<div class="msg assistant md">${renderMd(m.text)}</div>`
      : `<div class="msg ${m.role}">${escapeHtml(m.text)}</div>`).join('');
    // No Accept/Undo — changes apply directly; revert by asking. Copy/Regen stay.
    let actions = '';
    if (g.role === 'assistant' && last) {
      actions = `<div class="msg-actions">
        <button class="btn secondary small" type="button" data-act="copy">Copy</button>
        <button class="btn secondary small" type="button" data-act="regen">Regenerate</button>
      </div>`;
    }
    return `<div class="msg-group ${g.role}">${bubbles}${t ? `<div class="msg-time">${escapeHtml(t)}</div>` : ''}${actions}</div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
  // Copy / Regenerate on each assistant group; Accept / Undo only toast (no backend change).
  box.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const grp = btn.closest('.msg-group');
      // Find the assistant text of this group (last bubble)
      const bubble = grp && grp.querySelector('.msg.assistant');
      const text = bubble ? bubble.textContent : '';
      const act = btn.dataset.act;
      if (act === 'copy') {
        try { await navigator.clipboard.writeText(text); toast('Copied'); }
        catch { toast('Copy failed — long-press to select'); }
      } else if (act === 'regen') {
        const lastUser = msgs.filter(m=>m.role==='user').slice(-1)[0];
        if (lastUser) sendPrompt(lastUser.text, false);
        else toast('Nothing to regenerate');
      } else if (act === 'accept') toast('Change accepted ✓');
      else if (act === 'undo') toast('Ask in chat to revert this change');
    });
  });
}
function addSessionMessage(p, sid, role, text, persist=true) {
  if (!p) return;
  const s = (p.sessions||[]).find(x=>x.id===sid) || getActiveSession(p); if (!s) return;
  if (persist) { s.messages = s.messages || []; s.messages.push({ role, text: String(text), time: Date.now() }); if (s.messages.length > 300) s.messages = s.messages.slice(-300); saveProjects(); }
  if (activeProjectId === p.id && p.activeSessionId === s.id && activeView === 'chat') {
    const box = $('#project-messages'); if (!box) return;
    // Clear starter card on first message
    if (box.querySelector('.starter-card')) { renderMessages(p, sid); return; }
    const grp = document.createElement('div'); grp.className = 'msg-group ' + role;
    const el = document.createElement('div'); el.className = 'msg ' + role; el.textContent = String(text);
    const tl = document.createElement('div'); tl.className = 'msg-time'; tl.textContent = timeLabel(Date.now());
    grp.appendChild(el); grp.appendChild(tl);
    box.appendChild(grp); box.scrollTop = box.scrollHeight;
  }
  if (role === 'user' || role === 'assistant') renderProjectList();
}
// compat wrapper (old calls)
function addProjectMessage(p, role, text, persist=true) { const s=getActiveSession(p); addSessionMessage(p, s&&s.id, role, text, persist); }

function switchSession(pid, sid) {
  const p = getProject(pid); if(!p) return;
  p.activeSessionId = sid; saveProjects();
  if (activeProjectId===p.id) { renderSessionTabs(p); renderMessages(p, sid); $('#chat-subtitle').textContent = chatSubtitle(p); syncSessionConfig(p, sid); }
  renderProjectList();
}
function deleteSession(pid, sid) {
  const p = getProject(pid); if(!p) return;
  if ((p.sessions||[]).length <= 1) { toast('Keep at least one session'); return; }
  if (!confirm('Close this session? Its history will be removed from this project.')) return;
  p.sessions = p.sessions.filter(s=>s.id!==sid);
  if (p.activeSessionId===sid) p.activeSessionId = p.sessions[0].id;
  saveProjects(); if(activeProjectId===pid){ renderSessionTabs(p); renderMessages(p); }
  wsSend({type:'opencode_reset', projectId:pid, sessionId:sid}); // best-effort cleanup server state
  renderProjectList(); toast('Session closed');
}
function syncSessionConfig(p, sid) {
  p = p || getProject(); const s = sid ? (p.sessions||[]).find(x=>x.id===sid) : getActiveSession(p); if(!p||!s) return;
  wsSend({type:'session_config', projectId:p.id, sessionId:s.id, model:s.model||null, opencodeSession:s.opencodeSession||null, thinking:!!s.thinking});
}

function setMainView(view) {
  activeView = view;
  $('#view-chat').style.display = (view==='chat') ? 'flex' : 'none';
  $('#view-preview').style.display = (view==='preview') ? 'flex' : 'none';
  $('#view-terminal').style.display = view==='terminal' ? 'flex' : 'none';
  $('#view-files').style.display = view==='files' ? 'flex' : 'none';
  $('#view-settings').style.display = view==='settings' ? 'flex' : 'none';
  $('#view-empty').style.display = 'none';
  $('#nav-files').classList.toggle('active', view==='files');
  $('#nav-terminal').classList.toggle('active', view==='terminal');
  $('#nav-settings').classList.toggle('active', view==='settings');
  $$('#chat-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === view));
  if (view !== 'chat') { $$('.project-item').forEach(el=>el.classList.remove('active')); $('#app').classList.add('show-main'); }
  if (view === 'terminal') {
    const s = $('#ws-state'); if (s) { $('#ws-state-term').textContent = s.textContent; $('#ws-state-term').className = s.className; }
    // open the terminal inside the active project's folder (same place OpenCode runs)
    const p = getProject();
    const cwd = (p && p.cwd) || defaultCwd || '';
    if (cwd) { $('#term-subtitle').textContent = cwd.replace(/^\/Users\/[^/]+/, '~'); runTermCmd(`cd "${cwd.replace(/"/g, '\\"')}"`); }
    else $('#term-subtitle').textContent = 'Host shell · cwd tracked';
  }
  if (view === 'settings') syncSettingsStatus();
  if (view === 'files') openFileExplorer();
  if (view === 'preview') loadPreview();
  renderProjectList();
}
function loadPreview() {
  const p = getProject(); if (!p) return;
  const urlInput = $('#preview-url');
  const saved = (p.previewUrl || '').trim();
  if (urlInput && !urlInput.value) urlInput.value = saved;
  const frame = $('#preview-frame'); const wrap = $('.preview-wrap');
  const url = (urlInput && urlInput.value.trim()) || saved;
  if (url && frame) { if (frame.getAttribute('src') !== url) frame.src = url; wrap && wrap.classList.add('filled'); }
  else { wrap && wrap.classList.remove('filled'); }
}
function showChatView() {
  const p = getProject();
  if (!p) { $('#view-chat').style.display='none'; $('#view-empty').style.display='flex'; return; }
  setMainView('chat');
  $('#view-empty').style.display='none';
  const av = p.icon || (p.name||'P').trim().charAt(0).toUpperCase();
  $('#chat-avatar').textContent = av; $('#chat-avatar').style.background = p.color || COLORS[0];
  const ct = $('#chat-title'); if (ct) { ct.textContent = p.name || 'Project'; ct.title = p.name || 'Project'; }
  const cs = $('#chat-subtitle'); const sub = chatSubtitle(p); if (cs) { cs.textContent = sub; cs.title = sub; }
  renderSessionTabs(p);
  renderMessages(p);
  $('#app').classList.add('show-main');
  renderProjectList();
  // sync server to this project's config
  wsSend({ type:'project_switch', projectId: p.id });
  wsSend({ type:'project_config', projectId: p.id, cwd: p.cwd || defaultCwd || '' });
  syncSessionConfig(p);
}
function selectProject(id) {
  activeProjectId = id; localStorage.setItem(ACTIVE_KEY, id);
  showChatView();
}
function backToList() { $('#app').classList.remove('show-main'); activeView='chat'; renderProjectList(); }

// ---------- Status / WS ----------
let ws = null, wsIntentionalClose = false, wsBackoff = 1500, wsTimer = null;
function defaultWs() { const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'; return `${proto}//${location.host}/ws`; }
function setWsPill(text, cls) {
  ['#ws-state','#ws-state-term','#ws-state-settings'].forEach(sel => { const el=$(sel); if(!el) return; el.textContent=text; el.className= sel==='#ws-state-settings' ? '' : 'pill '+cls; if(sel==='#ws-state-settings') el.textContent=text; });
  const connected = cls === 'ok';
  const banner = $('#conn-banner');
  if (banner) banner.classList.toggle('hidden', connected);
  const input = $('#opencode-input'), send = $('#send-btn');
  if (input) { input.disabled = !connected; if (!connected) input.placeholder = 'Disconnected — tap Reconnect'; else input.placeholder = 'Describe what to build'; }
  if (send) send.disabled = !connected;
  ['#mic-btn','#attach-btn','#prio-btn'].forEach(sel => { const b = $(sel); if (b) b.disabled = !connected; });
}
function wsSend(obj){ if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function scheduleWsReconnect() {
  const wait = wsBackoff; wsBackoff = Math.min(wsBackoff * 2, 15000);
  if (wsTimer) clearTimeout(wsTimer);
  wsTimer = setTimeout(() => { if (!document.hidden) connectWs(); }, wait);
}
function connectWs() {
  const url = localStorage.getItem(WS_KEY) || defaultWs();
  if (ws) { wsIntentionalClose = true; try { ws.close(); } catch {} ws = null; }
  wsIntentionalClose = false;
  ws = new WebSocket(url);
  ws.onopen = () => {
    wsBackoff = 1500; setWsPill('Connected','ok');
    wsSend({type:'opencode_models'});
    const p = getProject();
    if (p) {
      wsSend({type:'project_switch', projectId:p.id});
      wsSend({type:'project_config', projectId:p.id, cwd:p.cwd||defaultCwd||''});
      (p.sessions||[]).forEach(s => wsSend({type:'session_config', projectId:p.id, sessionId:s.id, model:s.model||null, opencodeSession:s.opencodeSession||null}));
    } else wsSend({type:'opencode_info'});
  };
  ws.onclose = () => { setWsPill('Disconnected','bad'); if (!wsIntentionalClose) scheduleWsReconnect(); };
  ws.onerror = () => { setWsPill('Error','bad'); };
  ws.onmessage = (e) => {
    let j; try { j = JSON.parse(e.data); } catch { return; }
    handleServerMsg(j);
  };
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && (!ws || ws.readyState !== WebSocket.OPEN)) { wsBackoff = 1500; connectWs(); } });

function handleServerMsg(j) {
  const pid = j.projectId || activeProjectId;
  const sid = j.sessionId || (getProject(pid) && getProject(pid).activeSessionId) || 'default';
  const p = pid ? getProject(pid) : getProject();
  if (j.type==='user' || j.type==='assistant') { if(p) addSessionMessage(p, sid, j.type, j.text); }
  else if (j.type==='system') { /* quiet */ }
  else if (j.type==='terminal') addTerm(j.text);
  else if (j.type==='terminal_done') onTerminalDone(j.exitCode || 0);
  else if (j.type==='opencode_text') { clearSlowTimer(); if(p) appendAssistantStream(p, sid, j.text); }
  else if (j.type==='opencode_think' || j.type==='opencode_tool' || j.type==='opencode_event') { if(p) appendStep(p, sid, j.text); }
  else if (j.type==='opencode_meta') { if(p) addSessionMessage(p, sid, 'system', j.text); }
  else if (j.type==='opencode_done') { clearSlowTimer(); opencodeCurrentDone = true; if(p) finalizeAssistantStream(p, sid); renderSessionTabs(p); setBusyUI(false); if (document.hidden) notifyDone('Code-Go', (p && p.name) || 'AI finished'); }
  else if (j.type==='opencode_info') updateOpenCodeInfo(j);
  else if (j.type==='opencode_models_list') fillModelList(j.models || []);
}

async function health() {
  const set = (ok) => { gatewayOnline = ok;
    const ht=$('#health-text'); if(ht) ht.textContent=ok?'Connected':'Disconnected';
    const hd=$('#health .dot'); if(hd) hd.className='dot '+(ok?'on':'off');
    const h2=$('#health2'); if(h2) h2.textContent=ok?'Online':'Offline';
    if (ws && ws.readyState===WebSocket.OPEN) setWsPill('Connected','ok'); else if (!ok && ws==null) setWsPill('Disconnected','bad');
  };
  try {
    const r = await fetch('/api/health', { cache: 'no-store' }); const j = await r.json();
    set(!!j.ok);
    if (j.branch && j.branch !== '—') gitBranch = j.branch;
    // Name is user-owned — system username is NOT used to override it.
    showUserName();
    if (j.project && !defaultCwd) defaultCwd = j.project;
    if (j.shell) { const el=$('#shell-state'); if(el) el.textContent = j.platform==='darwin'?'Mac':(j.platform==='android'?'Termux':j.platform||'host'); const sub=$('#shell-sub'); if(sub) sub.textContent=String(j.shell).split('/').pop(); }
    if (j.opencode !== undefined) { const el=$('#opencode-state'); if(el) el.textContent=j.opencode?'Ready':'CLI missing'; const sub=$('#opencode-sub'); if(sub) sub.textContent=j.opencode?'opencode run available':'Install opencode, restart server'; }
    const up=$('#uptime'); if(up) up.textContent=new Date(j.time).toLocaleTimeString();
  } catch { set(false); }
}
function syncSettingsStatus(){ const s=$('#ws-state'); if(s) $('#ws-state-settings').textContent=s.textContent; health(); }

// ---------- OpenCode (per project) ----------
let opencodeSlowTimer = null, opencodeCurrentDone = true, currentModel = '';
const streams = {}; // `${pid}:${sid}` -> {el, text}
function clearSlowTimer(){ if(opencodeSlowTimer){ clearTimeout(opencodeSlowTimer); opencodeSlowTimer=null; } }
function streamKey(pid,sid){ return pid+':'+(sid||'default'); }
function appendAssistantStream(p, sid, text) {
  if (!p) return;
  const sObj = (p.sessions||[]).find(x=>x.id===sid) || getActiveSession(p);
  const key = streamKey(p.id, sObj && sObj.id); const box = $('#project-messages');
  if (!streams[key]) {
    const el = document.createElement('div'); el.className='msg assistant';
    el.innerHTML = '<div class="elapsed"></div><details class="steps" style="display:none"><summary>💭 Thinking…</summary><pre class="steps-log"></pre></details><div class="body"></div>';
    streams[key] = { el, text: '', steps: [], startedAt: Date.now() };
    if (activeProjectId===p.id && p.activeSessionId=== (sObj&&sObj.id) && box) { box.appendChild(el); box.scrollTop = box.scrollHeight; }
  }
  { // live elapsed timer so a waiting reply never looks frozen
    const st = streams[key]; const el = st.el.querySelector('.elapsed');
    const tick = () => { if (el) el.textContent = '⏳ ' + Math.round((Date.now() - st.startedAt) / 1000) + 's · working… tap ■ to stop'; };
    tick();
    clearInterval(st.tickId); st.tickId = setInterval(tick, 1000);
  }
  streams[key].text += String(text);
  // live-decorate: re-parse markdown at most once per animation frame
  const st = streams[key];
  if (!st.renderQueued) {
    st.renderQueued = true;
    requestAnimationFrame(() => {
      st.renderQueued = false;
      const body = st.el.querySelector('.body');
      if (body) body.innerHTML = renderMd(st.text);
    });
  }
  if (activeProjectId===p.id && p.activeSessionId=== (sObj&&sObj.id) && box) box.scrollTop = box.scrollHeight;
}
function appendStep(p, sid, text) {
  if (!p || typeof text !== 'string') return;
  if (text.startsWith('⏳ still working')) return; // heartbeat — elapsed timer already shows it
  const sObj = (p.sessions||[]).find(x=>x.id===sid) || getActiveSession(p);
  const key = streamKey(p.id, sObj && sObj.id);
  let st = streams[key];
  if (!st) { appendAssistantStream(p, sid, ''); st = streams[key]; }
  if (!st) return;
  st.steps.push(String(text));
  if (st.steps.length > 40) st.steps = st.steps.slice(-40);
  const details = st.el.querySelector('.steps'); const pre = st.el.querySelector('.steps-log');
  if (details && pre) { details.style.display = ''; pre.textContent = st.steps.join('\n'); }
  const box = $('#project-messages');
  if (activeProjectId===p.id && p.activeSessionId=== (sObj&&sObj.id) && box) box.scrollTop = box.scrollHeight;
}
function finalizeAssistantStream(p, sid) {
  if (!p) return;
  const sObj = (p.sessions||[]).find(x=>x.id===sid) || getActiveSession(p);
  const key = streamKey(p.id, sObj && sObj.id); const st = streams[key];
  if (st) { clearInterval(st.tickId); const el = st.el.querySelector('.elapsed'); if (el) el.textContent = ''; }
  if (st && st.text && sObj) {
    sObj.messages = sObj.messages || []; sObj.messages.push({ role:'assistant', text: st.text, time: Date.now() });
    if (sObj.messages.length > 300) sObj.messages = sObj.messages.slice(-300);
    saveProjects(); renderProjectList();
    if (activeProjectId===p.id && p.activeSessionId===sObj.id) renderMessages(p, sObj.id);
  }
  delete streams[key];
}
function updateOpenCodeInfo(j) {
  const pid = j.projectId || activeProjectId;
  const sid = j.sessionId;
  const p = pid ? getProject(pid) : null;
  if (p) {
    if (j.cwd) p.cwd = j.cwd;
    const s = sid ? (p.sessions||[]).find(x=>x.id===sid) : getActiveSession(p);
    if (s) {
      if (j.session !== undefined) s.opencodeSession = j.session || null;
      if (j.model !== undefined) s.model = j.model || '';
      if (j.thinking !== undefined) s.thinking = !!j.thinking;
      if (j.busy !== undefined) { s.busy = !!j.busy; if (activeProjectId===p.id && sid===s.id) setBusyUI(!!j.busy); }
      saveProjects();
    }
    if (activeProjectId === p.id) {
      $('#chat-subtitle').textContent = chatSubtitle(p);
      renderSessionTabs(p);
      const tb = $('#think-btn'); if (tb && s) { tb.classList.toggle('on', !!s.thinking); tb.textContent = s.thinking ? '💭 Deep' : '💭 Think'; }
      if ($('#project-modal-back').classList.contains('show') && s) $('#proj-session-id').textContent = s.opencodeSession || 'new session';
    }
    renderProjectList();
  }
}
function fillModelList(models) {
  const opts = '<option value="">Default (auto)</option>' + models.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  ['#opencode-model','#session-model'].forEach(selId => {
    const sel = $(selId); if(!sel) return;
    const prev = sel.value;
    sel.innerHTML = opts; sel.value = prev || '';
  });
  // ensure session bar reflects active
  const p=getProject(); const s=getActiveSession(p); if($('#session-model')) $('#session-model').value = (s&&s.model)||'';
}

let priorityNext = false;
$('#prio-btn')?.addEventListener('click', () => {
  priorityNext = !priorityNext;
  $('#prio-btn').classList.toggle('on', priorityNext);
  toast(priorityNext ? '⚡ Next message jumps the queue' : 'Priority off');
});
$('#stop-btn')?.addEventListener('click', () => {
  const p = getProject(); if (!p) return;
  const s = getActiveSession(p); if (!s) return;
  wsSend({type:'opencode_stop', projectId:p.id, sessionId:s.id});
  toast('■ Stopping…');
});
function setBusyUI(busy) {
  $('#stop-btn')?.classList.toggle('hidden', !busy);
  $('#send-btn') && ($('#send-btn').textContent = busy ? '…' : '↑');
}
function sendPrompt(text, priority) {
  const p = getProject(); if(!p){ toast('Create a project first'); return false; }
  const s = getActiveSession(p); if(!s){ toast('Create a session first'); return false; }
  addSessionMessage(p, s.id, 'user', text);
  opencodeCurrentDone = false;
  clearSlowTimer();
  opencodeSlowTimer = setTimeout(() => { if(!opencodeCurrentDone && activeProjectId===p.id) addSessionMessage(p,s.id,'system','Still running — first reply can take 20–60s'); }, 20000);
  if (ws && ws.readyState === WebSocket.OPEN) {
    wsSend({type:'opencode_prompt', projectId:p.id, sessionId:s.id, text, priority: !!priority});
  } else { clearSlowTimer(); addSessionMessage(p,s.id,'assistant','(offline) Start the gateway server to use OpenCode.'); }
  return true;
}
$('#opencode-form').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#opencode-input').value; if(!text.trim()) return;
  const prio = priorityNext;
  if (sendPrompt(text, prio)) { $('#opencode-input').value = ''; autoGrowComposer(); updateCharCount(); priorityNext = false; $('#prio-btn')?.classList.remove('on'); }
});
// composer: auto-grow, Enter sends, Shift+Enter newline. Counter lives INSIDE the field.
function updateCharCount(){
  const t = $('#opencode-input'); const c = $('#char-count');
  if (c && t) c.textContent = String(t.value.length);
}
function autoGrowComposer() {
  const t = $('#opencode-input'); if (!t) return;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 140) + 'px';
  updateCharCount();
}
$('#opencode-input')?.addEventListener('input', autoGrowComposer);
$('#opencode-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#opencode-form').requestSubmit(); }
});

// ---------- Voice input ----------
(function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#mic-btn');
  if (!SR || !btn) { btn && (btn.style.display = 'none'); return; }
  let rec = null;
  btn.addEventListener('click', () => {
    if (rec) { try { rec.stop(); } catch {} rec = null; btn.textContent = '🎙'; return; }
    try {
      rec = new SR();
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = false;
      btn.textContent = '■';
      rec.onresult = (ev) => {
        const t = ev.results[0][0].transcript;
        const input = $('#opencode-input');
        if (input) { input.value = (input.value + ' ' + t).trim(); autoGrowComposer(); }
      };
      rec.onend = () => { rec = null; btn.textContent = '🎙'; };
      rec.onerror = () => { rec = null; btn.textContent = '🎙'; toast('Voice not available'); };
      rec.start();
    } catch { toast('Voice not available'); }
  });
})();

// ---------- File attach ----------
$('#attach-btn')?.addEventListener('click', () => $('#attach-file')?.click());
$('#attach-file')?.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('File too big (max 5 MB)'); return; }
  const p = getProject(); if (!p) { toast('Create a project first'); return; }
  toast('Uploading ' + f.name + '…');
  try {
    const buf = await f.arrayBuffer();
    const bytes = new Uint8Array(buf); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const r = await fetch('/api/fs/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: f.name, data: btoa(bin), cwd: p.cwd || defaultCwd || '' })
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'upload failed');
    const input = $('#opencode-input');
    const note = `Please look at ${j.path} (attached ${f.name}) and continue. `;
    if (input) { input.value = note + input.value; autoGrowComposer(); input.focus(); }
    toast('Attached → ' + j.path);
  } catch (err) { toast('Upload failed: ' + (err.message || err)); }
});

// ---------- Export / share ----------
$('#export-btn')?.addEventListener('click', async () => {
  const p = getProject(); const s = getActiveSession(p);
  if (!p || !s) return;
  const msgs = (s.messages || []).map(m => `## ${m.role === 'user' ? 'You' : 'Code-Go'}\n\n${m.text}\n`).join('\n');
  const md = `# ${p.name} — ${s.name}\n\nExported ${new Date().toISOString()}\n\n${msgs}`;
  const fname = (p.name || 'code-go').replace(/[^a-z0-9-_]+/gi, '-') + '-chat.md';
  try {
    const file = new File([md], fname, { type: 'text/markdown' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ title: p.name, text: 'Code-Go chat export', files: [file] });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = fname; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Exported ' + fname);
  } catch (err) { /* user cancelled share */ }
});

// ---------- Notifications ----------
function updateNotifState() {
  const st = $('#notif-state'); if (!st) return;
  st.textContent = !('Notification' in window) ? 'not supported' : Notification.permission;
}
$('#notif-btn')?.addEventListener('click', async () => {
  if (!('Notification' in window)) { toast('Notifications not supported'); return; }
  const p = await Notification.requestPermission();
  updateNotifState();
  toast(p === 'granted' ? '🔔 Notifications on' : 'Notifications not allowed');
});
updateNotifState();
function notifyDone(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try { new Notification(title || 'Code-Go', { body: body || 'AI finished', icon: '/icons/icon-192.png' }); } catch {}
}
// quick-action chips + starter prompts
document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-chip]'); const starter = e.target.closest('[data-starter]');
  if (chip) { sendPrompt(chip.dataset.chip + '…'); }
  if (starter) { sendPrompt(starter.dataset.starter); }
});
// chat tabs
$$('#chat-tabs .tab').forEach(t => t.addEventListener('click', () => {
  if (t.dataset.tab === 'terminal') setMainView('terminal');
  else setMainView(t.dataset.tab); // 'chat' | 'preview'
}));
$('#back-preview')?.addEventListener('click', backToList);
$('#preview-reload')?.addEventListener('click', () => { const f = $('#preview-frame'); if (f && f.src) f.src = f.src; });
$('#preview-go')?.addEventListener('click', () => {
  const p = getProject(); const url = ($('#preview-url').value || '').trim();
  if (!url) { toast('Paste your dev-server URL first'); return; }
  if (p) { p.previewUrl = url; saveProjects(); }
  loadPreview();
});
$('#reconnect-btn')?.addEventListener('click', () => { wsBackoff = 1500; connectWs(); toast('Reconnecting…'); });
const ocReset = $('#opencode-reset'); if (ocReset) ocReset.addEventListener('click', () => {
  const p = getProject(); const s = getActiveSession(p); if(!p||!s) return;
  if (ws && ws.readyState === WebSocket.OPEN) wsSend({type:'opencode_reset', projectId:p.id, sessionId:s.id});
  s.opencodeSession = null; s.messages=[]; saveProjects();
  renderMessages(p); renderSessionTabs(p); renderProjectList(); toast('Session reset');
});

// ---------- Terminal ----------
const TERM_HIST_KEY = 'og_term_history';
let termHistory = []; try { termHistory = JSON.parse(localStorage.getItem(TERM_HIST_KEY) || '[]'); } catch { termHistory = []; }
let termHistIdx = -1;
let lastTermCmd = '', lastTermError = '';
function addTerm(text) {
  const t=$('#term-out'); if(!t) return;
  t.textContent += (t.textContent && !t.textContent.endsWith('\n') ? '\n':'') + String(text) + '\n';
  t.parentElement.scrollTop = 1e9;
}
function runTermCmd(cmd) {
  const p = getProject();
  if (ws && ws.readyState === WebSocket.OPEN) wsSend({type:'terminal_input', projectId: p?p.id:undefined, text:cmd});
  else addTerm(`[offline] ${cmd}`);
}
$('#term-form').addEventListener('submit', e => {
  e.preventDefault();
  const cmd = $('#term-input').value; if(!cmd.trim()) return;
  if (cmd.trim()==='clear'){ $('#term-out').textContent=''; $('#term-input').value=''; return; }
  lastTermCmd = cmd; lastTermError = '';
  $('#term-to-chat')?.classList.add('hidden');
  termHistory.push(cmd); if (termHistory.length > 100) termHistory = termHistory.slice(-100);
  try { localStorage.setItem(TERM_HIST_KEY, JSON.stringify(termHistory)); } catch {}
  termHistIdx = -1;
  runTermCmd(cmd);
  $('#term-input').value='';
});
// ↑↓ history + Tab completion hint
$('#term-input')?.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  if (!termHistory.length) return;
  e.preventDefault();
  if (e.key === 'ArrowUp') termHistIdx = Math.min(termHistIdx + 1, termHistory.length - 1);
  else termHistIdx = Math.max(termHistIdx - 1, -1);
  $('#term-input').value = termHistory[termHistory.length - 1 - termHistIdx] || '';
});
// key row: line-based shell accessory bar (phone keyboard hides these)
let shiftSticky = false;
$('#term-keys')?.addEventListener('click', (e) => {
  const key = e.target.closest('[data-key]'); if (!key) return;
  const input = $('#term-input'); if (!input) return;
  const k = key.dataset.key;
  const ins = (s) => { input.value += shiftSticky ? s.toUpperCase() : s; input.focus(); };
  if (k === 'shift') {
    shiftSticky = !shiftSticky;
    key.classList.toggle('sticky', shiftSticky);
  }
  else if (k === 'enter') { $('#term-form').requestSubmit(); }
  else if (k === 'up') { if (termHistory.length) input.value = termHistory[termHistory.length - 1]; }
  else if (k === 'down') { input.value = termHistIdx > 0 ? termHistory[termHistory.length - 1 - (--termHistIdx)] : ''; }
  else if (k === 'tab') { ins('\t'); }
  else if (k === 'esc') { input.value = ''; }
  else if (k === 'ctrl') { input.value += '^C'; }
  else if (k === 'left' || k === 'right') { const pos = Math.max(0, input.value.length - 1); input.setSelectionRange(pos, pos); }
  else { ins(k); }
  if (k !== 'shift' && shiftSticky) { shiftSticky = false; document.querySelector('[data-key="shift"]')?.classList.remove('sticky'); }
});
$('#term-copy')?.addEventListener('click', async () => {
  const t = $('#term-out'); if (!t) return;
  try { await navigator.clipboard.writeText(t.textContent || ''); toast('Output copied'); }
  catch { toast('Copy failed — long-press to select'); }
});
$('#term-to-chat')?.addEventListener('click', () => {
  if (!lastTermError) return;
  setMainView('chat');
  sendPrompt(`Fix this terminal error.\n\nCommand: ${lastTermCmd}\nOutput:\n${lastTermError.slice(-1500)}`);
});
// server reports exit code — show "Send error to chat" on failure
function onTerminalDone(exitCode) {
  const btn = $('#term-to-chat');
  if (exitCode !== 0 && btn) {
    const t = $('#term-out'); lastTermError = t ? t.textContent.slice(-2000) : '';
    btn.classList.remove('hidden');
  } else if (btn) btn.classList.add('hidden');
}

// ---------- Project modal (customization) ----------
let modalProjectId = null;
function openProjectModal(id) {
  const p = id ? getProject(id) : null;
  const isNew = !p;
  modalProjectId = isNew ? null : p.id;
  const s = p ? getActiveSession(p) : null;
  const proj = p || { name:'New Project', icon:'📁', color:COLORS[projects.length % COLORS.length], cwd: defaultCwd||'' };
  $('#modal-heading').textContent = isNew ? 'New project' : 'Project settings';
  $('#proj-name').value = proj.name || '';
  $('#proj-icon').value = proj.icon && proj.icon.length <= 4 ? proj.icon : '';
  $('#proj-cwd').value = proj.cwd || defaultCwd || '';
  const pv = $('#proj-preview'); if (pv) pv.value = (p && proj.previewUrl) || '';
  $('#proj-session-id').textContent = (s && s.opencodeSession) || 'new session';
  $('#proj-delete').style.display = isNew ? 'none' : '';
  // relabel session buttons for non-destructive behavior
  const nb = $('#proj-new-session'); if (nb) nb.textContent = 'Add session';
  const rb = $('#proj-reset-session'); if (rb) rb.style.display = 'none';
  renderSwatches(proj.color || COLORS[0]);
  renderAvatarPreview(proj);
  if (ws && ws.readyState===WebSocket.OPEN) wsSend({type:'opencode_models'});
  setTimeout(()=>{ const sel=$('#opencode-model'); if(sel) sel.value = (s && s.model) || ''; }, 50);
  $('#project-modal-back').classList.add('show');
}
function closeProjectModal(){ $('#project-modal-back').classList.remove('show'); modalProjectId=null; }
function renderSwatches(selected) {
  const w = $('#proj-swatches');
  w.innerHTML = COLORS.map(c=>`<div class="swatch ${c===selected?'sel':''}" data-color="${c}" style="background:${c}"></div>`).join('');
  w.querySelectorAll('.swatch').forEach(s=>s.addEventListener('click',()=>{ w.querySelectorAll('.swatch').forEach(x=>x.classList.remove('sel')); s.classList.add('sel'); renderAvatarPreview(); }));
}
function renderAvatarPreview(base) {
  const name = $('#proj-name').value || (base&&base.name) || 'P';
  const icon = $('#proj-icon').value.trim() || (base&&base.icon) || name.trim().charAt(0).toUpperCase();
  const color = ($('#proj-swatches .swatch.sel')||{}).dataset?.color || (base&&base.color) || COLORS[0];
  $('#proj-avatar-preview').textContent = icon; $('#proj-avatar-preview').style.background = color;
  $('#modal-avatar').textContent = icon; $('#modal-avatar').style.background = color;
}
$('#proj-name').addEventListener('input', renderAvatarPreview);
$('#proj-icon').addEventListener('input', renderAvatarPreview);

$('#proj-save').addEventListener('click', () => {
  const name = $('#proj-name').value.trim() || 'Project';
  const icon = $('#proj-icon').value.trim();
  const color = ($('#proj-swatches .swatch.sel')||{}).dataset?.color || COLORS[0];
  const cwd = $('#proj-cwd').value.trim() || defaultCwd || '';
  const pv = $('#proj-preview'); const previewUrl = pv ? pv.value.trim() : '';
  const model = $('#opencode-model') ? ($('#opencode-model').value || '') : '';
  if (modalProjectId) {
    const p = getProject(modalProjectId); if(!p) return;
    Object.assign(p, { name, icon: icon || name.charAt(0).toUpperCase(), color, cwd, previewUrl });
    const s = getActiveSession(p); if (s) s.model = model;
    saveProjects();
    wsSend({type:'project_config', projectId:p.id, cwd});
    if (s) wsSend({type:'session_config', projectId:p.id, sessionId:s.id, model: model||null});
    if (activeProjectId===p.id) showChatView(); else renderProjectList();
    toast('Project saved');
  } else {
    const sid = uid();
    const p = { id: uid(), name, icon: icon || name.charAt(0).toUpperCase(), color, cwd, previewUrl, activeSessionId: sid, sessions: [{ id: sid, name: 'Session 1', model, opencodeSession: null, messages: [] }] };
    projects.unshift(p); activeProjectId = p.id; saveProjects();
    renderProjectList(); showChatView();
    toast('Project created');
  }
  closeProjectModal();
});
$('#proj-cancel').addEventListener('click', closeProjectModal);
$('#project-modal-back').addEventListener('click', (e)=>{ if(e.target.id==='project-modal-back') closeProjectModal(); });
$('#proj-new-session').addEventListener('click', () => {
  if (!modalProjectId) { $('#proj-session-id').textContent='new session'; return; }
  const p = getProject(modalProjectId); if(!p) return;
  const s = createSession(p);
  $('#proj-session-id').textContent = 'new session';
  if (activeProjectId===p.id) { renderSessionTabs(p); renderMessages(p); showChatView(); }
  renderProjectList(); toast('Session added');
});
$('#proj-reset-session').addEventListener('click', () => { $('#proj-new-session').click(); });
$('#proj-delete').addEventListener('click', () => {
  if (!modalProjectId) return;
  if (!confirm('Delete this project? Messages and settings will be removed.')) return;
  projects = projects.filter(p=>p.id!==modalProjectId);
  if (activeProjectId===modalProjectId) activeProjectId = projects[0]?.id || null;
  saveProjects(); closeProjectModal();
  renderProjectList();
  if (activeProjectId) showChatView(); else { $('#view-chat').style.display='none'; $('#view-empty').style.display='flex'; $('#app').classList.remove('show-main'); }
  toast('Project deleted');
});

// ---------- File explorer (UI-only; same /api/fs/* calls) ----------
let filesCwd = '';
let filesEntries = [];
let filesFilter = '';
function formatBytes(n){
  if(n==null || n===undefined) return '';
  if(n<1024) return n+' B';
  if(n<1048576) return Math.round(n/1024)+' KB';
  return (n/1048576).toFixed(1)+' MB';
}
function updateFilesHeader(){
  const title = $('#files-folder-name');
  const sub = $('#files-subtitle');
  const crumb = $('#files-crumb');
  const hidden = $('#files-path');
  if (title) title.textContent = filesCwd ? folderName(filesCwd) : 'Files';
  if (sub) { sub.textContent = filesCwd ? middleEllipsis(filesCwd, 48) : 'Browse project files'; sub.title = filesCwd || ''; }
  if (crumb) { crumb.textContent = filesCwd ? shortPath(filesCwd) : '—'; crumb.title = 'Show full path'; }
  if (hidden) hidden.textContent = filesCwd || '';
}
function renderFileEntries(){
  const list = $('#file-list'); if(!list) return;
  const q = (filesFilter||'').toLowerCase();
  const entries = filesEntries.filter(e => !q || e.name.toLowerCase().includes(q));
  if (!entries.length) {
    list.innerHTML = `<div class="muted small" style="padding:12px">${q ? 'No match for filter' : 'Empty folder'}</div>`;
    return;
  }
  list.innerHTML = entries.map(e => {
    const icon = fileIcon(e);
    const meta = e.type==='dir' ? 'Folder' : (e.type==='link' ? 'Shortcut' : (e.size ? formatBytes(e.size) : 'File'));
    return `<div class="file-item" data-name="${escapeHtml(e.name)}" data-type="${e.type}" role="button" tabindex="0"><span class="fi" aria-hidden="true">${icon}</span><span class="file-main"><span class="file-name">${escapeHtml(e.name)}</span><span class="file-meta">${meta}</span></span></div>`;
  }).join('');
  list.querySelectorAll('.file-item').forEach(el => el.addEventListener('click', () => {
    const name = el.dataset.name; const type = el.dataset.type; const full = filesCwd.replace(/\/$/,'') + '/' + name;
    if (type==='dir') loadFileList(full);
    else openFilePreview(full);
  }));
}
function openFileExplorer() {
  const p = getProject();
  filesCwd = (p && p.cwd) || filesCwd || defaultCwd || '';
  updateFilesHeader();
  loadFileList(filesCwd);
}
async function loadFileList(dir) {
  const list = $('#file-list'); const prev = $('#file-preview');
  if (!dir) { list.innerHTML = '<div class="muted small" style="padding:12px">No folder set</div>'; filesEntries=[]; updateFilesHeader(); return; }
  list.innerHTML = '<div class="muted small" style="padding:12px">Loading…</div>';
  try {
    const r = await fetch('/api/fs/list?path=' + encodeURIComponent(dir));
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    filesCwd = j.path;
    filesEntries = j.entries || [];
    updateFilesHeader();
    renderFileEntries();
  } catch (e) { list.innerHTML = `<div class="muted small" style="padding:12px">Error: ${escapeHtml(e.message||e)}</div>`; }
}
async function openFilePreview(filePath) {
  const prev = $('#file-preview'); if(!prev) return;
  prev.innerHTML = '<div class="muted small" style="padding:12px">Loading…</div>';
  try {
    const r = await fetch('/api/fs/read?path=' + encodeURIComponent(filePath));
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    prev.innerHTML = `<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(middleEllipsis(j.path, 64))}</div><pre>${escapeHtml(j.content||'')}</pre>`;
  } catch (e) { prev.innerHTML = `<div class="muted small" style="padding:12px">Error: ${escapeHtml(e.message||e)}</div>`; }
}
function copyTextToClipboard(txt, msg){
  const t = String(txt||'');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(()=>toast(msg||'Copied')).catch(()=>toast('Copy failed'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(msg||'Copied'); } catch { toast('Copy failed'); }
    ta.remove();
  }
}
function showFilesSheet(){
  const back = $('#files-sheet-back'); const pathEl = $('#files-sheet-path');
  if (!back) return;
  if (pathEl) pathEl.textContent = filesCwd || '—';
  back.classList.add('show');
}
function hideFilesSheet(){ $('#files-sheet-back')?.classList.remove('show'); }
$('#files-up').addEventListener('click', ()=>{ if(filesCwd) loadFileList(filesCwd.replace(/\/[^/]+\/?$/,'')||'/'); });
$('#files-refresh').addEventListener('click', ()=>loadFileList(filesCwd));
$('#files-copy')?.addEventListener('click', ()=>copyTextToClipboard(filesCwd, 'Path copied'));
$('#files-crumb')?.addEventListener('click', showFilesSheet);
$('#files-sheet-close')?.addEventListener('click', hideFilesSheet);
$('#files-sheet-copy')?.addEventListener('click', ()=>copyTextToClipboard(filesCwd, 'Path copied'));
$('#files-sheet-back')?.addEventListener('click', (e)=>{ if(e.target.id==='files-sheet-back') hideFilesSheet(); });
$('#files-filter')?.addEventListener('input', (e)=>{ filesFilter = e.target.value||''; renderFileEntries(); });
// FAB — no new API; routes the user to the terminal where files are created.
$('#files-new-fab')?.addEventListener('click', ()=>{ toast('Use Terminal to create: touch newfile'); setMainView('terminal'); });
$('#back-files').addEventListener('click', backToList);
$('#nav-home')?.addEventListener('click', backToList);
$('#nav-files').addEventListener('click', ()=>setMainView('files'));
const sessAdd = $('#session-add'); if (sessAdd) sessAdd.addEventListener('click', () => { const p=getProject(); if(!p) return; createSession(p); renderSessionTabs(p); renderMessages(p); syncSessionConfig(p); renderProjectList(); toast('New session added'); });
const sessModel = $('#session-model'); if (sessModel) sessModel.addEventListener('change', () => { const p=getProject(); const s=getActiveSession(p); if(!p||!s) return; s.model = sessModel.value||''; saveProjects(); wsSend({type:'session_config', projectId:p.id, sessionId:s.id, model:s.model||null}); $('#chat-subtitle').textContent = chatSubtitle(p); renderProjectList(); toast(s.model ? 'Model: ' + s.model.split('/').pop() : 'Model: default'); });
$('#think-btn')?.addEventListener('click', () => {
  const p = getProject(); const s = getActiveSession(p); if (!p || !s) return;
  s.thinking = !s.thinking; saveProjects();
  wsSend({type:'opencode_set_thinking', projectId:p.id, sessionId:s.id, thinking:s.thinking});
  renderSessionTabs(p);
  toast(s.thinking ? '💭 Deep thinking on' : 'Thinking off');
});

// ---------- Wiring ----------
$('#new-project-btn').addEventListener('click', ()=>openProjectModal(null));
$('#fab-new-project')?.addEventListener('click', ()=>openProjectModal(null));
$('#card-ai-agent')?.addEventListener('click', () => {
  if (getProject()) showChatView();
  else { toast('Create a project first'); openProjectModal(null); }
  document.querySelector('#opencode-input')?.focus();
});
$('#card-remote')?.addEventListener('click', () => setMainView('terminal'));
$('#card-projects')?.addEventListener('click', () => { $('#project-search')?.focus(); });
$('#empty-new-project').addEventListener('click', ()=>openProjectModal(null));
$('#project-settings-btn').addEventListener('click', ()=>openProjectModal(activeProjectId));
$('#project-search').addEventListener('input', renderProjectList);
$('#back-btn').addEventListener('click', backToList);
$('#back-term').addEventListener('click', backToList);
$('#back-settings').addEventListener('click', backToList);
$('#back-empty').addEventListener('click', backToList);
$('#nav-terminal').addEventListener('click', ()=>setMainView('terminal'));
$('#nav-settings').addEventListener('click', ()=>{ syncSettingsStatus(); setMainView('settings'); });

// settings
$('#gateway-url').value = localStorage.getItem(URL_KEY) || location.origin;
$('#ws-url').value = localStorage.getItem(WS_KEY) || defaultWs();
$('#save-settings').addEventListener('click', ()=>{
  localStorage.setItem(URL_KEY, $('#gateway-url').value);
  localStorage.setItem(WS_KEY, $('#ws-url').value);
  toast('Settings saved'); connectWs();
});
$('#reload-app').addEventListener('click', ()=>location.reload());
$('#reload-btn')?.addEventListener('click', ()=>location.reload());

function toast(m){ const t=$('#toast'); if(!t) return; t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }

// ---------- Init ----------
loadProjects();
if (!projects.length) ensureDefaultProject();
renderProjectList();
connectWs();
health().then(()=>{ // fill default cwd once known
  if (defaultCwd) { projects.forEach(p=>{ if(!p.cwd) p.cwd = defaultCwd; }); saveProjects(); if(activeView==='chat') showChatView(); }
});
setInterval(health, 5000);

// default view
if (projects.length && activeProjectId) {
  // on mobile show list first; on desktop show chat
  if (window.innerWidth > 720) showChatView();
  else { $('#view-empty').style.display='flex'; $('#view-chat').style.display='none'; }
} else {
  $('#view-empty').style.display='flex';
}
// deep link #terminal/#settings/#opencode/#files
(function(){
  const h=(location.hash||'').slice(1);
  if(h==='terminal') setMainView('terminal');
  else if(h==='files') setMainView('files');
  else if(h==='settings') { syncSettingsStatus(); setMainView('settings'); }
  else if(h==='opencode') { if (window.innerWidth > 720) showChatView(); else { $('#app').classList.remove('show-main'); renderProjectList(); } }
})();
if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(()=>{});
