// Hugo CLI 封装：可注入 spawn，超时杀进程树，失败不重试，错误结构化返回不抛裸异常。
import { spawn as nodeSpawn } from 'node:child_process';
const MAX_TAIL = 4000;
function tail(text) {
  const s = String(text ?? '');
  return s.length > MAX_TAIL ? s.slice(-MAX_TAIL) : s;
}
function killTree(child, spawnFn, cwd) {
  const pid = child?.pid;
  if (pid && process.platform === 'win32') {
    try {
      const k = spawnFn('taskkill', ['/pid', String(pid), '/T', '/F'], { cwd, windowsHide: true, shell: false });
      k?.on?.('error', () => {});
    } catch { /* 回退 child.kill */ }
  } else if (pid && process.platform !== 'win32') {
    try { process.kill(-pid, 'SIGKILL'); return; } catch { /* 回退 */ }
  }
  try { child?.kill?.(); } catch { /* 已退出 */ }
}
/**
 * @param {string} root 站点根（cwd）
 * @param {{args?:string[],timeoutMs?:number,spawnImpl?:Function,signal?:AbortSignal,hugoBin?:string}} opts
 * @returns {Promise<{ok:boolean,exitCode:number|null,stdoutTail:string,stderrTail:string,durationMs:number,missing?:boolean,timedOut?:boolean,error?:string}>}
 */
export async function runHugo(root, opts = {}) {
  const args = Array.isArray(opts.args) ? opts.args : ['build'];
  const timeoutMs = opts.timeoutMs ?? 120000;
  const spawnFn = opts.spawnImpl ?? nodeSpawn;
  const hugoBin = opts.hugoBin ?? 'hugo';
  const signal = opts.signal;
  const started = Date.now();
  const cwd = root;
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ ok: false, exitCode: null, stdoutTail: '', stderrTail: '已取消。', durationMs: Date.now() - started, timedOut: false });
      return;
    }
    let settled = false;
    let stdout = '';
    let stderr = '';
    let child;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { signal?.removeEventListener?.('abort', onAbort); } catch {}
      resolve({ stdoutTail: tail(stdout), stderrTail: tail(stderr), durationMs: Date.now() - started, ...r });
    };
    const onAbort = () => {
      killTree(child, spawnFn, cwd);
      finish({ ok: false, exitCode: null, timedOut: false, error: 'aborted' });
    };
    let timer;
    try {
      child = spawnFn(hugoBin, args, { cwd, windowsHide: true, shell: false, detached: process.platform !== 'win32' });
    } catch (error) {
      resolve({ ok: false, exitCode: null, stdoutTail: '', stderrTail: tail(error?.message ?? String(error)), durationMs: Date.now() - started, missing: true, error: error?.message ?? String(error) });
      return;
    }
    try { signal?.addEventListener?.('abort', onAbort, { once: true }); } catch {}
    timer = setTimeout(() => {
      killTree(child, spawnFn, cwd);
      finish({ ok: false, exitCode: null, timedOut: true, error: `超时：${timeoutMs}ms 内未结束。` });
    }, timeoutMs);
    child.stdout?.on?.('data', (c) => { stdout += String(c); if (stdout.length > MAX_TAIL * 2) stdout = stdout.slice(-MAX_TAIL * 2); });
    child.stderr?.on?.('data', (c) => { stderr += String(c); if (stderr.length > MAX_TAIL * 2) stderr = stderr.slice(-MAX_TAIL * 2); });
    child.on?.('error', (error) => {
      finish({ ok: false, exitCode: null, missing: error?.code === 'ENOENT', error: error?.message ?? String(error) });
    });
    child.on?.('close', (code) => {
      finish({ ok: code === 0, exitCode: code ?? null });
    });
  });
}
export { MAX_TAIL };
