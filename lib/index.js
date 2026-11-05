// dsh-hugo-blog 入口：注册 skill provider（assets/hugo-blog/SKILL.md）与全部 Hugo 工具，
// 并在 ctx 上挂 hugoBlog 门面供其他插件调用。
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findHugoRoot } from './workspace.js';
import { runHugo } from './hugo-cli.js';
import { gitStatusSummary, gitCheckClean } from './git.js';
import { loadConfig } from './config.js';
import { registerNewContentTool } from './tools/new-content.js';
import { registerEditFrontmatterTool } from './tools/edit-frontmatter.js';
import { registerNewPagebundleTool } from './tools/new-pagebundle.js';
import { registerBuildCheckTool } from './tools/build-check.js';
import { registerListTool } from './tools/list.js';
import { registerPublishTool } from './tools/publish.js';
import { registerGitStatusTool } from './tools/git-status.js';
import { registerHugoRoutes } from './routes.js';
export const name = 'dsh-hugo-blog';
export const inject = ['skills', 'tools'];
const PROVIDER = 'dsh-hugo-blog';
const RANK = 550;
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKILLS_ROOT = path.join(PACKAGE_ROOT, 'assets');
function parseFm(source) {
  const src = String(source ?? '').replace(/^\uFEFF/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const p = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line.trim());
    if (!p) continue;
    let v = p[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    data[p[1]] = v;
  }
  return { data, body: src.slice(m[0].length) };
}
async function readCandidate(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  let source;
  try { source = await readFile(skillFile, 'utf8'); } catch { return undefined; }
  const { data } = parseFm(source);
  if (typeof data.name !== 'string' || !SKILL_NAME_RE.test(data.name)) return undefined;
  if (typeof data.description !== 'string' || !data.description.trim()) return undefined;
  if (data.name !== path.basename(skillDir)) return undefined;
  return {
    name: data.name, description: data.description.trim(),
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled', provider: PROVIDER, rank: RANK,
    locator: skillDir, resourceBase: { kind: 'directory', path: skillDir }, path: skillFile,
    ...(data.whenToUse ? { whenToUse: data.whenToUse } : {}),
  };
}
async function listSkills(options = {}) {
  if (options.signal?.aborted) return [];
  // list 无 cwd 时返回全部候选（技能在目录可见），工具侧再做门禁；有 cwd 时要求 Hugo 站点。
  if (options.cwd !== undefined && options.cwd !== null && options.cwd !== '') {
    if (!(await findHugoRoot(options.cwd))) return [];
  }
  let entries;
  try { entries = await readdir(SKILLS_ROOT, { withFileTypes: true }); } catch { return []; }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (options.signal?.aborted) return [];
    const c = await readCandidate(path.join(SKILLS_ROOT, entry.name));
    if (c) candidates.push(c);
  }
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return candidates;
}
async function getSkill(candidate, options = {}) {
  if (options.signal?.aborted) return undefined;
  if (!candidate || candidate.provider !== PROVIDER) return undefined;
  if (options.cwd !== undefined && options.cwd !== null && options.cwd !== '' && !(await findHugoRoot(options.cwd))) return undefined;
  const skillDir = candidate.locator;
  if (typeof skillDir !== 'string') return undefined;
  const resolved = path.resolve(skillDir);
  if (resolved !== SKILLS_ROOT && !resolved.startsWith(SKILLS_ROOT + path.sep)) return undefined;
  let source;
  try { source = await readFile(path.join(resolved, 'SKILL.md'), 'utf8'); } catch { return undefined; }
  const { data, body } = parseFm(source);
  if (data.name !== candidate.name) return undefined;
  return {
    name: candidate.name, description: candidate.description,
    ...(candidate.whenToUse ? { whenToUse: candidate.whenToUse } : {}),
    invocation: candidate.invocation, source: candidate.source, provider: PROVIDER,
    resourceBase: { kind: 'directory', path: resolved }, path: path.join(resolved, 'SKILL.md'),
    content: body.trim(),
  };
}
export function apply(ctx, config = {}) {
  const logger = ctx.logger ?? console;
  // 连接面板的 Host 路由：等 connection 服务就绪再注册（不阻塞插件激活）。
  try {
    if (typeof ctx.inject === 'function') {
      ctx.inject(['connection'], (inner) => registerHugoRoutes(inner, { config, logger }));
    } else {
      registerHugoRoutes(ctx, { config, logger });
    }
  } catch (error) {
    logger?.warn?.(`hugo-blog: 面板路由注册失败（${error?.message ?? error}）`);
  }
  if (ctx.skills && typeof ctx.skills.registerProvider === 'function') {
    ctx.skills.registerProvider(() => ({ name: PROVIDER, list: listSkills, get: getSkill }));
  }
  const deps = { getRoot: findHugoRoot, loadCfg: loadConfig, runHugo, gitStatusSummary, gitCheckClean };
  if (ctx.tools && typeof ctx.tools.register === 'function') {
    registerNewContentTool(ctx.tools, deps);
    registerEditFrontmatterTool(ctx.tools, deps);
    registerNewPagebundleTool(ctx.tools, deps);
    registerBuildCheckTool(ctx.tools, deps);
    registerListTool(ctx.tools, deps);
    registerPublishTool(ctx.tools, deps);
    registerGitStatusTool(ctx.tools, deps);
  }
  // 门面：供其他插件直接调用（cwd 显式传入）。Cordis 要求经 ctx.provide 注册服务。
  const hugoBlog = {
    async newContent(cwd, args) { return { cwd, args }; },
    async buildCheck(cwd, opts = {}) {
      const root = await findHugoRoot(cwd);
      if (!root) return { ok: false, refused: true, reason: '不在 Hugo 站点内。' };
      const cfg = await loadConfig({ cwd, root });
      return runHugo(root, { args: ['build', '--gc', '--minify'], timeoutMs: cfg.timeoutMs, hugoBin: cfg.hugoBin, signal: opts.signal });
    },
    async list(cwd, kind) {
      const root = await findHugoRoot(cwd);
      if (!root) return { ok: false, refused: true, reason: '不在 Hugo 站点内。' };
      const cfg = await loadConfig({ cwd, root });
      return runHugo(root, { args: ['list', kind ?? 'all'], timeoutMs: cfg.timeoutMs, hugoBin: cfg.hugoBin });
    },
    async publish(cwd, opts = {}) {
      const root = await findHugoRoot(cwd);
      if (!root) return { ok: false, refused: true, stage: 'gate', reason: '不在 Hugo 站点内。' };
      const clean = await gitCheckClean(root);
      if (!clean.clean) return { ok: false, refused: true, stage: 'gate', reason: `未提交改动：${clean.files.join(', ')}` };
      const cfg = await loadConfig({ cwd, root });
      const build = await runHugo(root, { args: ['build', '--gc', '--minify'], timeoutMs: cfg.timeoutMs, hugoBin: cfg.hugoBin });
      return { ok: build.ok, stage: build.ok ? 'build_ok' : 'build', pushed: false, commitSha: null, logTail: [build.stdoutTail, build.stderrTail].filter(Boolean).join('\n').slice(-2000), dryRun: opts.dryRun ?? false };
    },
    async status(cwd) {
      const root = await findHugoRoot(cwd);
      if (!root) return { ok: false, refused: true, reason: '不在 Hugo 站点内。' };
      return gitStatusSummary(root);
    },
  };
  if (typeof ctx.provide === 'function') ctx.provide('hugoBlog', hugoBlog);
  else ctx.hugoBlog = hugoBlog;
}
