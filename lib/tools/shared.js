// 工具共享：cwd 提取、站点门禁、结构化拒绝、卡片呈现。
import path from 'node:path';
import { findHugoRoot } from '../workspace.js';
export function cwdOf(exec) {
  const cwd = exec?.agent?.session?.header?.cwd;
  return typeof cwd === 'string' && cwd.trim() !== '' ? cwd : undefined;
}
export function refused(reason, extra = {}) {
  return { ok: false, refused: true, reason, ...extra };
}
export async function requireRoot(exec, deps = {}) {
  const cwd = cwdOf(exec);
  if (!cwd) return { error: refused('当前会话没有 cwd；只在 Hugo 站点会话内工作。') };
  const getRoot = deps.getRoot ?? findHugoRoot;
  const root = await getRoot(cwd);
  if (!root) return { error: refused('当前会话不在 Hugo 站点内：需要 git 检出、hugo.toml/hugo.yaml/hugo.json/config.toml/config.yaml 之一，且含 content/ 目录。') };
  return { cwd, root };
}
export function presentText(title, lines, locations) {
  return {
    card: 'generic',
    title,
    kind: 'execute',
    ...(locations?.length ? { locations } : {}),
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}
export function summaryLines(result) {
  if (result?.refused) return [`拒绝：${result.reason}`];
  if (result?.ok === false) return [`失败：${result.reason ?? result.error ?? '未知错误'}`];
  return ['成功。'];
}
export function safeResolve(root, rel) {
  const resolved = path.resolve(root, rel);
  const relToRoot = path.relative(root, resolved);
  if (relToRoot.startsWith(`..${path.sep}`) || relToRoot === '..' || path.isAbsolute(relToRoot)) return null;
  return resolved;
}
