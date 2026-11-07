const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

const root = __dirname;

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
        return res.end(JSON.stringify({ ok: true, time: Date.now(), opencode: !!findOpencode(), shell: SHELL_BIN, platform: process.platform }));
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
function runTerminal(ws, session, cmd) {
  const line = cmd.trim();
  if (!line) return;
  // handle cd specially to keep cwd
  const lower = line.toLowerCase();
  if (lower === 'cd' || lower.startsWith('cd ')) {
    const target = line.slice(2).trim() || '~';
    try {
      const resolved = target.startsWith('/') ? target : path.resolve(session.cwd, target);
      const st = fs.statSync(resolved);
      if (st.isDirectory()) { session.cwd = resolved; }
      else { safeSend(ws, { type: 'terminal', text: `${line}\ncd: ${target}: Not a directory` }); return; }
    } catch (e) { safeSend(ws, { type: 'terminal', text: `${line}\ncd: ${target}: No such file or directory` }); return; }
    safeSend(ws, { type: 'terminal', text: `$ ${line}` });
    return;
  }

  // block obviously unsafe? allow everything (local dev)
  const child = spawn(SHELL_BIN, ['-lc', line], { cwd: session.cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  safeSend(ws, { type: 'terminal', text: `$ ${line}` });
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });
  child.on('error', (err) => { safeSend(ws, { type: 'terminal', text: String(err) }); });
  child.on('close', (code) => {
    if (out) safeSend(ws, { type: 'terminal', text: out.replace(/\s+$/,'') });
    if (code !== 0) safeSend(ws, { type: 'terminal', text: `[exit ${code}]` });
  });
}

// ---------- OpenCode ----------
function runOpencode(ws, session, message) {
  if (!OPENCODE) {
    safeSend(ws, { type: 'opencode_text', text: `(demo) OpenCode CLI not found on this host. Install it, then restart the server. You said: "${message.slice(0,200)}"` });
    safeSend(ws, { type: 'opencode_done' });
    return;
  }
  const args = ['run', '--format', 'json', message];
  if (session.opencodeSession) args.push('--session', session.opencodeSession);
  console.log('[opencode]', args.join(' ').slice(0, 200));
  // stdin must be ignored — the CLI hangs when stdin is an open pipe
  const child = spawn(OPENCODE, args, { cwd: session.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGINT'); } catch {} }, 120 * 1000);
  timer.unref && timer.unref();
  session.opencodeChild = child;
  let buf = '';
  let stderrBuf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.sessionID && !session.opencodeSession) session.opencodeSession = ev.sessionID;
        if (ev.type === 'text' && ev.part && ev.part.text) safeSend(ws, { type: 'opencode_text', text: ev.part.text });
        else if (ev.type === 'step_finish' && ev.part && ev.part.cost) safeSend(ws, { type: 'opencode_meta', text: `cost ${ev.part.cost} · ${JSON.stringify(ev.part.tokens || {})}` });
        else if (ev.type) safeSend(ws, { type: 'opencode_event', text: ev.type });
      } catch { if (line) safeSend(ws, { type: 'opencode_text', text: line }); }
    }
  });
  child.stderr.on('data', (d) => { stderrBuf += d.toString(); });
  child.on('error', (err) => {
    clearTimeout(timer);
    safeSend(ws, { type: 'opencode_text', text: `OpenCode error: ${err.message}` });
    safeSend(ws, { type: 'opencode_done' });
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    session.opencodeChild = null;
    if (buf.trim()) try { const ev = JSON.parse(buf.trim()); if (ev.part?.text) safeSend(ws, { type: 'opencode_text', text: ev.part.text }); } catch { safeSend(ws, { type: 'opencode_text', text: buf.trim() }); }
    if (timedOut) {
      safeSend(ws, { type: 'opencode_text', text: '[opencode timed out after 120s — try a shorter prompt]' });
    } else if (code !== 0) {
      const extra = stderrBuf.trim() ? `\n${stderrBuf.trim().slice(-500)}` : '';
      safeSend(ws, { type: 'opencode_text', text: `[opencode exit ${code}]${extra}` });
    }
    safeSend(ws, { type: 'opencode_done' });
  });
  ws.on('close', () => { try { child.kill('SIGINT'); } catch {} });
}

function handle(ws) {
  const session = { cwd: root, opencodeSession: null, opencodeChild: null };
  const label = process.platform === 'darwin' ? 'Terminal (Mac)' : 'Terminal (Termux)';
  safeSend(ws, { type: 'terminal', text: `${label} · ${SHELL_BIN} · cwd ${session.cwd} · try "pwd", "ls", "opencode run \\"hi\\""` });
  safeSend(ws, { type: 'system', text: OPENCODE ? `OpenCode ready: ${OPENCODE}` : 'OpenCode CLI not found (demo mode)' });

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
    if (data.type === 'chat') {
      safeSend(ws, { type: 'user', text: data.text });
      if (OPENCODE && data.openCode) return runOpencode(ws, session, data.text);
      setTimeout(() => { if (ws.readyState===WebSocket.OPEN) safeSend(ws, { type: 'assistant', text: `(demo echo) ${String(data.text).slice(0,120)}` }); }, 200);
    } else if (data.type === 'terminal_input') {
      runTerminal(ws, session, String(data.text || ''));
    } else if (data.type === 'opencode_prompt') {
      safeSend(ws, { type: 'user', text: data.text });
      runOpencode(ws, session, String(data.text || ''));
    } else if (data.type === 'opencode_reset') {
      session.opencodeSession = null;
      safeSend(ws, { type: 'system', text: 'OpenCode session reset' });
    }
  });
  ws.on('close', () => { if (session.opencodeChild) try { session.opencodeChild.kill('SIGINT'); } catch {} });
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
