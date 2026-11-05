// git_status_summary：返回 git.js 摘要结构。
import { gitStatusSummary } from '../git.js';
import { requireRoot } from './shared.js';
const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    ok: { type: 'boolean' }, refused: { type: 'boolean' }, reason: { type: 'string' },
    root: { type: 'string' }, branch: { type: 'string' }, upstream: { type: 'string' },
    ahead: { type: 'integer' }, behind: { type: 'integer' },
    files: { type: 'array', items: { type: 'string' } }, clean: { type: 'boolean' }, error: { type: 'string' },
  },
  required: ['ok'],
};
export function registerGitStatusTool(tools, deps = {}) {
  tools.register({
    name: 'git_status_summary',
    description: '查看 Hugo 站点 git 状态（分支、ahead/behind、未提交文件），适合发布前确认工作区干净；不在 Hugo 站点时拒绝。',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    output: { schema: SCHEMA, render: (_a, v) => [{ type: 'text', text: v.refused ? `拒绝：${v.reason}` : v.ok ? `${v.branch ?? '?'} clean=${v.clean} files=${v.files.length}` : `失败：${v.error ?? ''}` }] },
    async execute(_args, exec) {
      const { root, error } = await requireRoot(exec, deps);
      if (error) return error;
      const fn = deps.gitStatusSummary ?? gitStatusSummary;
      const summary = await fn(root, { signal: exec?.signal });
      return { ...summary, refused: false };
    },
    presentCall() { return { card: 'generic', title: 'Git 状态', kind: 'execute', content: [{ type: 'text', text: 'git status 摘要' }] }; },
    presentResult(_a, r) { return { card: 'generic', title: 'Git 状态', content: [{ type: 'text', text: r.refused ? `拒绝：${r.reason}` : r.ok ? `${r.branch ?? '?'} clean=${r.clean} files=${r.files.length}` : `失败：${r.error ?? ''}` }] }; },
  });
}
