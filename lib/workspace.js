// Hugo 工作区门禁：仿 quarto 版写法。
// Hugo 站点 = git 检出内、含 hugo 配置文件之一且含 content/ 目录的最近目录。
// 最近一个配置文件决定结果，不向上穿透到无关的父项目。
import { access } from 'node:fs/promises';
import path from 'node:path';
export const MAX_ASCENT = 64;
export const HUGO_CONFIG_FILES = ['hugo.toml', 'hugo.yaml', 'hugo.json', 'config.toml', 'config.yaml'];
const IGNORED = new Set(['.git', 'node_modules', 'public', 'resources', '.cache', '.dsh']);
async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}
export async function findGitRoot(cwd) {
  let cursor;
  try { cursor = path.resolve(cwd); } catch { return undefined; }
  for (let depth = 0; depth < MAX_ASCENT; depth += 1) {
    if (await exists(path.join(cursor, '.git'))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) return undefined;
    cursor = parent;
  }
  return undefined;
}
async function isHugoRoot(dir) {
  let hasConfig = false;
  for (const f of HUGO_CONFIG_FILES) {
    if (await exists(path.join(dir, f))) { hasConfig = true; break; }
  }
  if (!hasConfig) return false;
  return exists(path.join(dir, 'content'));
}
export async function findHugoRoot(cwd) {
  if (typeof cwd !== 'string' || cwd.trim() === '') return undefined;
  let start;
  try { start = path.resolve(cwd); } catch { return undefined; }
  // 目录本身就是 Hugo 站点时直接认可（不强制先有 .git；git 状态另行报告）。
  if (await isHugoRoot(start)) return start;
  const gitRoot = await findGitRoot(start);
  if (!gitRoot) return undefined;
  let cursor = start;
  for (let depth = 0; depth < MAX_ASCENT; depth += 1) {
    // 检查当前目录是否含任一 Hugo 配置文件；最近一个决定，不穿透。
    let hasConfig = false;
    for (const f of HUGO_CONFIG_FILES) {
      if (await exists(path.join(cursor, f))) { hasConfig = true; break; }
    }
    if (hasConfig) {
      return (await isHugoRoot(cursor)) ? cursor : undefined;
    }
    if (cursor === gitRoot) return undefined;
    const parent = path.dirname(cursor);
    if (parent === cursor) return undefined;
    cursor = parent;
  }
  return undefined;
}
export async function isHugoWorkspace(cwd) {
  return (await findHugoRoot(cwd)) !== undefined;
}
export { IGNORED };
