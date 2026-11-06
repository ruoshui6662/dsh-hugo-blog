// 配置三层合并：包默认 < $DSH_HOME/hugo-blog/settings.json < <root>/.dsh/hugo-blog.json。缺文件不报错。
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export const PACKAGE_DEFAULTS = Object.freeze({
  hugoBin: 'hugo',
  contentRoot: 'content',
  gitRemote: 'origin',
  branch: 'main',
  siteUrl: undefined,
  target: undefined,
  timeoutMs: 120000,
});
const KEYS = ['hugoBin', 'contentRoot', 'gitRemote', 'branch', 'siteUrl', 'target', 'timeoutMs', 'articleOrder'];
async function readJson(file) {
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function pick(obj) {
  const out = {};
  for (const k of KEYS) if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) out[k] = obj[k];
  return out;
}
export async function loadConfig(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
  const defaults = { ...PACKAGE_DEFAULTS, ...(opts.packageDefaults ?? {}) };
  const root = opts.root ?? null;
  const userFile = path.join(homeDir, 'hugo-blog', 'settings.json');
  const siteFile = root ? path.join(root, '.dsh', 'hugo-blog.json') : null;
  const userCfg = await readJson(userFile);
  const siteCfg = siteFile ? await readJson(siteFile) : {};
  return { ...defaults, ...pick(userCfg), ...pick(siteCfg) };
}
