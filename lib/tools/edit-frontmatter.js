// hugo_edit_frontmatter：读文件 → updateFrontmatter → 写回，返回变更前后摘要。
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter, updateFrontmatter } from '../frontmatter.js';
import { requireRoot, refused, safeResolve } from './shared.js';
const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    ok: { type: 'boolean' }, refused: { type: 'boolean' }, reason: { type: 'string' },
    file: { type: 'string' }, before: { type: 'object' }, after: { type: 'object' }, changed: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok'],
};
export function registerEditFrontmatterTool(tools, deps = {}) {
  tools.register({
    name: 'hugo_edit_frontmatter',
    description: '修改 Hugo 内容文件的 front matter（如标题、草稿、标签），适合批量整理元信息；文件不存在或不在站点内时拒绝。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        path: { type: 'string', description: '站点内文件路径，如 content/posts/hello.md' },
        patch: { type: 'object', description: '要合并的键值；值为 null 表示删除该键' },
      },
      required: ['path', 'patch'],
    },
    output: { schema: SCHEMA, render: (_a, v) => [{ type: 'text', text: v.refused ? `拒绝：${v.reason}` : v.ok ? `已更新 ${v.file}：${(v.changed ?? []).join(', ')}` : `失败：${v.reason ?? ''}` }] },
    async execute(args, exec) {
      const { root, error } = await requireRoot(exec, deps);
      if (error) return error;
      if (!args.path || typeof args.path !== 'string') return refused('path 必填。');
      if (!args.patch || typeof args.patch !== 'object' || Array.isArray(args.patch)) return refused('patch 必填且为对象。');
      const target = safeResolve(root, args.path);
      if (!target) return refused(`path 逃逸站点根：${args.path}`);
      let text;
      try { text = await readFile(target, 'utf8'); } catch { return refused(`文件不存在：${target}`); }
      const before = parseFrontmatter(text).data;
      const patch = {};
      for (const [k, v] of Object.entries(args.patch)) patch[k] = v === null ? undefined : v;
      const next = updateFrontmatter(text, patch);
      const after = parseFrontmatter(next).data;
      await writeFile(target, next, 'utf8');
      const changed = Object.keys(patch).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      return { ok: true, refused: false, file: target, before, after, changed };
    },
    presentCall(args) { return { card: 'generic', title: 'Hugo 编辑 Front Matter', kind: 'execute', locations: [{ path: args.path }], rawInput: args.path, content: [{ type: 'text', text: `${args.path} patch=${Object.keys(args.patch ?? {}).join(',')}` }] }; },
    presentResult(_a, r) { return { card: 'generic', title: 'Hugo 编辑 Front Matter', content: [{ type: 'text', text: r.refused ? `拒绝：${r.reason}` : r.ok ? `已更新 ${r.file}：${(r.changed ?? []).join(', ')}` : `失败：${r.reason ?? ''}` }] }; },
  });
}
