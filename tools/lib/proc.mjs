// Processes, ports and small HTTP helpers. Works on macOS, Linux and Windows.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';

export const isWin = process.platform === 'win32';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const quoteWin = (a) => (/[\s"&|<>^]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a);

/**
 * Run a command and wait for it. Never uses a shell except for npm/npx on Windows (they are .cmd files there).
 * opts: { cwd, env, inherit (show output live), timeout (ms), input }
 * Resolves { code, stdout, stderr }; never rejects (code -1 if the program is missing).
 */
export function run(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    const needsShell = isWin && /^(npm|npx|yarn|pnpm)$/.test(cmd);
    const c = needsShell ? `${cmd}.cmd` : cmd;
    let child;
    try {
      child = spawn(needsShell ? [c, ...args.map(quoteWin)].join(' ') : c, needsShell ? [] : args, {
        cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) }, shell: needsShell, windowsHide: true,
        stdio: [opts.input != null ? 'pipe' : 'ignore', opts.inherit ? 'inherit' : 'pipe', opts.inherit ? 'inherit' : 'pipe'],
      });
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: e.message });
      return;
    }
    let stdout = '', stderr = '';
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    if (opts.input != null) child.stdin.end(opts.input);
    let timer = null;
    if (opts.timeout) timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, opts.timeout);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: stderr + e.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
  });
}

/** Full path of a program on PATH (plus common install folders), or null. */
export function which(name) {
  const exts = isWin ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase()) : [''];
  const extra = isWin ? [] : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/snap/bin'];
  const dirs = [...(process.env.PATH || '').split(path.delimiter), ...extra].filter(Boolean);
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d, name + e);
      try { if (fs.statSync(p).isFile()) return p; } catch { /* not here */ }
    }
  }
  return null;
}

/** Version line of a program, e.g. versionOf('git') -> 'git version 2.44.0', or null. */
export function versionOf(cmd, flag = '--version') {
  const needsShell = isWin && /^(npm|npx)$/.test(cmd);
  const r = spawnSync(needsShell ? `${cmd}.cmd` : cmd, [flag], { encoding: 'utf8', shell: needsShell, windowsHide: true, timeout: 20000 });
  if (r.status !== 0 || r.error) return null;
  return (r.stdout || r.stderr || '').split('\n')[0].trim() || null;
}

/** Start a long-running program in the background, detached from this terminal, output appended to logFile. Returns its pid. */
export function spawnDetached(cmd, args, { cwd, logFile, env } = {}) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const fd = fs.openSync(logFile, 'a');
  fs.writeSync(fd, `\n--- started ${new Date().toISOString()}: ${[cmd, ...args].join(' ')}\n`);
  const child = spawn(cmd, args, {
    cwd, env: { ...process.env, ...(env || {}) }, detached: true, windowsHide: true, stdio: ['ignore', fd, fd],
  });
  child.unref();
  fs.closeSync(fd);
  return child.pid;
}

/** True if a process with this pid exists (and we may signal it). */
export function isAlive(pid) {
  if (!pid || !Number.isInteger(Number(pid))) return false;
  try { process.kill(Number(pid), 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** Stop a process and its children. Waits up to ~4 s, then forces. Resolves true if it is gone. */
export async function killTree(pid) {
  pid = Number(pid);
  if (!isAlive(pid)) return true;
  if (isWin) {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch { /* not a group leader */ }
    try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ }
  }
  for (let i = 0; i < 40 && isAlive(pid); i++) await sleep(100);
  if (isAlive(pid) && !isWin) {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* not a group leader */ }
    try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
    await sleep(200);
  }
  return !isAlive(pid);
}

function canConnect(port, host) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(500, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}
function canListen(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen({ port, host, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

/** True if nothing is using this TCP port on this computer. */
export async function isPortFree(port) {
  if (await canConnect(port, '127.0.0.1')) return false;
  if (await canConnect(port, '::1')) return false;
  return canListen(port, '127.0.0.1');
}

/** First free port in [from, to], skipping `skip`. null if none. */
export async function findFreePort(from = 5170, to = 5199, skip = []) {
  for (let p = from; p <= to; p++) {
    if (skip.includes(p)) continue;
    if (await isPortFree(p)) return p;
  }
  return null;
}

/** GET a URL. Resolves { status, body, json } or null if nothing answered. */
export function httpGet(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { if (body.length < 1e6) body += d; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch { /* not json */ }
        resolve({ status: res.statusCode, body, json });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

/** Poll fn() until it returns something truthy or time runs out. Returns the value or null. */
export async function waitFor(fn, timeoutMs = 30000, everyMs = 250) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(everyMs);
  }
  return null;
}

/** Last n lines of a text file ('' if missing). */
export function tail(file, n = 20) {
  try { return fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-n).join('\n'); } catch { return ''; }
}
