// hugo_new_pagebundle：在 content/<dir>/ 下建 index.md（已有则拒绝），front matter 含 title/date/draft:true。
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { serializeFrontmatter } from '../frontmatter.js';
import { loadConfig } from '../config.js';
import { requireRoot, refused, safeResolve } from './shared.js';
const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    ok: { type: 'boolean' }, refused: { type: 'boolean' }, reason: { type: 'string' },
    file: { type: 'string' }, frontmatter: { type: 'object' },
  },
  required: ['ok'],
};
export function registerNewPagebundleTool(tools, deps = {}) {
  tools.register({
    name: 'hugo_new_pagebundle',
    description: '新建 Hugo page bundle（content/<dir>/index.md，draft:true），适合带资源的长文；目录已存在 index.md 时拒绝。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        dir: { type: 'string', description: '相对 content/ 的目录，如 posts/hello-world' },
        title: { type: 'string', description: '可选标题，默认取目录名' },
      },
      required: ['dir'],
    },
    output: { schema: SCHEMA, render: (_a, v) => [{ type: 'text', text: v.refused ? `拒绝：${v.reason}` : v.ok ? `已生成 ${v.file}` : `失败：${v.reason ?? ''}` }] },
    async execute(args, exec) {
      const { root, error } = await requireRoot(exec, deps);
      if (error) return error;
      if (!args.dir || typeof args.dir !== 'string') return refused('dir 必填。');
      const cfg = await (deps.loadCfg ?? loadConfig)({ cwd: exec?.agent?.session?.header?.cwd, root });
      const bundleDir = safeResolve(root, path.join(cfg.contentRoot ?? 'content', args.dir));
      if (!bundleDir) return refused(`dir 逃逸站点根：${args.dir}`);
      const target = path.join(bundleDir, 'index.md');
      try { await access(target); return refused(`index.md 已存在，不覆盖：${target}`); } catch {}
      const title = args.title ?? path.basename(bundleDir);
      const data = { title, date: new Date().toISOString().slice(0, 10), draft: true };
      await mkdir(bundleDir, { recursive: true });
      await writeFile(target, serializeFrontmatter('yaml', data) + '\n', 'utf8');
      return { ok: true, refused: false, file: target, frontmatter: data };
    },
    presentCall(args) { return { card: 'generic', title: 'Hugo 新建 Page Bundle', kind: 'execute', locations: [{ path: args.dir }], rawInput: args.dir, content: [{ type: 'text', text: `content/${args.dir}/index.md` }] }; },
    presentResult(_a, r) { return { card: 'generic', title: 'Hugo 新建 Page Bundle', content: [{ type: 'text', text: r.refused ? `拒绝：${r.reason}` : r.ok ? `已生成 ${r.file}` : `失败：${r.reason ?? ''}` }] }; },
  });
}
