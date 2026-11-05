// hugo_new_content：跑 `hugo new content <path> [--kind k]`，返回新文件路径与 front matter 摘要。
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { runHugo } from '../hugo-cli.js';
import { parseFrontmatter } from '../frontmatter.js';
import { loadConfig } from '../config.js';
import { requireRoot, refused, safeResolve } from './shared.js';
const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    ok: { type: 'boolean' }, refused: { type: 'boolean' }, reason: { type: 'string' },
    file: { type: 'string' }, frontmatter: { type: 'object' }, logTail: { type: 'string' },
  },
  required: ['ok'],
};
export function registerNewContentTool(tools, deps = {}) {
  tools.register({
    name: 'hugo_new_content',
    description: '在 Hugo 站点新建一篇内容（hugo new content），适合起草新文章；目标已存在或不在 Hugo 站点时拒绝。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        path: { type: 'string', description: '相对 content/ 的新文件路径，如 posts/hello.md' },
        kind: { type: 'string', description: '可选 archetype 种类，如 post' },
        draft: { type: 'boolean', description: '可选，建完后把 draft 设为 true' },
      },
      required: ['path'],
    },
    output: { schema: SCHEMA, render: (_a, v) => [{ type: 'text', text: v.refused ? `拒绝：${v.reason}` : v.ok ? `已生成 ${v.file}` : `失败：${v.reason ?? v.logTail ?? ''}` }] },
    async execute(args, exec) {
      const { root, error } = await requireRoot(exec, deps);
      if (error) return error;
      if (!args.path || typeof args.path !== 'string') return refused('path 必填且为字符串。');
      const cfg = await (deps.loadCfg ?? loadConfig)({ cwd: exec?.agent?.session?.header?.cwd, root });
      const target = safeResolve(root, path.join(cfg.contentRoot ?? 'content', args.path));
      if (!target) return refused(`path 逃逸站点根：${args.path}`);
      try { await access(target); return refused(`目标已存在，不覆盖：${target}`); } catch {}
      const hugoArgs = ['new', 'content', args.path];
      if (args.kind) hugoArgs.push('--kind', String(args.kind));
      const runFn = deps.runHugo ?? runHugo;
      const result = await runFn(root, { args: hugoArgs, timeoutMs: cfg.timeoutMs, hugoBin: cfg.hugoBin, signal: exec?.signal });
      if (!result.ok) return { ok: false, refused: false, reason: `hugo new 失败（exit ${result.exitCode}）`, logTail: result.stderrTail || result.stdoutTail };
      let frontmatter = {};
      try {
        const text = await readFile(target, 'utf8');
        frontmatter = parseFrontmatter(text).data;
        if (args.draft === true && frontmatter.draft !== true) {
          const { updateFrontmatter } = await import('../frontmatter.js');
          const { writeFile } = await import('node:fs/promises');
          await writeFile(target, updateFrontmatter(text, { draft: true }), 'utf8');
          frontmatter.draft = true;
        }
      } catch {}
      const logTail = [result.stdoutTail, result.stderrTail].filter(Boolean).join('\n').slice(-2000);
      return { ok: true, refused: false, file: target, frontmatter, logTail };
    },
    presentCall(args) { return { card: 'generic', title: 'Hugo 新建内容', kind: 'execute', locations: [{ path: args.path }], rawInput: args.path, content: [{ type: 'text', text: `hugo new content ${args.path}${args.kind ? ` --kind ${args.kind}` : ''}` }] }; },
    presentResult(_a, r) { return { card: 'generic', title: 'Hugo 新建内容', content: [{ type: 'text', text: r.refused ? `拒绝：${r.reason}` : r.ok ? `已生成 ${r.file}` : `失败：${r.reason ?? ''}` }] }; },
  });
}
