const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');
const WebSocket = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

const root = __dirname;
const PROJECT_ROOT = path.resolve(__dirname, '..');
console.log(`Project: ${PROJECT_ROOT}`);

// ---------- Auth (simple, local-first) ----------
const AUTH_USER = process.env.OG_USER || 'admin';
const AUTH_PASS = process.env.OG_PASS || 'opengateway';
const sessions = new Map(); // token -> { user, created }

function parseCookies(req) {
  const h = req.headers.cookie || '';
  const out = {};
  h.split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1).trim()); });
  return out;
}
function getToken(req) {
  const cookies = parseCookies(req);
  if (cookies.og_session && sessions.has(cookies.og_session)) return cookies.og_session;
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) { const t = auth.slice(7); if (sessions.has(t)) return t; }
  return null;
}
function isAuthed(req) { return !!getToken(req); }
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}
function json(res, status, obj, headers={}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(JSON.stringify(obj));
}

// Cross-platform shell: Mac ($SHELL=/bin/zsh) + Termux (bash in $PREFIX) + Linux
function detectShell() {
  const { execSync } = require('child_process');
  const probeShell = process.env.SHELL || process.env.PREFIX || '/bin/sh';
  const candidates = [];
  if (process.env.SHELL) candidates.push(process.env.SHELL);
  if (process.env.PREFIX) candidates.push(`${process.env.PREFIX}/bin/bash`, `${process.env.PREFIX}/bin/sh`);
  candidates.push('/bin/zsh', '/bin/bash', '/bin/sh', 'bash', 'sh', 'zsh');
  for (const c of candidates) {
    if (!c) continue;
    if (c.includes('/') && fs.existsSync(c)) return c;
    try { execSync(`command -v ${JSON.stringify(c)}`, { stdio: 'ignore', shell: probeShell }); return c; } catch {}
  }
  return '/bin/sh';
}
const SHELL_BIN = detectShell();
console.log(`Shell: ${SHELL_BIN} (${process.platform})`);

// git branch for the project list (cached at startup; refresh on /api/health if stale)
let GIT_BRANCH = '—';
function gitBranch() {
  try {
    const b = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (b) GIT_BRANCH = b;
  } catch {}
  return GIT_BRANCH;
}
gitBranch();

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

// POST /api/fs/upload — store a chat attachment into <cwd>/uploads/ so OpenCode can read it
function handleUpload(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 7 * 1024 * 1024) { try { req.destroy(); } catch {} }
  });
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      const filename = String(data.filename || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'upload';
      if (!data.data) throw new Error('data required (base64)');
      const cwd = data.cwd ? path.resolve(data.cwd) : PROJECT_ROOT;
      if (!cwd.startsWith(PROJECT_ROOT) && !cwd.startsWith(os.homedir())) throw new Error('outside allowed folders');
      const dir = path.join(cwd, 'uploads');
      fs.mkdirSync(dir, { recursive: true });
      const out = path.join(dir, Date.now() + '-' + filename);
      fs.writeFileSync(out, Buffer.from(data.data, 'base64'));
      json(res, 200, { ok: true, path: 'uploads/' + path.basename(out), fullPath: out });
    } catch (e) {
      json(res, 400, { error: String((e && e.message) || e) });
    }
  });
}

function serve(req, res) {
  let urlPath = req.url.split('?')[0];
  if (req.method === 'POST' && urlPath === '/api/fs/upload') return handleUpload(req, res);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(root, decodeURIComponent(urlPath));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {
      if (urlPath === '/api/health') {
        res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
        return res.end(JSON.stringify({ ok: true, time: Date.now(), opencode: !!OPENCODE, shell: SHELL_BIN, platform: process.platform, branch: gitBranch(), project: PROJECT_ROOT }));
      }
      if (urlPath === '/api/fs/list') {
        try {
          const u = new URL(req.url, 'http://localhost');
          const dir = u.searchParams.get('path') || PROJECT_ROOT;
          let resolved = path.resolve(dir);
          if (resolved === '~' || resolved.startsWith('~/')) resolved = path.join(os.homedir(), resolved.slice(2));
          if (!resolved.startsWith(PROJECT_ROOT) && !resolved.startsWith(os.homedir())) throw new Error('outside allowed folders');
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
          let resolved = path.resolve(filePath);
          if (resolved === '~' || resolved.startsWith('~/')) resolved = path.join(os.homedir(), resolved.slice(2));
          if (!resolved.startsWith(PROJECT_ROOT) && !resolved.startsWith(os.homedir())) throw new Error('outside allowed folders');
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

function listenWithRetry(srv, startPort, label, maxAttempts = 10) {
  let port = Number(startPort);
  let attempts = 0;
  return new Promise((resolve, reject) => {
    const tryListen = () => {
      attempts++;
      srv.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          console.warn(`${label}: port ${port} in use, trying ${port + 1}...`);
          port++;
          tryListen();
        } else if (err.code === 'EADDRINUSE') {
          reject(new Error(`${label}: ports ${startPort}-${port} all in use. Stop the other process or set ${label.includes('WS') ? 'WS_PORT' : 'PORT'} to a free port.`));
        } else {
          reject(err);
        }
      });
      srv.listen(port, () => {
        console.log(`${label}: http://localhost:${port}`.replace('http://', label.includes('WS') ? 'ws://' : 'http://') + (label.includes('WS') ? '/ws' : ''));
        resolve(port);
      });
    };
    tryListen();
  });
}

// WS on :8080 (chat/terminal) — also upgrade on 3000 for single-origin tunnelling
const wss = new WebSocket.Server({ noServer: true });
const wsHttpServer = http.createServer();

Promise.all([
  listenWithRetry(server, PORT, 'Code-Go web'),
  listenWithRetry(wsHttpServer, WS_PORT, 'Gateway WS'),
]).then(([httpPort, wsPort]) => {
  wsHttpServer.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    else socket.destroy();
  });
  // keep resolved ports visible to /api/health if needed
  server._boundPort = httpPort;
  wsHttpServer._boundPort = wsPort;
}).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

const server3000wss = new WebSocket.Server({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') server3000wss.handleUpgrade(req, socket, head, (ws) => server3000wss.emit('connection', ws, req));
  else socket.destroy();
});

function findOpencode() {
  const home = process.env.HOME || os.homedir();
  const candidates = [
    process.env.OPENCODE_BIN,
    path.join(home, '.opencode/bin/opencode'),
    '/Users/praveshsharna/.opencode/bin/opencode',
    'opencode',
  ].filter(Boolean);
  const { execSync } = require('child_process');
  const probeShell = process.env.SHELL || process.env.PREFIX || '/bin/sh';
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    try { execSync(`command -v ${JSON.stringify(c)}`, { stdio: 'ignore', shell: probeShell }); return c; } catch {}
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
      const expanded = (target === '~' || target.startsWith('~/')) ? path.join(os.homedir(), target.slice(2)) : target;
      const resolved = expanded.startsWith('/') ? expanded : path.resolve(cwd, expanded);
      const st = fs.statSync(resolved);
      if (st.isDirectory()) { p.cwd = resolved; session.cwd = resolved; }
      else { safeSend(ws, { type: 'terminal', projectId: id, text: `${line}\ncd: ${target}: Not a directory` }); return; }
    } catch (e) { safeSend(ws, { type: 'terminal', projectId: id, text: `${line}\ncd: ${target}: No such file or directory` }); return; }
    safeSend(ws, { type: 'terminal', projectId: id, text: `$ ${line}` });
    safeSend(ws, { type: 'terminal_done', projectId: id, exitCode: 0 });
    return;
  }

  // fish needs -c (not -lc); everything else takes -lc
  const args = SHELL_BIN.endsWith('fish') ? ['-c', line] : ['-lc', line];
  const child = spawn(SHELL_BIN, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  safeSend(ws, { type: 'terminal', projectId: id, text: `$ ${line}` });
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });
  child.on('error', (err) => { safeSend(ws, { type: 'terminal', projectId: id, text: String(err) }); });
  child.on('close', (code) => {
    if (out) safeSend(ws, { type: 'terminal', projectId: id, text: out.replace(/\s+$/,'') });
    if (code !== 0) safeSend(ws, { type: 'terminal', projectId: id, text: `[exit ${code}]` });
    safeSend(ws, { type: 'terminal_done', projectId: id, exitCode: code || 0 });
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

function getProject(session, pid) {
  const id = pid || session.activeProject || 'default';
  if (!session.projects[id]) session.projects[id] = { cwd: PROJECT_ROOT, sessions: {} };
  return session.projects[id];
}
function getSession(session, pid, sid) {
  const p = getProject(session, pid);
  const id = sid || 'default';
  if (!p.sessions[id]) p.sessions[id] = { model: null, opencodeSession: null, queue: [], busy: false, opencodeChild: null };
  return p.sessions[id];
}
function opencodeInfo(session, pid, sid) {
  const p = getProject(session, pid);
  const s = getSession(session, pid, sid);
  return { projectId: pid || session.activeProject || null, sessionId: sid || 'default', session: s.opencodeSession, model: s.model || null, cwd: p.cwd, busy: !!s.busy };
}

function processQueue(ws, session, pid, sid) {
  const s = getSession(session, pid, sid);
  if (s.busy || s.queue.length === 0) return;
  const message = s.queue.shift();
  s.busy = true;
  safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid, sid) });
  runOpencodeNow(ws, session, pid, sid, message);
}

function runOpencode(ws, session, message, pid, sid, priority) {
  const id = pid || session.activeProject || 'default';
  const ss = sid || 'default';
  if (!OPENCODE) {
    safeSend(ws, { type: 'opencode_text', projectId: id, sessionId: ss, text: `(demo) OpenCode CLI not found on this host. Install it, then restart the server. You said: "${message.slice(0,200)}"` });
    safeSend(ws, { type: 'opencode_done', projectId: id, sessionId: ss });
    return;
  }
  const s = getSession(session, id, ss);
  if (priority) {
    // Force: kill current run, drop queue, jump the line
    if (s.opencodeChild) try { s.opencodeChild.kill('SIGINT'); } catch {}
    s.queue = [];
    s.busy = false;
    s.queue.unshift(String(message));
    safeSend(ws, { type: 'system', projectId: id, sessionId: ss, text: '⚡ Priority: pre-empted current run' });
    processQueue(ws, session, id, ss);
    return;
  }
  s.queue.push(String(message));
  if (s.busy) {
    safeSend(ws, { type: 'opencode_event', projectId: id, sessionId: ss, text: 'queued · ' + s.queue.length + ' waiting' });
  } else {
    processQueue(ws, session, id, ss);
  }
}

function stopOpencode(ws, session, pid, sid) {
  const s = getSession(session, pid, sid);
  s.queue = [];
  if (s.opencodeChild) try { s.opencodeChild.kill('SIGINT'); } catch {}
  s.opencodeChild = null; s.busy = false;
  safeSend(ws, { type: 'system', projectId: pid, sessionId: sid, text: '■ Stopped' });
  safeSend(ws, { type: 'opencode_done', projectId: pid, sessionId: sid });
  safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid, sid) });
}

function runOpencodeNow(ws, session, pid, sid, message) {
  const id = pid || session.activeProject || 'default';
  const ss = sid || 'default';
  const p = getProject(session, id);
  const s = getSession(session, id, ss);
  const args = ['run', '--format', 'json', message];
  if (s.model) args.push('--model', s.model);
  if (s.opencodeSession) args.push('--session', s.opencodeSession);
  const cwd = (p.cwd && fs.existsSync(p.cwd)) ? p.cwd : PROJECT_ROOT;
  console.log('[opencode]', id, ss, args.join(' ').slice(0, 180));
  const child = spawn(OPENCODE, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGINT'); } catch {} }, 5 * 60 * 1000);
  timer.unref && timer.unref();
  s.opencodeChild = child;
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
        if (ev.sessionID && !s.opencodeSession) s.opencodeSession = ev.sessionID;
        if (ev.type === 'text' && ev.part && ev.part.text) { gotText = true; safeSend(ws, { type: 'opencode_text', projectId: id, sessionId: ss, text: ev.part.text }); }
        else if (ev.type === 'step_finish' && ev.part && ev.part.cost) safeSend(ws, { type: 'opencode_meta', projectId: id, sessionId: ss, text: `cost ${ev.part.cost} · ${JSON.stringify(ev.part.tokens || {})}` });
        else if ((ev.type === 'tool_use' || ev.type === 'tool') && ev.part) {
          gotText = true;
          const name = ev.part.tool || 'tool';
          const inp = ev.part.input ? JSON.stringify(ev.part.input).slice(0, 120) : '';
          safeSend(ws, { type: 'opencode_tool', projectId: id, sessionId: ss, text: `🔧 ${name}${inp ? ' ' + inp : ''}` });
        }
        else if (ev.type === 'reasoning' || ev.type === 'thinking') {
          const th = ev.part && ev.part.text ? ev.part.text : (ev.text || '');
          if (th) safeSend(ws, { type: 'opencode_think', projectId: id, sessionId: ss, text: th });
        }
        else if (ev.type) safeSend(ws, { type: 'opencode_event', projectId: id, sessionId: ss, text: ev.type });
      } catch { gotText = true; if (line) safeSend(ws, { type: 'opencode_text', projectId: id, sessionId: ss, text: line }); }
    }
  });
  child.stderr.on('data', (d) => { stderrBuf += d.toString(); });
  function finish(code) {
    clearTimeout(timer);
    s.opencodeChild = null;
    s.busy = false;
    if (buf.trim() && !gotText) try { const ev = JSON.parse(buf.trim()); if (ev.part?.text) safeSend(ws, { type: 'opencode_text', projectId: id, sessionId: ss, text: ev.part.text }); } catch { safeSend(ws, { type: 'opencode_text', projectId: id, sessionId: ss, text: buf.trim() }); }
    if (timedOut) {
      safeSend(ws, { type: 'opencode_text', projectId: id, sessionId: ss, text: '[opencode timed out after 5 min — try a shorter prompt]' });
    } else if (code !== 0) {
      const extra = stderrBuf.trim() ? `\n${stderrBuf.trim().slice(-500)}` : '';
      safeSend(ws, { type: 'opencode_text', projectId: id, sessionId: ss, text: `[opencode exit ${code}]${extra}` });
    }
    safeSend(ws, { type: 'opencode_done', projectId: id, sessionId: ss });
    safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, id, ss) });
    processQueue(ws, session, id, ss);
  }
  child.on('error', (err) => {
    if (!s.busy) return;
    safeSend(ws, { type: 'opencode_text', projectId: id, sessionId: ss, text: `OpenCode error: ${err.message}` });
    finish(1);
  });
  child.on('close', (code) => { if (s.busy) finish(code); });
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
      const text = msg.toString();
      safeSend(ws, { type: 'user', text });
      setTimeout(() => { if (ws.readyState===WebSocket.OPEN) safeSend(ws, { type: 'assistant', text: `(demo echo) ${text.slice(0,120)}` }); }, 200);
      return;
    }
    const pid = data.projectId || session.activeProject || 'default';
    const sid = data.sessionId || 'default';
    if (data.type === 'chat') {
      safeSend(ws, { type: 'user', projectId: pid, sessionId: sid, text: data.text });
      if (OPENCODE && data.openCode) return runOpencode(ws, session, data.text, pid, sid);
      setTimeout(() => { if (ws.readyState===WebSocket.OPEN) safeSend(ws, { type: 'assistant', projectId: pid, sessionId: sid, text: `(demo echo) ${String(data.text).slice(0,120)}` }); }, 200);
    } else if (data.type === 'terminal_input') {
      runTerminal(ws, session, String(data.text || ''), pid);
    } else if (data.type === 'opencode_prompt') {
      runOpencode(ws, session, String(data.text || ''), pid, sid, !!data.priority);
    } else if (data.type === 'opencode_stop') {
      stopOpencode(ws, session, pid, sid);
    } else if (data.type === 'opencode_reset') {
      const s = getSession(session, pid, sid);
      s.opencodeSession = null; s.queue = [];
      if (s.opencodeChild) try { s.opencodeChild.kill('SIGINT'); } catch {}
      s.opencodeChild = null; s.busy = false;
      safeSend(ws, { type: 'system', projectId: pid, sessionId: sid, text: 'OpenCode session reset' });
      safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid, sid) });
    } else if (data.type === 'opencode_models') {
      listModels().then((models) => safeSend(ws, { type: 'opencode_models_list', models }));
    } else if (data.type === 'opencode_set_model') {
      const s = getSession(session, pid, sid);
      s.model = data.model || null;
      safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid, sid) });
      safeSend(ws, { type: 'system', projectId: pid, sessionId: sid, text: s.model ? `Model set to ${s.model}` : 'Model set to default' });
    } else if (data.type === 'opencode_info') {
      safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid, sid) });
    } else if (data.type === 'project_switch') {
      session.activeProject = pid;
      const p = getProject(session, pid);
      session.cwd = p.cwd || session.cwd;
      safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid, sid) });
    } else if (data.type === 'project_config') {
      const p = getProject(session, pid);
      if (data.cwd && typeof data.cwd === 'string') { p.cwd = data.cwd; session.cwd = p.cwd; }
      safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid, sid) });
    } else if (data.type === 'session_config') {
      const s = getSession(session, pid, sid);
      if (data.model !== undefined) s.model = data.model || null;
      if (data.opencodeSession !== undefined) s.opencodeSession = data.opencodeSession || null;
      safeSend(ws, { type: 'opencode_info', ...opencodeInfo(session, pid, sid) });
    }
  });
  ws.on('close', () => {
    try {
      Object.values(session.projects || {}).forEach((p) => {
        Object.values(p.sessions || {}).forEach((s) => {
          s.queue = [];
          if (s.opencodeChild) try { s.opencodeChild.kill('SIGINT'); } catch {}
          s.opencodeChild = null; s.busy = false;
        });
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
