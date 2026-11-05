// hugo_build_check：跑 `hugo build --gc --minify`；dry_run=true 时只检查二进制与站点根，不跑 build。
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { runHugo } from '../hugo-cli.js';
import { loadConfig } from '../config.js';
import { requireRoot, refused } from './shared.js';
const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    ok: { type: 'boolean' }, refused: { type: 'boolean' }, reason: { type: 'string' },
    exitCode: { type: 'integer' }, outputFiles: { type: 'integer' },
    durationMs: { type: 'integer' }, logTail: { type: 'string' }, dryRun: { type: 'boolean' },
  },
  required: ['ok'],
};
async function countFiles(dir) {
  let count = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) stack.push(path.join(current, e.name));
      else if (e.isFile()) count += 1;
    }
  }
  return count;
}
export function registerBuildCheckTool(tools, deps = {}) {
  tools.register({
    name: 'hugo_build_check',
    description: '运行 hugo build --gc --minify 检查站点能否正常构建，适合发布前验收；不在 Hugo 站点时拒绝。dry_run 只检查 hugo 二进制与站点根。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { dry_run: { type: 'boolean', description: 'true 只检查 hugo 二进制与站点根，不跑 build' } },
      required: [],
    },
    output: { schema: SCHEMA, render: (_a, v) => [{ type: 'text', text: v.refused ? `拒绝：${v.reason}` : v.ok ? `构建通过，产物 ${v.outputFiles ?? '?'} 个文件` : `构建失败（exit ${v.exitCode}）` }] },
    async execute(args, exec) {
      const { root, error } = await requireRoot(exec, deps);
      if (error) return error;
      const cfg = await (deps.loadCfg ?? loadConfig)({ cwd: exec?.agent?.session?.header?.cwd, root });
      const runFn = deps.runHugo ?? runHugo;
      if (args.dry_run === true) {
        const probe = await runFn(root, { args: ['version'], timeoutMs: Math.min(cfg.timeoutMs ?? 120000, 30000), hugoBin: cfg.hugoBin, signal: exec?.signal });
        if (!probe.ok) return { ok: false, refused: false, reason: `hugo 二进制不可用（exit ${probe.exitCode}）`, exitCode: probe.exitCode, outputFiles: -1, durationMs: probe.durationMs, logTail: probe.stderrTail || probe.stdoutTail, dryRun: true };
        return { ok: true, refused: false, exitCode: 0, outputFiles: -1, durationMs: probe.durationMs, logTail: (probe.stdoutTail || probe.stderrTail || '').slice(-2000), dryRun: true };
      }
      const result = await runFn(root, { args: ['build', '--gc', '--minify'], timeoutMs: cfg.timeoutMs, hugoBin: cfg.hugoBin, signal: exec?.signal });
      let outputFiles = -1;
      if (result.ok) {
        try { await stat(path.join(root, 'public')); outputFiles = await countFiles(path.join(root, 'public')); } catch { /* 保持 -1 */ }
      }
      const logTail = [result.stdoutTail, result.stderrTail].filter(Boolean).join('\n').slice(-2000);
      if (!result.ok) return { ok: false, refused: false, reason: result.missing ? '找不到 hugo 可执行文件' : `hugo build 失败（exit ${result.exitCode}）`, exitCode: result.exitCode, outputFiles, durationMs: result.durationMs, logTail, dryRun: false };
      return { ok: true, refused: false, exitCode: 0, outputFiles, durationMs: result.durationMs, logTail, dryRun: false };
    },
    presentCall(args) { return { card: 'generic', title: 'Hugo 构建检查', kind: 'execute', content: [{ type: 'text', text: args.dry_run ? 'dry_run：仅检查二进制与站点根' : 'hugo build --gc --minify' }] }; },
    presentResult(_a, r) { return { card: 'generic', title: 'Hugo 构建检查', content: [{ type: 'text', text: r.refused ? `拒绝：${r.reason}` : r.ok ? `构建通过，产物 ${r.outputFiles ?? '?'} 个文件` : `构建失败（exit ${r.exitCode}）` }] }; },
  });
}
