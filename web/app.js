const $ = (s) => document.querySelector(s);
const WS_KEY = 'og_ws_url';
const URL_KEY = 'og_gateway_url';

// tabs + hash deep-link (#home, #chat, #terminal, #opencode, #settings)
function activatePanel(id) {
  document.querySelectorAll('nav.tabs button').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
  const btn = document.querySelector(`[data-panel="panel-${id}"]`);
  const panel = document.getElementById(`panel-${id}`);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
}
document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => {
  const id = b.dataset.panel.replace('panel-','');
  activatePanel(id);
  history.replaceState(null, '', '#' + id);
}));
(function fromHash(){
  const h = (location.hash || '').slice(1);
  if (['home','chat','terminal','opencode','settings'].includes(h)) activatePanel(h);
})();

// status
async function health() {
  const setOffline = () => {
    $('#health').textContent = 'Offline'; $('#health').className = 'pill bad';
    const h2 = $('#health2'); if (h2) h2.textContent = 'Offline';
  };
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    const j = await r.json();
    const ok = j.ok;
    $('#health').textContent = ok ? 'Online' : 'Degraded';
    $('#health').className = 'pill ' + (ok ? 'ok' : 'bad');
    $('#health2').textContent = ok ? 'Online' : 'Degraded';
    if (j.opencode !== undefined) {
      $('#opencode-state').textContent = j.opencode ? 'Ready' : 'CLI missing';
      $('#opencode-sub').textContent = j.opencode ? 'opencode run available' : 'Install opencode, restart server';
    }
    if (j.shell) {
      const el = $('#shell-state'); if (el) el.textContent = j.platform === 'darwin' ? 'Mac' : 'Termux';
      const sub = $('#shell-sub'); if (sub) sub.textContent = String(j.shell).split('/').pop();
    }
    const up = $('#uptime'); if (up) up.textContent = new Date(j.time).toLocaleTimeString();
  } catch { setOffline(); }
}
health(); setInterval(health, 5000);

// websocket (backoff + no chat spam)
let ws = null, wsIntentionalClose = false, wsBackoff = 1500, wsTimer = null;
function defaultWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
function scheduleWsReconnect() {
  const wait = wsBackoff;
  wsBackoff = Math.min(wsBackoff * 2, 15000);
  if (wsTimer) clearTimeout(wsTimer);
  wsTimer = setTimeout(() => { if (!document.hidden) connectWs(); }, wait);
}
function connectWs() {
  const url = localStorage.getItem(WS_KEY) || defaultWs();
  if (ws) { wsIntentionalClose = true; try { ws.close(); } catch {} ws = null; }
  wsIntentionalClose = false;
  ws = new WebSocket(url);
  ws.onopen = () => {
    wsBackoff = 1500;
    $('#ws-state').textContent = 'Connected'; $('#ws-state').className='pill ok';
    toast('Connected');
    ws.send(JSON.stringify({type:'opencode_models'}));
    ws.send(JSON.stringify({type:'opencode_info'}));
  };
  ws.onclose = () => {
    $('#ws-state').textContent = 'Disconnected'; $('#ws-state').className='pill bad';
    if (!wsIntentionalClose) scheduleWsReconnect();
  };
  ws.onerror = () => { $('#ws-state').textContent = 'Error'; $('#ws-state').className='pill bad'; };
  ws.onmessage = (e) => {
    let j; try { j = JSON.parse(e.data); } catch { addMsg('assistant', String(e.data)); return; }
    if (j.type==='user' || j.type==='assistant') addMsg(j.type, j.text);
    else if (j.type==='system') addMsg('system', j.text);
    else if (j.type==='terminal') addTerm(j.text);
    else if (j.type==='opencode_text') { clearSlowTimer(); addOpenCode('assistant', j.text); }
    else if (j.type==='opencode_event') addOpenCode('system', '· ' + j.text);
    else if (j.type==='opencode_meta') addOpenCode('system', j.text);
    else if (j.type==='opencode_done') { clearSlowTimer(); addOpenCode('system', '— done —'); }
    else if (j.type==='opencode_info') updateOpenCodeInfo(j);
    else if (j.type==='opencode_models_list') fillModelList(j.models || []);
  };
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && (!ws || ws.readyState !== WebSocket.OPEN)) { wsBackoff = 1500; connectWs(); } });
function sendChat(text) {
  if (!text.trim()) return;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'chat', text}));
  else { addMsg('user', text); setTimeout(()=>addMsg('assistant', `(offline demo) You said: ${text}\nStart the gateway server to get live replies.`), 300); }
  $('#chat-input').value = '';
}
function addMsg(role, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  el.textContent = text;
  $('#messages').appendChild(el);
  $('#messages').scrollTop = $('#messages').scrollHeight;
}
$('#chat-form').addEventListener('submit', e => { e.preventDefault(); sendChat($('#chat-input').value); });
$('#chat-input').addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendChat(e.target.value); } });
$('#clear-chat').addEventListener('click', ()=>{ $('#messages').innerHTML=''; addMsg('system','Chat cleared'); });

// Termux (real shell)
function addTerm(text) {
  const t=$('#term-out');
  t.textContent += (t.textContent && !t.textContent.endsWith('\n') ? '\n' : '') + text + '\n';
  t.closest('.terminal').scrollTop = 1e6;
}
$('#term-form').addEventListener('submit', e=>{
  e.preventDefault();
  const cmd = $('#term-input').value;
  if (!cmd.trim()) return;
  if (cmd.trim() === 'clear') { $('#term-out').textContent=''; $('#term-input').value=''; return; }
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'terminal_input', text: cmd}));
  else addTerm(`[offline] ${cmd}`);
  $('#term-input').value='';
});

// OpenCode (persistent session + model select)
let opencodeCurrent = null, opencodeSlowTimer = null, currentModel = '';
function clearSlowTimer() { if (opencodeSlowTimer) { clearTimeout(opencodeSlowTimer); opencodeSlowTimer = null; } }
function updateOpenCodeInfo(j) {
  const s = $('#opencode-session'); if (s) s.textContent = 'session: ' + (j.session ? String(j.session).slice(0, 14) + '…' : (j.busy ? 'running' : 'new'));
  const m = $('#opencode-model-label'); if (m) m.textContent = 'model: ' + (j.model || 'default');
  const cwd = $('#opencode-cwd'); if (cwd && j.cwd) cwd.textContent = j.cwd;
  if (j.model !== undefined && document.querySelector('#opencode-model')) {
    currentModel = j.model || '';
    document.querySelector('#opencode-model').value = currentModel;
  }
}
function fillModelList(models) {
  const sel = $('#opencode-model'); if (!sel) return;
  const prev = sel.value || currentModel;
  sel.innerHTML = '<option value="">Default (auto)</option>' + models.map((m) => `<option value="${m}">${m}</option>`).join('');
  sel.value = prev || '';
}
const modelSel = $('#opencode-model');
if (modelSel) modelSel.addEventListener('change', () => {
  currentModel = modelSel.value;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'opencode_set_model', model: currentModel || null}));
  toast(currentModel ? `Model: ${currentModel}` : 'Model: default');
});
function addOpenCode(role, text) {
  if (role==='assistant') {
    if (!opencodeCurrent) {
      opencodeCurrent = document.createElement('div');
      opencodeCurrent.className = 'msg assistant';
      opencodeCurrent.textContent = text;
      $('#opencode-messages').appendChild(opencodeCurrent);
    } else opencodeCurrent.textContent += (opencodeCurrent.textContent.endsWith('\n')?'':'\n') + text;
    $('#opencode-messages').scrollTop = $('#opencode-messages').scrollHeight;
  } else {
    const el = document.createElement('div');
    el.className = 'msg ' + role;
    el.textContent = text;
    $('#opencode-messages').appendChild(el);
    $('#opencode-messages').scrollTop = $('#opencode-messages').scrollHeight;
    if (role==='system' && text==='— done —') opencodeCurrent = null;
  }
}
$('#opencode-form').addEventListener('submit', e=>{
  e.preventDefault();
  const text = $('#opencode-input').value;
  if (!text.trim()) return;
  opencodeCurrent = null;
  addOpenCode('user', text);
  addOpenCode('system', '… running opencode run …');
  clearSlowTimer();
  opencodeSlowTimer = setTimeout(() => addOpenCode('system', 'Still running — first reply can take 20–60s'), 20000);
  if (ws && ws.readyState === WebSocket.OPEN) {
    opencodeCurrent = null;
    ws.send(JSON.stringify({type:'opencode_prompt', text}));
  } else { clearSlowTimer(); addOpenCode('assistant', '(offline) Start the gateway server to use OpenCode.'); }
  $('#opencode-input').value='';
});
$('#opencode-reset').addEventListener('click', ()=>{
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'opencode_reset'}));
  $('#opencode-messages').innerHTML='';
  opencodeCurrent = null;
  toast('New OpenCode session');
});

// settings
$('#gateway-url').value = localStorage.getItem(URL_KEY) || location.origin;
$('#ws-url').value = localStorage.getItem(WS_KEY) || defaultWs();
$('#save-settings').addEventListener('click', ()=>{
  localStorage.setItem(URL_KEY, $('#gateway-url').value);
  localStorage.setItem(WS_KEY, $('#ws-url').value);
  toast('Settings saved');
  connectWs();
});
$('#reload-btn').addEventListener('click', ()=>location.reload());
$('#install-btn').addEventListener('click', ()=>{ toast('Terminal tab runs the host shell (Mac zsh / Termux bash, cwd tracked). Try: ls, pwd, whoami, opencode run "hi"'); });
function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }

if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(()=>{});
connectWs();
addMsg('system', 'Welcome to Open Gateway — Terminal (Mac + Termux) + OpenCode ready');
addOpenCode('system', 'OpenCode ready — ask anything');
