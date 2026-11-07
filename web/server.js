const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

const root = __dirname;
const PROJECT_ROOT = path.resolve(__dirname, '..');
console.log(`Project: ${PROJECT_ROOT}`);

// Cross-platform shell: Mac ($SHELL=/bin/zsh) + Termux (bash in $PREFIX) + Linux
function detectShell() {
  const { execSync } = require('child_process');
  const candidates = [];
  if (process.env.SHELL) candidates.push(process.env.SHELL);
  if (process.env.PREFIX) candidates.push(`${process.env.PREFIX}/bin/bash`);
  candidates.push('/bin/zsh', '/bin/bash', 'bash', 'zsh');
  for (const c of candidates) {
    if (!c) continue;
    if (c.includes('/') && fs.existsSync(c)) return c;
    try { execSync(`command -v ${JSON.stringify(c)}`, { stdio: 'ignore', shell: '/bin/bash' }); return c; } catch {}
  }
  return '/bin/bash';
}
const SHELL_BIN = detectShell();
console.log(`Shell: ${SHELL_BIN} (${process.platform})`);

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serve(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(root, decodeURIComponent(urlPath));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {
      if (urlPath === '/api/health') {
        res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
        return res.end(JSON.stringify({ ok: true, time: Date.now(), opencode: !!findOpencode(), shell: SHELL_BIN, platform: process.platform, project: PROJECT_ROOT }));
      }
      if (urlPath === '/api/fs/list') {
        try {
          const u = new URL(req.url, 'http://localhost');
          const dir = u.searchParams.get('path') || PROJECT_ROOT;
          const resolved = path.resolve(dir);
          const entries = fs.readdirSync(resolved, { withFileTypes: true }).map(d => {
            const full = path.join(resolved, d.name);
            let size = 0; try { if (d.isFile()) size = fs.statSync(full).size; } catch {}
            return { name: d.name, type: d.isDirectory() ? 'dir' : (d.isSymbolicLink() ? 'link' : 'file'), size };
          }).sort((a,b)=> (a.type==='dir'?0:1)-(b.type==='dir'?0:1) || a.name.localeCompare(b.name));
          res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
          return res.end(JSON.stringify({ path: resolved, entries }));
        } catch (e) {
          res.writeHead(400, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
          return res.end(JSON.stringify({ error: String(e.message || e) }));
        }
      }
      if (urlPath === '/api/fs/read') {
        try {
          const u = new URL(req.url, 'http://localhost');
          const filePath = u.searchParams.get('path');
          if (!filePath) throw new Error('path required');
          const resolved = path.resolve(filePath);
          const st = fs.statSync(resolved);
          if (!st.isFile()) throw new Error('not a file');
          if (st.size > 200 * 1024) {
            res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
            return res.end(JSON.stringify({ path: resolved, truncated: true, content: fs.readFileSync(resolved, 'utf8').slice(0, 200*1024) + '\n\n[truncated]' }));
          }
          const buf = fs.readFileSync(resolved);
          const isBinary = buf.includes(0);
          res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
          return res.end(JSON.stringify({ path: resolved, binary: isBinary, content: isBinary ? `[binary file, ${st.size} bytes]` : buf.toString('utf8') }));
        } catch (e) {
          res.writeHead(400, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
          return res.end(JSON.stringify({ error: String(e.message || e) }));
        }
      }
      res.writeHead(404); return res.end('Not found');
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(serve);
server.listen(PORT, () => console.log(`Open Gateway web: http://localhost:${PORT}`));

// WS on :8080 (chat/terminal) — also upgrade on 3000 for single-origin tunnelling
const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`Gateway WS: ws://localhost:${WS_PORT}/ws`);

const server3000wss = new WebSocket.Server({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') server3000wss.handleUpgrade(req, socket, head, (ws) => server3000wss.emit('connection', ws, req));
  else socket.destroy();
});

function findOpencode() {
  const candidates = [
    process.env.OPENCODE_BIN,
    '/Users/praveshsharna/.opencode/bin/opencode',
    'opencode',
  ].filter(Boolean);
  const { execSync } = require('child_process');
  for (const c of candidates) {
    try { execSync(`command -v ${JSON.stringify(c)}`, { stdio: 'ignore', shell: '/bin/bash' }); return c; } catch {}
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}
const OPENCODE = findOpencode();
console.log(OPENCODE ? `OpenCode CLI: ${OPENCODE}` : 'OpenCode CLI: not found (demo mode)');

// ---------- Termux-like terminal (real shell) ----------
function safeSend(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function runTerminal(ws, session, cmd, pid) {
  const line = cmd.trim();
  if (!line) return;
  const id = pid || session.activeProject || 'default';
  const p = getProject(session, id);
  const cwd = (p.cwd && fs.existsSync(p.cwd)) ? p.cwd : session.cwd || PROJECT_ROOT;
  // handle cd specially to keep cwd
  const lower = line.toLowerCase();
  if (lower === 'cd' || lower.startsWith('cd ')) {
    const target = line.slice(2).trim() || '~';
    try {
      const resolved = target.startsWith('/') ? target : path.resolve(cwd, target);
      const st = fs.statSync(resolved);
      if (st.isDirectory()) { p.cwd = resolved; session.cwd = resolved; }
      else { safeSend(ws, { type: 'terminal', projectId: id, text: `${line}\ncd: ${target}: Not a directory` }); return; }
    } catch (e) { safeSend(ws, { type: 'terminal', projectId: id, text: `${line}\ncd: ${target}: No such file or directory` }); return; }
    safeSend(ws, { type: 'terminal', projectId: id, text: `$ ${line}` });
    return;
  }

  // block obviously unsafe? allow everything (local dev)
  const child = spawn(SHELL_BIN, ['-lc', line], { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  safeSend(ws, { type: 'terminal', projectId: id, text: `$ ${line}` });
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });
  child.on('error', (err) => { safeSend(ws, { type: 'terminal', projectId: id, text: String(err) }); });
  child.on('close', (code) => {
    if (out) safeSend(ws, { type: 'terminal', projectId: id, text: out.replace(/\s+$/,'') });
    if (code !== 0) safeSend(ws, { type: 'terminal', projectId: id, text: `[exit ${code}]` });
  });
}

// ---------- OpenCode (persistent session: queue, keep sessionID + model alive) ----------
function listModels() {
  if (!OPENCODE) return [];
  return new Promise((resolve) => {
    const child = spawn(OPENCODE, ['models'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('close', () => resolve(out.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 40)));
    child.on('error', () => resolve([]));
  });
}

function opencodeInfo(session, pid) {
  const p = getProject(session, pid);
  return { projectId: pid || session.activeProject || null, session: p.opencodeSession, model: p.model || null, cwd: p.cwd, busy: !!p.busy };
}

function getProject(session, pid) {
  const id = pid || session.activeProject || 'default';
  if (!session.projects[id]) session.projects[id] = { cwd: PROJECT_ROOT, model: null, opencodeSession: null, queue: [], busy: false, opencodeChild: null };
  return session.projects[id];
}

function processQueue(ws, session, pid) {
  const p = getProject(session, pid);
  if (p.busy || p.queue.length === 0) return;
  const message = p.queue.shift();
  p.busy = true;
  safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid) });
  runOpencodeNow(ws, session, pid, message);
}

function runOpencode(ws, session, message, pid) {
  const id = pid || session.activeProject || 'default';
  if (!OPENCODE) {
    safeSend(ws, { type: 'opencode_text', projectId: id, text: `(demo) OpenCode CLI not found on this host. Install it, then restart the server. You said: "${message.slice(0,200)}"` });
    safeSend(ws, { type: 'opencode_done', projectId: id });
    return;
  }
  const p = getProject(session, id);
  p.queue.push(String(message));
  if (p.busy) {
    safeSend(ws, { type: 'opencode_event', projectId: id, text: 'queued' });
  } else {
    processQueue(ws, session, id);
  }
}

function runOpencodeNow(ws, session, pid, message) {
  const id = pid || session.activeProject || 'default';
  const p = getProject(session, id);
  const args = ['run', '--format', 'json', message];
  if (p.model) args.push('--model', p.model);
  if (p.opencodeSession) args.push('--session', p.opencodeSession);
  const cwd = (p.cwd && fs.existsSync(p.cwd)) ? p.cwd : PROJECT_ROOT;
  console.log('[opencode]', id, args.join(' ').slice(0, 200));
  // stdin must be ignored — the CLI hangs when stdin is an open pipe
  const child = spawn(OPENCODE, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGINT'); } catch {} }, 5 * 60 * 1000);
  timer.unref && timer.unref();
  p.opencodeChild = child;
  let buf = '';
  let stderrBuf = '';
  let gotText = false;
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.sessionID && !p.opencodeSession) p.opencodeSession = ev.sessionID;
        if (ev.type === 'text' && ev.part && ev.part.text) { gotText = true; safeSend(ws, { type: 'opencode_text', projectId: id, text: ev.part.text }); }
        else if (ev.type === 'step_finish' && ev.part && ev.part.cost) safeSend(ws, { type: 'opencode_meta', projectId: id, text: `cost ${ev.part.cost} · ${JSON.stringify(ev.part.tokens || {})}` });
        else if (ev.type) safeSend(ws, { type: 'opencode_event', projectId: id, text: ev.type });
      } catch { gotText = true; if (line) safeSend(ws, { type: 'opencode_text', projectId: id, text: line }); }
    }
  });
  child.stderr.on('data', (d) => { stderrBuf += d.toString(); });
  function finish(code) {
    clearTimeout(timer);
    p.opencodeChild = null;
    p.busy = false;
    if (buf.trim() && !gotText) try { const ev = JSON.parse(buf.trim()); if (ev.part?.text) safeSend(ws, { type: 'opencode_text', projectId: id, text: ev.part.text }); } catch { safeSend(ws, { type: 'opencode_text', projectId: id, text: buf.trim() }); }
    if (timedOut) {
      safeSend(ws, { type: 'opencode_text', projectId: id, text: '[opencode timed out after 5 min — try a shorter prompt]' });
    } else if (code !== 0) {
      const extra = stderrBuf.trim() ? `\n${stderrBuf.trim().slice(-500)}` : '';
      safeSend(ws, { type: 'opencode_text', projectId: id, text: `[opencode exit ${code}]${extra}` });
    }
    safeSend(ws, { type: 'opencode_done', projectId: id });
    safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, id) });
    processQueue(ws, session, id);
  }
  child.on('error', (err) => {
    if (!p.busy) return;
    safeSend(ws, { type: 'opencode_text', projectId: id, text: `OpenCode error: ${err.message}` });
    finish(1);
  });
  child.on('close', (code) => { if (p.busy) finish(code); });
}

function handle(ws) {
  const session = { cwd: PROJECT_ROOT, projects: {}, activeProject: 'default' };
  const label = process.platform === 'darwin' ? 'Terminal (Mac)' : 'Terminal (Termux)';
  safeSend(ws, { type: 'terminal', text: `${label} · ${SHELL_BIN} · cwd ${session.cwd} · try "pwd", "ls", "opencode run \\"hi\\""` });
  safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, 'default') });

  // heartbeat so idle proxies don't cut the socket
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg.toString()); } catch {
      // plain text chat → echo
      const text = msg.toString();
      safeSend(ws, { type: 'user', text });
      setTimeout(() => { if (ws.readyState===WebSocket.OPEN) safeSend(ws, { type: 'assistant', text: `(demo echo) ${text.slice(0,120)}` }); }, 200);
      return;
    }
    const pid = data.projectId || session.activeProject || 'default';
    if (data.type === 'chat') {
      safeSend(ws, { type: 'user', projectId: pid, text: data.text });
      if (OPENCODE && data.openCode) return runOpencode(ws, session, data.text, pid);
      setTimeout(() => { if (ws.readyState===WebSocket.OPEN) safeSend(ws, { type: 'assistant', projectId: pid, text: `(demo echo) ${String(data.text).slice(0,120)}` }); }, 200);
    } else if (data.type === 'terminal_input') {
      runTerminal(ws, session, String(data.text || ''), pid);
    } else if (data.type === 'opencode_prompt') {
      runOpencode(ws, session, String(data.text || ''), pid);
    } else if (data.type === 'opencode_reset') {
      const p = getProject(session, pid);
      p.opencodeSession = null;
      p.queue = [];
      if (p.opencodeChild) try { p.opencodeChild.kill('SIGINT'); } catch {}
      p.opencodeChild = null; p.busy = false;
      safeSend(ws, { type: 'system', projectId: pid, text: 'OpenCode session reset' });
      safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid) });
    } else if (data.type === 'opencode_models') {
      listModels().then((models) => safeSend(ws, { type: 'opencode_models_list', models }));
    } else if (data.type === 'opencode_set_model') {
      const p = getProject(session, pid);
      p.model = data.model || null;
      safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid) });
      safeSend(ws, { type: 'system', projectId: pid, text: p.model ? `Model set to ${p.model}` : 'Model set to default' });
    } else if (data.type === 'opencode_info') {
      safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid) });
    } else if (data.type === 'project_switch') {
      session.activeProject = pid;
      const p = getProject(session, pid);
      session.cwd = p.cwd || session.cwd;
      safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid) });
    } else if (data.type === 'project_config') {
      const p = getProject(session, pid);
      if (data.cwd && typeof data.cwd === 'string') { p.cwd = data.cwd; session.cwd = p.cwd; }
      if (data.model !== undefined) p.model = data.model || null;
      if (data.opencodeSession !== undefined) p.opencodeSession = data.opencodeSession || null;
      safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid) });
    }
  });
  ws.on('close', () => {
    try {
      Object.values(session.projects || {}).forEach((p) => {
        p.queue = [];
        if (p.opencodeChild) try { p.opencodeChild.kill('SIGINT'); } catch {}
        p.opencodeChild = null; p.busy = false;
      });
    } catch {}
  });
}
const hb = setInterval(() => {
  [wss, server3000wss].forEach((s) => s.clients.forEach((ws) => {
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} return; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }));
}, 25000);
if (hb.unref) hb.unref();
wss.on('connection', (ws) => { console.log('[ws] client on 8080'); handle(ws); });
server3000wss.on('connection', (ws) => { console.log('[ws] client on 3000'); handle(ws); });

wss.on('listening', () => {});
