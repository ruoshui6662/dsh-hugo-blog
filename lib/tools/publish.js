// hugo_publish：门禁→构建→add→commit→push。dry_run 只做检查不写不推。
// 会产生 git 写操作，宿主策略可要求审批（审批由宿主策略钩子处理，本 execute 不自查）。
import { spawn as nodeSpawn } from 'node:child_process';
import { runHugo } from '../hugo-cli.js';
import { gitCheckClean, runGit } from '../git.js';
import { loadConfig } from '../config.js';
import { requireRoot, refused } from './shared.js';
const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    ok: { type: 'boolean' }, refused: { type: 'boolean' }, reason: { type: 'string' },
    stage: { type: 'string' }, commitSha: { type: 'string' }, pushed: { type: 'boolean' },
    logTail: { type: 'string' }, dryRun: { type: 'boolean' },
  },
  required: ['ok', 'stage'],
};
function git(root, args, spawnFn, signal) {
  if (typeof runGit === 'function') return runGit(root, args, spawnFn, signal);
  return new Promise((resolve) => {
    let stdout = ''; let stderr = '';
    const child = spawnFn('git', ['-C', root, ...args], { cwd: root, windowsHide: true, shell: false });
    child.stdout?.on?.('data', (c) => { stdout += String(c); });
    child.stderr?.on?.('data', (c) => { stderr += String(c); });
    child.on?.('error', (e) => resolve({ ok: false, exitCode: null, stdout, stderr: String(e?.message ?? e) }));
    child.on?.('close', (code) => resolve({ ok: code === 0, exitCode: code ?? null, stdout, stderr }));
  });
}
export function registerPublishTool(tools, deps = {}) {
  tools.register({
    name: 'hugo_publish',
    description: '发布 Hugo 站点：当前会话内检查 git 干净、构建通过后提交并推送到远程，会产生 git 写操作，宿主策略可要求审批；有未提交改动或不在 Hugo 站点时拒绝。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        message: { type: 'string', description: '提交信息，默认 "post: <date>"' },
        dry_run: { type: 'boolean', description: 'true 只做门禁与构建检查，不 add/commit/push' },
      },
      required: [],
    },
    output: { schema: SCHEMA, render: (_a, v) => [{ type: 'text', text: v.refused ? `拒绝（${v.stage}）：${v.reason}` : v.ok ? `已发布 sha=${v.commitSha ?? '-'} pushed=${v.pushed}` : `失败（${v.stage}）：${v.reason ?? v.logTail ?? ''}` }] },
    async execute(args, exec) {
      const { root, error } = await requireRoot(exec, deps);
      if (error) return { ...error, stage: 'gate' };
      const cfg = await (deps.loadCfg ?? loadConfig)({ cwd: exec?.agent?.session?.header?.cwd, root });
      const dryRun = args.dry_run === true;
      const message = args.message ?? `post: ${new Date().toISOString().slice(0, 10)}`;
      const spawnFn = deps.spawnImpl ?? nodeSpawn;
      const signal = exec?.signal;
      // 1) 门禁：git 干净
      const checkFn = deps.gitCheckClean ?? gitCheckClean;
      const clean = await checkFn(root, { spawnImpl: spawnFn, signal });
      if (!clean.clean) {
        return { ok: false, refused: true, stage: 'gate', reason: `工作区有未提交改动，拒绝发布：${(clean.files ?? []).slice(0, 20).join(', ')}`, commitSha: '', pushed: false, logTail: '', dryRun };
      }
      // 2) 构建检查
      const runFn = deps.runHugo ?? runHugo;
      const build = await runFn(root, { args: ['build', '--gc', '--minify'], timeoutMs: cfg.timeoutMs, hugoBin: cfg.hugoBin, signal });
      const buildTail = [build.stdoutTail, build.stderrTail].filter(Boolean).join('\n').slice(-2000);
      if (!build.ok) {
        return { ok: false, refused: false, stage: 'build', reason: `hugo build 失败（exit ${build.exitCode}）`, commitSha: '', pushed: false, logTail: buildTail, dryRun };
      }
      if (dryRun) return { ok: true, refused: false, stage: 'dry_run', commitSha: '', pushed: false, logTail: buildTail, dryRun: true };
      // 3) add / commit / push
      const add = await git(root, ['add', '-A'], spawnFn, signal);
      if (!add.ok) return { ok: false, refused: false, stage: 'add', reason: 'git add 失败', commitSha: '', pushed: false, logTail: (add.stderr || add.stdout || '').slice(-2000), dryRun };
      const commit = await git(root, ['commit', '-m', message], spawnFn, signal);
      if (!commit.ok) {
        const nothing = /nothing to commit/i.test(commit.stdout + commit.stderr);
        return { ok: false, refused: false, stage: 'commit', reason: nothing ? '没有可提交的改动（构建产物可能被忽略）' : 'git commit 失败', commitSha: '', pushed: false, logTail: (commit.stderr || commit.stdout || '').slice(-2000), dryRun };
      }
      const shaRes = await git(root, ['rev-parse', 'HEAD'], spawnFn, signal);
      const commitSha = shaRes.ok ? shaRes.stdout.trim() : '';
      const push = await git(root, ['push', cfg.gitRemote ?? 'origin', cfg.branch ?? 'main'], spawnFn, signal);
      if (!push.ok) return { ok: false, refused: false, stage: 'push', reason: 'git push 失败', commitSha, pushed: false, logTail: (push.stderr || push.stdout || '').slice(-2000), dryRun };
      return { ok: true, refused: false, stage: 'done', commitSha, pushed: true, logTail: (push.stderr || push.stdout || '').slice(-2000), dryRun };
    },
    presentCall(args) { return { card: 'generic', title: 'Hugo 发布', kind: 'execute', content: [{ type: 'text', text: args.dry_run ? 'dry_run：仅检查' : `发布：${args.message ?? '(默认消息)'}` }] }; },
    presentResult(_a, r) { return { card: 'generic', title: 'Hugo 发布', content: [{ type: 'text', text: r.refused ? `拒绝（${r.stage}）：${r.reason}` : r.ok ? `已发布 sha=${r.commitSha ?? '-'} pushed=${r.pushed}` : `失败（${r.stage}）：${r.reason ?? ''}` }] }; },
  });
}
