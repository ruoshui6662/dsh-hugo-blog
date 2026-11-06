// Hugo 博客管理面板的 Host 路由。浏览器半（client.js）只调这些 POST 路由，
// 所有 hugo/git 执行都在 Host 内完成；站点根由请求体 root 指定，但必须过
// findHugoRoot 工作区门禁，否则拒绝（非 Hugo 站点不执行任何命令）。
import path from 'node:path';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { findHugoRoot } from './workspace.js';
import { runHugo } from './hugo-cli.js';
import { gitStatusSummary, gitCheckClean } from './git.js';
import { loadConfig } from './config.js';
import { parseFrontmatter, updateFrontmatter, lintFrontmatter, serializeFrontmatter } from './frontmatter.js';

const ROUTE_PREFIX = '/api/hugo-blog';

function ok(value) {
  return { ok: true, value };
}
function fail(code, message) {
  return { ok: false, error: { code, message } };
}
function respond(payload) {
  return Response.json(payload, { headers: { 'cache-control': 'no-store' } });
}

function route(fn) {
  // connection.fetch 把 Request 传给 handler，handler 必须返回 Response（blog-manage 模式）。
  return async (request, maybeRequest) => {
    let body = request ?? {};
    let req = maybeRequest ?? request;
    if (request && typeof request.text === 'function') {
      req = request;
      body = {};
      if (request.method === 'POST') {
        const text = await request.text();
        if (text.trim() !== '') {
          try {
            body = JSON.parse(text);
          } catch {
            return respond(fail('bad-request', '请求体不是合法的 JSON'));
          }
        }
      }
    }
    try {
      const value = await fn(body ?? {}, req ?? {});
      return respond(ok(value === undefined ? null : value));
    } catch (error) {
      return respond(fail(error?.code ?? 'internal', error?.message ?? String(error)));
    }
  };
}

async function resolveRoot(body, fallbackRoot) {
  const candidate = typeof body?.root === 'string' && body.root.trim() !== ''
    ? path.resolve(body.root)
    : (fallbackRoot || process.cwd());
  const root = await findHugoRoot(candidate);
  if (!root) {
    const error = new Error(`不是 Hugo 站点（需要 hugo.toml 等配置与 content/ 目录）：${candidate}`);
    error.code = 'not-hugo-site';
    throw error;
  }
  return root;
}

function parseListLines(stdout) {
  return String(stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50);
}

async function resolveContentFile(root, cfg, relPath) {
  const rel = typeof relPath === 'string' ? relPath.trim().replace(/\\/g, '/') : '';
  if (!rel || path.isAbsolute(relPath) || rel.startsWith('../') || rel.includes('/../')) {
    const error = new Error(`内容路径不合法：${relPath}`);
    error.code = 'bad-path';
    throw error;
  }
  const contentDir = path.resolve(root, cfg.contentRoot ?? 'content');
  const target = path.resolve(contentDir, rel);
  if (!(target === contentDir || target.startsWith(contentDir + path.sep))) {
    const error = new Error(`内容路径越界：${relPath}`);
    error.code = 'bad-path';
    throw error;
  }
  if (!target.toLowerCase().endsWith('.md')) {
    const error = new Error(`仅支持 Markdown 文件：${relPath}`);
    error.code = 'bad-path';
    throw error;
  }
  return { rel, target };
}

const FRONTMATTER_KEYS = new Set([
  'title', 'date', 'publishDate', 'expiryDate', 'lastmod', 'weight', 'slug', 'url',
  'aliases', 'layout', 'type', 'draft', 'tags', 'categories', 'keywords', 'headless',
]);

function cleanPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    const error = new Error('patch 必须是对象');
    error.code = 'bad-patch';
    throw error;
  }
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!FRONTMATTER_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function createHugoRoutes({ config = {}, logger } = {}) {
  const fallbackRoot = typeof config.rootPath === 'string' && config.rootPath.trim() !== ''
    ? path.resolve(config.rootPath)
    : '';

  const handlers = {
    [`${ROUTE_PREFIX}/status`]: route(async (body, request) => {
      const root = await resolveRoot(body, fallbackRoot);
      const [git, drafts] = await Promise.all([
        gitStatusSummary(root, { signal: request.signal }),
        runHugo(root, { args: ['list', 'drafts'], timeoutMs: 30000, signal: request.signal }),
      ]);
      return {
        root,
        branch: git.branch ?? '',
        upstream: git.upstream ?? '',
        ahead: git.ahead ?? -1,
        behind: git.behind ?? -1,
        clean: git.clean ?? false,
        files: (git.files ?? []).slice(0, 20),
        drafts: drafts.ok ? parseListLines(drafts.stdoutTail) : [],
        draftsError: drafts.ok ? '' : (drafts.stderrTail || 'hugo list 失败'),
      };
    }),

    [`${ROUTE_PREFIX}/drafts`]: route(async (body, request) => {
      const root = await resolveRoot(body, fallbackRoot);
      const kind = ['drafts', 'future', 'expired', 'all', 'published'].includes(body.kind) ? body.kind : 'drafts';
      const result = await runHugo(root, { args: ['list', kind], timeoutMs: 30000, signal: request.signal });
      if (!result.ok) {
        const error = new Error(result.stderrTail || 'hugo list 失败');
        error.code = 'hugo-list-failed';
        throw error;
      }
      return { root, kind, rows: parseListLines(result.stdoutTail) };
    }),

    [`${ROUTE_PREFIX}/new-content`]: route(async (body, request) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const rel = typeof body.path === 'string' ? body.path.trim().replace(/\\/g, '/') : '';
      if (!rel || path.isAbsolute(body.path) || rel.startsWith('../') || rel.includes('/../')) {
        const error = new Error(`内容路径不合法：${body.path}`);
        error.code = 'bad-path';
        throw error;
      }
      const args = ['new', 'content', rel];
      if (typeof body.kind === 'string' && body.kind.trim() !== '') args.push('--kind', body.kind.trim());
      const result = await runHugo(root, { args, timeoutMs: 30000, hugoBin: cfg.hugoBin, signal: request.signal });
      if (!result.ok) {
        const error = new Error(result.stderrTail || result.stdoutTail || 'hugo new 失败');
        error.code = 'hugo-new-failed';
        throw error;
      }
      const { rel: normalized, target } = await resolveContentFile(root, cfg, rel);
      let data = {};
      try {
        const content = await readFile(target, 'utf8');
        data = parseFrontmatter(content).data;
        if (body.draft === true && data.draft !== true) {
          await writeFile(target, updateFrontmatter(content, { draft: true }), 'utf8');
          data = { ...data, draft: true };
        }
      } catch { /* 新文件已生成，摘要可空 */ }
      return { root, file: normalized, data };
    }),

    [`${ROUTE_PREFIX}/new-pagebundle`]: route(async (body /*, request */) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const dir = typeof body.dir === 'string' ? body.dir.trim().replace(/\\/g, '/') : '';
      if (!dir || path.isAbsolute(body.dir) || dir.startsWith('../') || dir.includes('/../')) {
        const error = new Error(`目录路径不合法：${body.dir}`);
        error.code = 'bad-path';
        throw error;
      }
      const contentDir = path.resolve(root, cfg.contentRoot ?? 'content');
      const bundleDir = path.resolve(contentDir, dir);
      if (!(bundleDir.startsWith(contentDir + path.sep))) {
        const error = new Error(`目录路径越界：${body.dir}`);
        error.code = 'bad-path';
        throw error;
      }
      const indexFile = path.join(bundleDir, 'index.md');
      const title = typeof body.title === 'string' && body.title.trim() !== '' ? body.title.trim() : path.basename(dir);
      const today = new Date().toISOString();
      const content = `---\ntitle: ${JSON.stringify(title)}\ndate: ${today}\ndraft: true\n---\n\n正文待写。\n`;
      try {
        await mkdir(bundleDir, { recursive: true });
        await writeFile(indexFile, content, { flag: 'wx' });
      } catch (error) {
        if (error?.code === 'EEXIST') {
          const exists = new Error(`index.md 已存在：${dir}/index.md`);
          exists.code = 'already-exists';
          throw exists;
        }
        throw error;
      }
      return { root, file: `${dir}/index.md` };
    }),

    [`${ROUTE_PREFIX}/read-frontmatter`]: route(async (body /*, request */) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const { rel, target } = await resolveContentFile(root, cfg, body.path);
      let content;
      try {
        content = await readFile(target, 'utf8');
      } catch {
        const error = new Error(`文件不存在：${rel}`);
        error.code = 'not-found';
        throw error;
      }
      const parsed = parseFrontmatter(content);
      return { root, file: rel, format: parsed.format, data: parsed.data, lint: lintFrontmatter(parsed.data) };
    }),

    [`${ROUTE_PREFIX}/edit-frontmatter`]: route(async (body /*, request */) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const { rel, target } = await resolveContentFile(root, cfg, body.path);
      const patch = cleanPatch(body.patch);
      let content;
      try {
        content = await readFile(target, 'utf8');
      } catch {
        const error = new Error(`文件不存在：${rel}`);
        error.code = 'not-found';
        throw error;
      }
      const next = updateFrontmatter(content, patch);
      await writeFile(target, next, 'utf8');
      const data = parseFrontmatter(next).data;
      return { root, file: rel, data, lint: lintFrontmatter(data) };
    }),

    [`${ROUTE_PREFIX}/cover`]: route(async (body /*, request */) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const { target } = await resolveContentFile(root, cfg, body.path);
      const dir = path.dirname(target);
      let content = '';
      try {
        content = await readFile(target, 'utf8');
      } catch {
        const error = new Error(`文件不存在：${body.path}`);
        error.code = 'not-found';
        throw error;
      }
      const data = parseFrontmatter(content).data;
      const declared = typeof data.cover === 'string' ? data.cover
        : (data.params && typeof data.params.cover === 'string' ? data.params.cover : '');
      const candidates = [];
      if (declared) candidates.push(path.resolve(dir, declared));
      for (const sub of ['images', '.']) {
        try {
          const entries = await readdir(path.join(dir, sub), { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && /\.(png|jpe?g|gif|webp)$/i.test(entry.name)) {
              candidates.push(path.join(dir, sub, entry.name));
              break;
            }
          }
        } catch { /* 无此目录 */ }
      }
      for (const candidate of candidates) {
        try {
          const st = await stat(candidate);
          if (!st.isFile() || st.size > 2 * 1024 * 1024) continue;
          const buffer = await readFile(candidate);
          const ext = path.extname(candidate).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          return { root, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
        } catch { /* 尝试下一个 */ }
      }
      return { root, dataUrl: '' };
    }),

    [`${ROUTE_PREFIX}/order`]: route(async (body /*, request */) => {
      const root = await resolveRoot(body, fallbackRoot);
      if (!Array.isArray(body.order)) {
        const error = new Error('order 必须是数组');
        error.code = 'bad-order';
        throw error;
      }
      const cfgDir = path.join(root, '.dsh');
      const cfgFile = path.join(cfgDir, 'hugo-blog.json');
      let existing = {};
      try {
        existing = JSON.parse(await readFile(cfgFile, 'utf8'));
      } catch { /* 无配置 */ }
      await mkdir(cfgDir, { recursive: true });
      const next = { ...existing, articleOrder: body.order.filter((x) => typeof x === 'string').slice(0, 1000) };
      await writeFile(cfgFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      return { root, order: next.articleOrder };
    }),

    [`${ROUTE_PREFIX}/tree`]: route(async (body /*, request */) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const contentDir = path.resolve(root, cfg.contentRoot ?? 'content');
      const nodes = [];
      let visited = 0;
      const walk = async (dir, depth) => {
        if (depth > 6 || visited > 2000) return;
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
        for (const entry of entries) {
          visited += 1;
          if (entry.isDirectory()) {
            if (['node_modules', '.git', 'public', 'resources', '.cache'].includes(entry.name)) continue;
            const full = path.join(dir, entry.name);
            nodes.push({ path: path.relative(contentDir, full).replace(/\\/g, '/'), dir: true, depth });
            await walk(full, depth + 1);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
            nodes.push({ path: path.relative(contentDir, path.join(dir, entry.name)).replace(/\\/g, '/'), dir: false, depth });
          }
        }
      };
      await walk(contentDir, 0);
      return { root, nodes };
    }),

    [`${ROUTE_PREFIX}/articles`]: route(async (body /*, request */) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const contentDir = path.resolve(root, cfg.contentRoot ?? 'content');
      const query = typeof body.query === 'string' ? body.query.trim().toLowerCase() : '';
      const kind = ['drafts', 'future', 'expired', 'all', 'published'].includes(body.kind) ? body.kind : 'all';
      const now = new Date();
      const articles = [];
      let visited = 0;
      const stack = [contentDir];
      while (stack.length && visited < 5000) {
        const dir = stack.pop();
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          visited += 1;
          if (entry.isDirectory()) {
            if (entry.name !== '_index.md') stack.push(path.join(dir, entry.name));
            continue;
          }
          if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
          const full = path.join(dir, entry.name);
          let content;
          try {
            content = await readFile(full, 'utf8');
          } catch {
            continue;
          }
          const parsed = parseFrontmatter(content);
          const rel = path.relative(contentDir, full).replace(/\\/g, '/');
          const data = parsed.data;
          const draft = data.draft === true;
          const publishDate = data.publishDate ? new Date(data.publishDate) : null;
          const expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
          const isFuture = publishDate && !Number.isNaN(publishDate.getTime()) && publishDate > now;
          const isExpired = expiryDate && !Number.isNaN(expiryDate.getTime()) && expiryDate <= now;
          if (kind === 'drafts' && !draft) continue;
          if (kind === 'future' && !isFuture) continue;
          if (kind === 'expired' && !isExpired) continue;
          if (kind === 'published' && (draft || isFuture || isExpired)) continue;
          const title = typeof data.title === 'string' ? data.title : '';
          if (query && !`${title} ${rel}`.toLowerCase().includes(query)) continue;
          articles.push({
            file: rel,
            title,
            date: typeof data.date === 'string' ? data.date : '',
            draft,
            tags: Array.isArray(data.tags) ? data.tags : [],
          });
        }
      }
      articles.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      if (Array.isArray(cfg.articleOrder) && cfg.articleOrder.length) {
        const rank = new Map(cfg.articleOrder.map((file, i) => [file, i]));
        articles.sort((a, b) => (rank.get(a.file) ?? 1e9) - (rank.get(b.file) ?? 1e9));
      }
      return { root, kind, total: articles.length, articles: articles.slice(0, 200) };
    }),

    [`${ROUTE_PREFIX}/read-article`]: route(async (body /*, request */) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const { rel, target } = await resolveContentFile(root, cfg, body.path);
      let content;
      try {
        content = await readFile(target, 'utf8');
      } catch {
        const error = new Error(`文件不存在：${rel}`);
        error.code = 'not-found';
        throw error;
      }
      const parsed = parseFrontmatter(content);
      return { root, file: rel, format: parsed.format, data: parsed.data, body: parsed.body, lint: lintFrontmatter(parsed.data) };
    }),

    [`${ROUTE_PREFIX}/save-article`]: route(async (body /*, request */) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const { rel, target } = await resolveContentFile(root, cfg, body.path);
      let content;
      try {
        content = await readFile(target, 'utf8');
      } catch {
        const error = new Error(`文件不存在：${rel}`);
        error.code = 'not-found';
        throw error;
      }
      const parsed = parseFrontmatter(content);
      let nextData = { ...parsed.data };
      if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
        nextData = { ...nextData, ...cleanPatch(body.data) };
      }
      const nextBody = typeof body.body === 'string' ? body.body : parsed.body;
      const next = serializeFrontmatter(parsed.format ?? 'yaml', nextData) + nextBody;
      await writeFile(target, next, 'utf8');
      const after = parseFrontmatter(next);
      return { root, file: rel, data: after.data, lint: lintFrontmatter(after.data) };
    }),

    [`${ROUTE_PREFIX}/insert-image`]: route(async (body /*, request */) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const { rel, target: mdTarget } = await resolveContentFile(root, cfg, body.path);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|gif|webp|svg)$/i.test(name)) {
        const error = new Error(`图片文件名不合法（仅 png/jpg/gif/webp/svg）：${name}`);
        error.code = 'bad-name';
        throw error;
      }
      const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : '';
      const buffer = Buffer.from(dataBase64, 'base64');
      if (buffer.length === 0) {
        const error = new Error('图片数据为空');
        error.code = 'bad-image';
        throw error;
      }
      if (buffer.length > 10 * 1024 * 1024) {
        const error = new Error('图片超过 10MB 上限');
        error.code = 'image-too-large';
        throw error;
      }
      const dir = path.dirname(mdTarget);
      const imgTarget = path.join(dir, 'images', name);
      try {
        await stat(imgTarget);
        const error = new Error(`图片已存在：images/${name}`);
        error.code = 'already-exists';
        throw error;
      } catch (error) {
        if (error?.code === 'already-exists') throw error;
      }
      await mkdir(path.dirname(imgTarget), { recursive: true });
      await writeFile(imgTarget, buffer);
      const markdown = `![${name.replace(/\.[^.]+$/, '')}](images/${name})`;
      return { root, file: rel, image: `images/${name}`, markdown };
    }),

    [`${ROUTE_PREFIX}/check`]: route(async (body, request) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const items = [];
      const clean = await gitCheckClean(root);
      items.push({
        name: 'git-clean',
        ok: clean.clean === true,
        detail: clean.clean ? '工作区干净' : `有未提交改动：${(clean.files ?? []).slice(0, 5).join(', ')}`,
      });
      const build = await runHugo(root, {
        args: ['build', '--gc', '--minify'],
        timeoutMs: cfg.timeoutMs,
        hugoBin: cfg.hugoBin,
        signal: request.signal,
      });
      items.push({
        name: 'build',
        ok: build.ok === true,
        detail: build.ok ? `${build.durationMs}ms` : (build.stderrTail || '构建失败').slice(-500),
      });
      return { root, items, passed: items.every((item) => item.ok) };
    }),

    [`${ROUTE_PREFIX}/build`]: route(async (body, request) => {
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const result = await runHugo(root, {
        args: ['build', '--gc', '--minify'],
        timeoutMs: cfg.timeoutMs,
        hugoBin: cfg.hugoBin,
        signal: request.signal,
      });
      let outputFiles = -1;
      if (result.ok) {
        const { stat, readdir } = await import('node:fs/promises');
        try {
          const pub = path.join(root, 'public');
          await stat(pub);
          let count = 0;
          const walk = async (dir) => {
            for (const entry of await readdir(dir, { withFileTypes: true })) {
              if (entry.isDirectory()) await walk(path.join(dir, entry.name));
              else count += 1;
            }
          };
          await walk(pub);
          outputFiles = count;
        } catch { /* 保持 -1 */ }
      }
      return {
        root,
        ok: result.ok,
        exitCode: result.exitCode ?? -1,
        outputFiles,
        durationMs: result.durationMs,
        logTail: [result.stdoutTail, result.stderrTail].filter(Boolean).join('\n').slice(-2000),
      };
    }),

    [`${ROUTE_PREFIX}/publish`]: route(async (body, request) => {
      if (body?.confirm !== true) {
        const error = new Error('发布需要二次确认：请求体带上 confirm: true 才会执行。');
        error.code = 'confirmation-required';
        throw error;
      }
      const root = await resolveRoot(body, fallbackRoot);
      const cfg = await loadConfig({ cwd: root, root });
      const clean = await gitCheckClean(root);
      if (!clean.clean) {
        const error = new Error(`工作区有未提交改动，拒绝发布：${(clean.files ?? []).slice(0, 10).join(', ')}`);
        error.code = 'dirty-workspace';
        throw error;
      }
      const build = await runHugo(root, {
        args: ['build', '--gc', '--minify'],
        timeoutMs: cfg.timeoutMs,
        hugoBin: cfg.hugoBin,
        signal: request.signal,
      });
      if (!build.ok) {
        const error = new Error(`构建失败（exit ${build.exitCode}）：${(build.stderrTail || '').slice(-500)}`);
        error.code = 'build-failed';
        throw error;
      }
      const { spawn: nodeSpawn } = await import('node:child_process');
      const git = (args) => new Promise((resolve) => {
        const child = nodeSpawn('git', args, { cwd: root, windowsHide: true, shell: false });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (c) => { stdout += String(c); });
        child.stderr.on('data', (c) => { stderr += String(c); });
        child.on('error', (e) => resolve({ ok: false, stdout, stderr: String(e?.message ?? e) }));
        child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr }));
      });
      const message = typeof body.message === 'string' && body.message.trim() !== ''
        ? body.message.trim()
        : `post: ${new Date().toISOString().slice(0, 10)}`;
      const add = await git(['add', '-A']);
      if (!add.ok) {
        const error = new Error(`git add 失败：${(add.stderr || '').slice(-500)}`);
        error.code = 'git-add-failed';
        throw error;
      }
      const commit = await git(['commit', '-m', message]);
      if (!commit.ok && !/nothing to commit/.test(commit.stdout + commit.stderr)) {
        const error = new Error(`git commit 失败：${(commit.stderr || '').slice(-500)}`);
        error.code = 'git-commit-failed';
        throw error;
      }
      const shaRes = await git(['rev-parse', 'HEAD']);
      const push = await git(['push', cfg.gitRemote ?? 'origin', cfg.branch ?? 'main']);
      if (!push.ok) {
        const error = new Error(`git push 失败（可在终端手动 push）：${(push.stderr || '').slice(-500)}`);
        error.code = 'git-push-failed';
        throw error;
      }
      return {
        root,
        pushed: true,
        commitSha: shaRes.ok ? shaRes.stdout.trim() : '',
        message,
        logTail: (push.stderr || push.stdout || '').slice(-500),
      };
    }),
  };

  return handlers;
}

export function registerHugoRoutes(ctx, { config = {}, logger } = {}) {
  const connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined;
  const register = connection?.fetch?.register;
  if (typeof register !== 'function') {
    logger?.warn?.('hugo-blog: connection.fetch 不可用，浏览器面板无法连接 Host');
    return;
  }
  const handlers = createHugoRoutes({ config, logger });
  for (const [routePath, handler] of Object.entries(handlers)) {
    ctx.effect(
      () => register.call(connection.fetch, {
        path: routePath,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: handler,
      }),
      `hugo-blog: ${routePath}`,
    );
  }
  logger?.info?.(`hugo-blog: 已注册 ${Object.keys(handlers).length} 条 /api/hugo-blog 路由`);
}
