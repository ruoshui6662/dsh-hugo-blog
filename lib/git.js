// Git 摘要：status / branch / ahead-behind / clean 检查。失败结构化返回，不抛裸异常。
import { spawn as nodeSpawn } from 'node:child_process';
function runGit(root, args, spawnFn, signal) {
  return new Promise((resolve) => {
    let stdout = ''; let stderr = ''; let settled = false;
    const finish = (r) => { if (!settled) { settled = true; resolve(r); } };
    let child;
    try {
      child = spawnFn('git', ['-C', root, ...args], { cwd: root, windowsHide: true, shell: false });
    } catch (e) { finish({ ok: false, exitCode: null, stdout, stderr: String(e?.message ?? e) }); return; }
    child.stdout?.on?.('data', (c) => { stdout += String(c); });
    child.stderr?.on?.('data', (c) => { stderr += String(c); });
    child.on?.('error', (e) => finish({ ok: false, exitCode: null, stdout, stderr: String(e?.message ?? e) }));
    child.on?.('close', (code) => finish({ ok: code === 0, exitCode: code ?? null, stdout, stderr }));
  });
}
/** 解析 `git status --porcelain=v1 -b` 的分支行 `## branch...upstream [ahead N, behind M]`。 */
export function parseBranchHeader(line) {
  const m = /^##\s+(.+)$/.exec(line ?? '');
  if (!m) return { branch: '', upstream: '', ahead: -1, behind: -1 };
  const rest = m[1].trim();
  let branch = rest;
  let upstream = '';
  let ahead = -1; let behind = -1;
  if (rest.includes('...')) {
    const [b, u] = rest.split('...');
    branch = b.trim();
    const bracket = /^(.*?)\s*\[(.*)\]\s*$/.exec(u.trim());
    if (bracket) { upstream = bracket[1].trim(); const am = /ahead (\d+)/.exec(bracket[2]); const bm = /behind (\d+)/.exec(bracket[2]); if (am) ahead = Number(am[1]); if (bm) behind = Number(bm[1]); }
    else upstream = u.trim();
  }
  if (branch.startsWith('HEAD')) branch = '';
  return { branch, upstream, ahead, behind };
}
export async function gitStatusSummary(root, opts = {}) {
  const spawnFn = opts.spawnImpl ?? nodeSpawn;
  const signal = opts.signal;
  const empty = { ok: false, root, branch: '', upstream: '', ahead: -1, behind: -1, files: [], clean: false, error: 'unknown' };
  const st = await runGit(root, ['status', '--porcelain=v1', '-b'], spawnFn, signal);
  if (!st.ok) return { ...empty, error: (st.stderr || st.stdout || 'git status 失败').trim().slice(-2000) };
  const lines = st.stdout.split(/\r?\n/);
  const files = [];
  let branch = ''; let upstream = ''; let ahead = -1; let behind = -1;
  for (const line of lines) {
    if (line.startsWith('##')) { const p = parseBranchHeader(line); branch = p.branch; upstream = p.upstream; ahead = p.ahead; behind = p.behind; continue; }
    if (!line.trim()) continue;
    // porcelain v1: XY + 空格 + 路径（重命名用 "old -> new"）
    files.push(line.slice(3) || line.trim());
  }
  // 补充 branch / ahead-behind（上游不存在时保持 null）
  if (branch === '') {
    const b = await runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'], spawnFn, signal);
    if (b.ok && b.stdout.trim()) branch = b.stdout.trim();
  }
  const cnt = await runGit(root, ['rev-list', '--left-right', '--count', '@{u}...HEAD'], spawnFn, signal);
  if (cnt.ok) {
    const parts = cnt.stdout.trim().split(/\s+/);
    if (parts.length === 2 && parts.every((p) => /^\d+$/.test(p))) { behind = Number(parts[0]); ahead = Number(parts[1]); }
  }
  return { ok: true, root, branch, upstream, ahead, behind, files, clean: files.length === 0, error: '' };
}
export async function gitCheckClean(root, opts = {}) {
  const summary = await gitStatusSummary(root, opts);
  return { clean: summary.ok && summary.clean, files: summary.files, summary };
}
export { runGit };
