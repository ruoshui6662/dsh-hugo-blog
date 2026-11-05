// hugo_list：跑 `hugo list <kind>`，解析行数与前 50 行。
import { runHugo } from '../hugo-cli.js';
import { loadConfig } from '../config.js';
import { requireRoot } from './shared.js';
const KINDS = ['drafts', 'future', 'expired', 'all', 'published'];
const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    ok: { type: 'boolean' }, refused: { type: 'boolean' }, reason: { type: 'string' },
    kind: { type: 'string' }, total: { type: 'integer' }, lines: { type: 'array', items: { type: 'string' } }, logTail: { type: 'string' },
  },
  required: ['ok'],
};
export function registerListTool(tools, deps = {}) {
  tools.register({
    name: 'hugo_list',
    description: '列出 Hugo 内容清单（草稿/未来/过期/全部/已发布），适合巡检站点状态；不在 Hugo 站点时拒绝。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { kind: { type: 'string', enum: KINDS, description: '清单种类' } },
      required: ['kind'],
    },
    output: { schema: SCHEMA, render: (_a, v) => [{ type: 'text', text: v.refused ? `拒绝：${v.reason}` : v.ok ? `${v.kind}：${v.total} 行` : `失败：${v.reason ?? ''}` }] },
    async execute(args, exec) {
      const { root, error } = await requireRoot(exec, deps);
      if (error) return error;
      if (!KINDS.includes(args.kind)) return { ok: false, refused: true, reason: `kind 须为 ${KINDS.join('/')} 之一。` };
      const cfg = await (deps.loadCfg ?? loadConfig)({ cwd: exec?.agent?.session?.header?.cwd, root });
      const runFn = deps.runHugo ?? runHugo;
      const result = await runFn(root, { args: ['list', args.kind], timeoutMs: cfg.timeoutMs, hugoBin: cfg.hugoBin, signal: exec?.signal });
      if (!result.ok) return { ok: false, refused: false, reason: `hugo list 失败（exit ${result.exitCode}）`, kind: args.kind, total: 0, lines: [], logTail: result.stderrTail || result.stdoutTail };
      const all = (result.stdoutTail || '').split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
      return { ok: true, refused: false, kind: args.kind, total: all.length, lines: all.slice(0, 50), logTail: result.stderrTail || '' };
    },
    presentCall(args) { return { card: 'generic', title: 'Hugo 清单', kind: 'execute', content: [{ type: 'text', text: `hugo list ${args.kind}` }] }; },
    presentResult(_a, r) { return { card: 'generic', title: 'Hugo 清单', content: [{ type: 'text', text: r.refused ? `拒绝：${r.reason}` : r.ok ? `${r.kind}：${r.total} 行` : `失败：${r.reason ?? ''}` }] }; },
  });
}
