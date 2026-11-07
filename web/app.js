const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const WS_KEY = 'og_ws_url';
const URL_KEY = 'og_gateway_url';
const PROJ_KEY = 'og_projects_v1';
const ACTIVE_KEY = 'og_active_project';

const COLORS = ['#00a884','#53bdeb','#d4a373','#e879f9','#f87171','#fbbf24','#34d399','#60a5fa','#a78bfa','#fb7185'];
function uid() { return 'p_' + Math.random().toString(36).slice(2, 10); }
function esc(s){ return String(s||''); }

// ---------- Project store ----------
let projects = [];
let activeProjectId = null;
let activeView = 'chat'; // 'chat' | 'terminal' | 'settings'
let defaultCwd = null;

function loadProjects() {
  try { projects = JSON.parse(localStorage.getItem(PROJ_KEY) || '[]'); } catch { projects = []; }
  if (!Array.isArray(projects)) projects = [];
  activeProjectId = localStorage.getItem(ACTIVE_KEY) || (projects[0] && projects[0].id) || null;
}
function saveProjects() {
  try { localStorage.setItem(PROJ_KEY, JSON.stringify(projects.map(p => ({...p, messages: (p.messages||[]).slice(-120)})))); } catch {}
  if (activeProjectId) localStorage.setItem(ACTIVE_KEY, activeProjectId);
}
function getProject(id) { return projects.find(p => p.id === (id || activeProjectId)); }
function ensureDefaultProject() {
  if (projects.length) return;
  const p = { id: uid(), name: 'My Project', icon: '📁', color: COLORS[0], cwd: defaultCwd || '', model: '', opencodeSession: null, messages: [] };
  projects.push(p); activeProjectId = p.id; saveProjects();
}
function projectSubtitle(p) {
  const cwd = p.cwd ? p.cwd.replace(/^\/Users\/[^/]+/, '~').split('/').slice(-2).join('/') : 'no folder';
  const m = p.model ? p.model.split('/').pop() : 'default model';
  return `${cwd} · ${m}`;
}

// ---------- Rendering ----------
function renderProjectList() {
  const list = $('#project-list'); if (!list) return;
  const q = ($('#project-search')?.value || '').toLowerCase();
  const items = projects.filter(p => !q || p.name.toLowerCase().includes(q) || (p.cwd||'').toLowerCase().includes(q));
  list.innerHTML = items.map(p => {
    const last = (p.messages||[]).filter(m=>m.role==='user'||m.role==='assistant').slice(-1)[0];
    const preview = last ? (last.text||'').replace(/\s+/g,' ').slice(0, 60) : projectSubtitle(p);
    const av = p.icon || (p.name||'P').trim().charAt(0).toUpperCase();
    return `<div class="project-item ${p.id===activeProjectId && activeView==='chat' ? 'active':''}" data-id="${p.id}">
      <div class="avatar" style="background:${p.color||COLORS[0]}">${av}</div>
      <div class="project-meta"><div class="name">${escapeHtml(p.name||'Project')}</div><div class="sub">${escapeHtml(preview)}</div></div>
    </div>`;
  }).join('') || `<div style="padding:18px;color:var(--muted);font-size:13px">No projects yet. Tap ＋ to create one.</div>`;
  list.querySelectorAll('.project-item').forEach(el => el.addEventListener('click', () => selectProject(el.dataset.id)));
}
function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderMessages(p) {
  const box = $('#project-messages'); if (!box || !p) return;
  box.innerHTML = (p.messages||[]).map(m => `<div class="msg ${m.role}">${escapeHtml(m.text)}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}
function addProjectMessage(p, role, text, persist=true) {
  if (!p) return;
  if (persist) { p.messages = p.messages || []; p.messages.push({ role, text: String(text) }); if (p.messages.length > 200) p.messages = p.messages.slice(-200); saveProjects(); }
  if (activeProjectId === p.id && activeView === 'chat') {
    const box = $('#project-messages'); if (!box) return;
    const el = document.createElement('div'); el.className = 'msg ' + role; el.textContent = String(text);
    box.appendChild(el); box.scrollTop = box.scrollHeight;
  }
  if (role === 'user' || role === 'assistant') renderProjectList();
}

function setMainView(view) {
  activeView = view;
  $('#view-chat').style.display = view==='chat' ? 'flex' : 'none';
  $('#view-terminal').style.display = view==='terminal' ? 'flex' : 'none';
  $('#view-settings').style.display = view==='settings' ? 'flex' : 'none';
  $('#view-empty').style.display = 'none';
  $('#nav-terminal').classList.toggle('active', view==='terminal');
  $('#nav-settings').classList.toggle('active', view==='settings');
  if (view !== 'chat') { $$('.project-item').forEach(el=>el.classList.remove('active')); $('#app').classList.add('show-main'); }
  if (view === 'terminal') { const s = $('#ws-state'); if (s) $('#ws-state-term').textContent = s.textContent, $('#ws-state-term').className = s.className; }
  if (view === 'settings') syncSettingsStatus();
  renderProjectList();
}
function showChatView() {
  const p = getProject();
  if (!p) { $('#view-chat').style.display='none'; $('#view-empty').style.display='flex'; return; }
  setMainView('chat');
  $('#view-empty').style.display='none';
  const av = p.icon || (p.name||'P').trim().charAt(0).toUpperCase();
  $('#chat-avatar').textContent = av; $('#chat-avatar').style.background = p.color || COLORS[0];
  $('#chat-title').textContent = p.name || 'Project';
  $('#chat-subtitle').textContent = projectSubtitle(p);
  renderMessages(p);
  $('#app').classList.add('show-main');
  renderProjectList();
  // sync server to this project's config
  wsSend({ type:'project_switch', projectId: p.id });
  wsSend({ type:'project_config', projectId: p.id, cwd: p.cwd || defaultCwd || '', model: p.model || null, opencodeSession: p.opencodeSession || null });
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
    const p = getProject(); if (p) { wsSend({type:'project_switch', projectId:p.id}); wsSend({type:'project_config', projectId:p.id, cwd:p.cwd||defaultCwd||'', model:p.model||null, opencodeSession:p.opencodeSession||null}); }
    else wsSend({type:'opencode_info'});
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
  const p = pid ? getProject(pid) : getProject();
  if (j.type==='user' || j.type==='assistant') { if(p) addProjectMessage(p, j.type, j.text); }
  else if (j.type==='system') { /* toasts handled elsewhere; avoid chat spam */ }
  else if (j.type==='terminal') addTerm(j.text);
  else if (j.type==='opencode_text') { clearSlowTimer(); if(p) addProjectMessage(p, 'assistant', j.text); }
  else if (j.type==='opencode_event') { /* quiet; queued/busy reflected in info */ }
  else if (j.type==='opencode_meta') { if(p) addProjectMessage(p, 'system', j.text); }
  else if (j.type==='opencode_done') { clearSlowTimer(); opencodeCurrentDone = true; }
  else if (j.type==='opencode_info') updateOpenCodeInfo(j);
  else if (j.type==='opencode_models_list') fillModelList(j.models || []);
}

async function health() {
  const set = (ok) => { const h=$('#health'); if(h){h.textContent=ok?'Online':'Offline'; h.className='pill '+(ok?'ok':'bad');} const h2=$('#health2'); if(h2) h2.textContent=ok?'Online':'Offline'; };
  try {
    const r = await fetch('/api/health', { cache: 'no-store' }); const j = await r.json();
    set(!!j.ok);
    if (j.project && !defaultCwd) defaultCwd = j.project;
    if (j.shell) { const el=$('#shell-state'); if(el) el.textContent = j.platform==='darwin'?'Mac':(j.platform==='android'?'Termux':j.platform||'host'); const sub=$('#shell-sub'); if(sub) sub.textContent=String(j.shell).split('/').pop(); }
    if (j.opencode !== undefined) { const el=$('#opencode-state'); if(el) el.textContent=j.opencode?'Ready':'CLI missing'; const sub=$('#opencode-sub'); if(sub) sub.textContent=j.opencode?'opencode run available':'Install opencode, restart server'; }
    const up=$('#uptime'); if(up) up.textContent=new Date(j.time).toLocaleTimeString();
  } catch { set(false); }
}
function syncSettingsStatus(){ const s=$('#ws-state'); if(s) $('#ws-state-settings').textContent=s.textContent; health(); }

// ---------- OpenCode (per project) ----------
let opencodeSlowTimer = null, opencodeCurrentDone = true, currentModel = '';
function clearSlowTimer(){ if(opencodeSlowTimer){ clearTimeout(opencodeSlowTimer); opencodeSlowTimer=null; } }
function updateOpenCodeInfo(j) {
  const pid = j.projectId || activeProjectId;
  const p = pid ? getProject(pid) : null;
  if (p) {
    if (j.session !== undefined) p.opencodeSession = j.session || null;
    if (j.model !== undefined) p.model = j.model || '';
    if (j.cwd) p.cwd = j.cwd;
    saveProjects();
    if (activeProjectId === p.id) {
      $('#chat-subtitle').textContent = projectSubtitle(p);
      if ($('#project-modal-back').classList.contains('show')) $('#proj-session-id').textContent = p.opencodeSession || 'new session';
    }
    renderProjectList();
  }
}
function fillModelList(models) {
  const sel = $('#opencode-model'); if(!sel) return;
  const p = getProject(); const prev = sel.value || (p && p.model) || currentModel;
  sel.innerHTML = '<option value="">Default (auto)</option>' + models.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  sel.value = prev || '';
}

$('#opencode-form').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#opencode-input').value; if(!text.trim()) return;
  const p = getProject(); if(!p){ toast('Create a project first'); return; }
  addProjectMessage(p, 'user', text);
  opencodeCurrentDone = false;
  clearSlowTimer();
  opencodeSlowTimer = setTimeout(() => { if(!opencodeCurrentDone && activeProjectId===p.id) addProjectMessage(p,'system','Still running — first reply can take 20–60s'); }, 20000);
  if (ws && ws.readyState === WebSocket.OPEN) {
    wsSend({type:'opencode_prompt', projectId:p.id, text});
  } else { clearSlowTimer(); addProjectMessage(p,'assistant','(offline) Start the gateway server to use OpenCode.'); }
  $('#opencode-input').value = '';
});
$('#opencode-reset').addEventListener('click', () => {
  const p = getProject(); if(!p) return;
  if (ws && ws.readyState === WebSocket.OPEN) wsSend({type:'opencode_reset', projectId:p.id});
  p.opencodeSession = null; p.messages=[]; saveProjects();
  renderMessages(p); renderProjectList(); toast('New session for ' + p.name);
});

// ---------- Terminal ----------
function addTerm(text) {
  const t=$('#term-out'); if(!t) return;
  t.textContent += (t.textContent && !t.textContent.endsWith('\n') ? '\n':'') + String(text) + '\n';
  t.parentElement.scrollTop = 1e9;
}
$('#term-form').addEventListener('submit', e => {
  e.preventDefault();
  const cmd = $('#term-input').value; if(!cmd.trim()) return;
  if (cmd.trim()==='clear'){ $('#term-out').textContent=''; $('#term-input').value=''; return; }
  const p = getProject();
  if (ws && ws.readyState === WebSocket.OPEN) wsSend({type:'terminal_input', projectId: p?p.id:undefined, text:cmd});
  else addTerm(`[offline] ${cmd}`);
  $('#term-input').value='';
});

// ---------- Project modal (customization) ----------
let modalProjectId = null;
function openProjectModal(id) {
  const p = id ? getProject(id) : null;
  const isNew = !p;
  modalProjectId = isNew ? null : p.id;
  const proj = p || { name:'New Project', icon:'📁', color:COLORS[projects.length % COLORS.length], cwd: defaultCwd||'', model:'', opencodeSession:null };
  $('#modal-heading').textContent = isNew ? 'New project' : 'Project settings';
  $('#proj-name').value = proj.name || '';
  $('#proj-icon').value = proj.icon && proj.icon.length <= 4 ? proj.icon : '';
  $('#proj-cwd').value = proj.cwd || defaultCwd || '';
  $('#proj-session-id').textContent = proj.opencodeSession || 'new session';
  $('#proj-delete').style.display = isNew ? 'none' : '';
  renderSwatches(proj.color || COLORS[0]);
  renderAvatarPreview(proj);
  // ensure models loaded
  if (ws && ws.readyState===WebSocket.OPEN) wsSend({type:'opencode_models'});
  setTimeout(()=>{ const sel=$('#opencode-model'); if(sel) sel.value = proj.model || ''; }, 50);
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
  const model = $('#opencode-model').value || '';
  if (modalProjectId) {
    const p = getProject(modalProjectId); if(!p) return;
    Object.assign(p, { name, icon: icon || name.charAt(0).toUpperCase(), color, cwd, model });
    saveProjects();
    wsSend({type:'project_config', projectId:p.id, cwd, model: model||null});
    if (activeProjectId===p.id) showChatView(); else renderProjectList();
    toast('Project saved');
  } else {
    const p = { id: uid(), name, icon: icon || name.charAt(0).toUpperCase(), color, cwd, model, opencodeSession: null, messages: [] };
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
  p.opencodeSession = null; p.messages=[]; saveProjects();
  $('#proj-session-id').textContent = 'new session';
  if (ws && ws.readyState===WebSocket.OPEN) wsSend({type:'opencode_reset', projectId:p.id});
  if (activeProjectId===p.id) renderMessages(p);
  toast('New session');
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

// ---------- Wiring ----------
$('#new-project-btn').addEventListener('click', ()=>openProjectModal(null));
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
// deep link #terminal/#settings/#opencode
(function(){
  const h=(location.hash||'').slice(1);
  if(h==='terminal') setMainView('terminal');
  else if(h==='settings') { syncSettingsStatus(); setMainView('settings'); }
  else if(h==='opencode') { if (window.innerWidth > 720) showChatView(); else { $('#app').classList.remove('show-main'); renderProjectList(); } }
})();
if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(()=>{});
