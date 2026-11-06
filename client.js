/**
 * Hugo 博客管理面板（浏览器半）。
 *
 * 侧边栏入口（sidebar.panellist 图标）打开 main 面板。面板第一步是选择站点
 * 目录（原生目录选择器或手动输入），载入成功后才展开状态、文章列表、
 * 新建/编辑 Front Matter、构建与发布。所有执行都在 Host 的
 * /api/hugo-blog/* 路由内完成，浏览器不直接跑 hugo/git。
 */
window.__ModuleLoader__.load({
  id: 'dsh-hugo-blog',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useCallback, useEffect, useRef } = React;

    const NS = 'dsh-hugo-blog';
    const ROUTE_ROOT = 'api/hugo-blog';
    const STORAGE_KEY = 'dsh-hugo-blog:sitePath';
    const PANEL_ID = 'hugo-blog';

    const ZH = {
      'panel.title': 'Hugo 博客',
      'site.title': '1. 站点目录',
      'site.choose': '选择目录…',
      'site.load': '载入站点',
      'site.loaded': '已载入',
      'site.placeholder': '输入 Hugo 站点根目录，如 /Users/me/blog',
      'site.pickUnsupported': '当前环境不支持目录选择，请手动输入路径',
      'status.title': '2. 站点状态',
      'status.refresh': '刷新状态',
      'status.branch': '分支',
      'status.drafts': '草稿',
      'status.clean': '干净',
      'status.dirty': '有改动',
      'list.title': '3. 文章列表',
      'list.drafts': '草稿',
      'list.future': '未来',
      'list.expired': '已过期',
      'list.all': '全部',
      'list.published': '已发布',
      'list.load': '列出',
      'new.title': '4. 新建文章',
      'new.path': 'content 相对路径，如 posts/hello.md',
      'new.create': '创建',
      'new.bundle': '新建 Page Bundle',
      'edit.title': '5. 编辑 Front Matter',
      'edit.path': 'content 相对路径，如 posts/hello.md',
      'edit.load': '读取',
      'edit.save': '保存',
      'edit.titleField': '标题',
      'edit.draft': '草稿',
      'edit.tags': '标签（逗号分隔）',
      'edit.categories': '分类（逗号分隔）',
      'edit.date': '日期',
      'edit.publishDate': '定时发布',
      'edit.expiryDate': '过期下架',
      'edit.slug': 'Slug',
      'build.title': '6. 构建与发布',
      'build.check': '构建检查',
      'build.publish': '发布',
      'build.confirmPublish': '确认发布？',
      'build.cancel': '取消',
      'build.ok': '构建通过',
      'build.fail': '构建失败',
      'build.published': '已推送',
      'panel.loading': '处理中…',
      'panel.error': '出错',
      'panel.ok': '完成',
      'articles.search': '搜索标题或路径…',
      'articles.empty': '还没有文章，点「创建」写第一篇。',
      'editor.body': '正文（Markdown）',
      'editor.insertImage': '插入图片',
      'editor.bold': '加粗',
      'editor.heading': '标题',
      'editor.list': '列表',
      'editor.link': '链接',
      'check.title': '检查清单',
      'check.run': '一键检查',
      'check.pass': '通过',
      'check.fail': '未通过',
      'maint.title': '日常维护',
      'maint.hint': '草稿、未来定时发布、已过期三类在「文章列表」中切换查看；下架用过期日期字段。',
    };
    const EN = {
      'panel.title': 'Hugo Blog',
      'site.title': '1. Site directory',
      'site.choose': 'Choose directory…',
      'site.load': 'Load site',
      'site.loaded': 'Loaded',
      'site.placeholder': 'Hugo site root, e.g. /Users/me/blog',
      'site.pickUnsupported': 'Directory picker unavailable here; type the path manually',
      'status.title': '2. Status',
      'status.refresh': 'Refresh',
      'status.branch': 'branch',
      'status.drafts': 'drafts',
      'status.clean': 'clean',
      'status.dirty': 'dirty',
      'list.title': '3. Articles',
      'list.drafts': 'Drafts',
      'list.future': 'Future',
      'list.expired': 'Expired',
      'list.all': 'All',
      'list.published': 'Published',
      'list.load': 'List',
      'new.title': '4. New article',
      'new.path': 'Path under content/, e.g. posts/hello.md',
      'new.create': 'Create',
      'new.bundle': 'New page bundle',
      'edit.title': '5. Edit front matter',
      'edit.path': 'Path under content/, e.g. posts/hello.md',
      'edit.load': 'Load',
      'edit.save': 'Save',
      'edit.titleField': 'Title',
      'edit.draft': 'Draft',
      'edit.tags': 'Tags (comma separated)',
      'edit.categories': 'Categories (comma separated)',
      'edit.date': 'Date',
      'edit.publishDate': 'Publish date',
      'edit.expiryDate': 'Expiry date',
      'edit.slug': 'Slug',
      'build.title': '6. Build & publish',
      'build.check': 'Build check',
      'build.publish': 'Publish',
      'build.confirmPublish': 'Confirm publish?',
      'build.cancel': 'Cancel',
      'build.ok': 'Build passed',
      'build.fail': 'Build failed',
      'build.published': 'Pushed',
      'panel.loading': 'Working…',
      'panel.error': 'Error',
      'panel.ok': 'Done',
      'articles.search': 'Search title or path…',
      'articles.empty': 'No articles yet. Create the first one.',
      'editor.body': 'Body (Markdown)',
      'editor.insertImage': 'Insert image',
      'editor.bold': 'Bold',
      'editor.heading': 'Heading',
      'editor.list': 'List',
      'editor.link': 'Link',
      'check.title': 'Checklist',
      'check.run': 'Run checks',
      'check.pass': 'Pass',
      'check.fail': 'Fail',
      'maint.title': 'Maintenance',
      'maint.hint': 'Drafts, scheduled, and expired articles are under the article list kinds. Use the expiry date to take a post down.',
    };

    async function callApi(name, body) {
      const response = await fetch(`${ROUTE_ROOT}/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error(`Host 返回了无法解析的响应（HTTP ${response.status}）`);
      }
      if (payload?.ok !== true) {
        const error = payload?.error ?? {};
        throw new Error(error.message ?? '未知错误');
      }
      return payload.value;
    }

    const styles = {
      page: {
        display: 'flex', flexDirection: 'column', gap: 14, padding: 16,
        color: 'var(--dsw-alias-label-primary)', fontSize: 13, fontFamily: 'inherit',
        overflowY: 'auto', height: '100%', boxSizing: 'border-box',
      },
      section: {
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12,
        background: 'var(--dsw-alias-bg-layer-1)', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 8,
      },
      heading: { fontWeight: 600, fontSize: 13.5 },
      row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
      input: {
        flex: '1 1 auto', minWidth: 0, padding: '7px 10px', borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
      },
      label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      button: {
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
        borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent', color: 'var(--dsw-alias-label-primary)',
        fontSize: 12.5, cursor: 'pointer', lineHeight: 1.5, fontFamily: 'inherit', whiteSpace: 'nowrap',
      },
      buttonPrimary: {
        border: '1px solid transparent', background: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-label-primary-inverted, #1b1b1b)', fontWeight: 600,
      },
      buttonDanger: {
        border: '1px solid var(--dsw-alias-state-error-primary)',
        color: 'var(--dsw-alias-state-error-primary)',
      },
      muted: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
      error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 },
      ok: { color: 'var(--dsw-alias-state-success-primary, var(--dsw-alias-label-primary))', fontSize: 12 },
      list: { margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', maxHeight: 180, overflowY: 'auto' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, wordBreak: 'break-all' },
      check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 },
    };

    function Section({ title, children }) {
      return h('section', { style: styles.section },
        h('div', { style: styles.heading }, title),
        children);
    }

    function HugoIcon({ size }) {
      const s = size ?? 20;
      return h('svg', {
        viewBox: '0 0 24 24', width: s, height: s, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M6 3.5h9.5L19 7v13.5H6z' }),
        h('path', { d: 'M15 3.5V7h4' }),
        h('path', { d: 'M9 11.5h6M9 15h6' }),
      );
    }

    function HugoPanel({ t, pickDirectory }) {
      const [sitePath, setSitePath] = useState(() => {
        try { return window.localStorage?.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
      });
      const [site, setSite] = useState(null);
      const [status, setStatus] = useState(null);
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState('');
      const [messageKind, setMessageKind] = useState('muted');
      const [listKind, setListKind] = useState('all');
      const [listRows, setListRows] = useState([]);
      const [query, setQuery] = useState('');
      const [body, setBody] = useState('');
      const [checkItems, setCheckItems] = useState([]);
      const bodyRef = useRef(null);
      const [newPath, setNewPath] = useState('posts/');
      const [editPath, setEditPath] = useState('');
      const [fmTitle, setFmTitle] = useState('');
      const [fmDraft, setFmDraft] = useState(true);
      const [fmTags, setFmTags] = useState('');
      const [fmCategories, setFmCategories] = useState('');
      const [fmDate, setFmDate] = useState('');
      const [fmPublishDate, setFmPublishDate] = useState('');
      const [fmExpiryDate, setFmExpiryDate] = useState('');
      const [fmSlug, setFmSlug] = useState('');
      const [confirming, setConfirming] = useState(false);

      const say = useCallback((text, kind = 'muted') => {
        setMessage(text);
        setMessageKind(kind);
      }, []);

      const run = useCallback(async (fn, successText) => {
        setBusy(true);
        try {
          const value = await fn();
          if (successText) say(successText, 'ok');
          return value;
        } catch (error) {
          say(`${t('panel.error')}：${error.message}`, 'error');
          return null;
        } finally {
          setBusy(false);
        }
      }, [say, t]);

      const loadSite = useCallback(async (root) => {
        const value = await run(() => callApi('status', { root: root || sitePath }), site ? null : t('site.loaded'));
        if (value) {
          setSite(value.root);
          setStatus(value);
          try { window.localStorage?.setItem(STORAGE_KEY, value.root); } catch { /* 忽略 */ }
        }
        return value;
      }, [run, sitePath, t]);

      useEffect(() => {
        if (sitePath) loadSite(sitePath);
        // 仅在挂载时按已保存目录自动载入一次。
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const chooseDirectory = useCallback(async () => {
        if (typeof pickDirectory !== 'function') {
          say(t('site.pickUnsupported'), 'error');
          return;
        }
        try {
          const picked = await pickDirectory();
          if (picked) {
            setSitePath(picked);
            await loadSite(picked);
          }
        } catch (error) {
          say(`${t('panel.error')}：${error.message}`, 'error');
        }
      }, [loadSite, pickDirectory, say, t]);

      const refreshStatus = useCallback(async () => {
        if (!site) return;
        const value = await run(() => callApi('status', { root: site }));
        if (value) { setSite(value.root); setStatus(value); }
      }, [run, site]);

      const listArticles = useCallback(async () => {
        if (!site) return;
        const value = await run(() => callApi('articles', { root: site, kind: listKind, query }));
        if (value) setListRows(value.articles ?? []);
      }, [listKind, query, run, site]);

      const fillFrontmatter = useCallback((data) => {
        setFmTitle(data.title ?? '');
        setFmDraft(data.draft === true);
        setFmTags(Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags ?? ''));
        setFmCategories(Array.isArray(data.categories) ? data.categories.join(', ') : (data.categories ?? ''));
        setFmDate(data.date ?? '');
        setFmPublishDate(data.publishDate ?? '');
        setFmExpiryDate(data.expiryDate ?? '');
        setFmSlug(data.slug ?? '');
      }, []);

      const loadArticle = useCallback(async (file) => {
        if (!site || !file) return;
        setEditPath(file);
        const value = await run(() => callApi('read-article', { root: site, path: file }));
        if (value) { fillFrontmatter(value.data ?? {}); setBody(value.body ?? ''); }
      }, [fillFrontmatter, run, site]);

      const createArticle = useCallback(async () => {
        if (!site || !newPath.trim()) return;
        const value = await run(() => callApi('new-content', { root: site, path: newPath.trim() }), t('panel.ok'));
        if (value?.file) { await loadArticle(value.file); await refreshStatus(); }
      }, [loadArticle, newPath, refreshStatus, run, site, t]);

      const createBundle = useCallback(async () => {
        if (!site || !newPath.trim()) return;
        const dir = newPath.trim().replace(/\.md$/, '').replace(/\/index$/, '');
        const value = await run(() => callApi('new-pagebundle', { root: site, dir }), t('panel.ok'));
        if (value?.file) { setEditPath(value.file); await refreshStatus(); }
      }, [newPath, refreshStatus, run, site, t]);

      const loadFrontmatter = useCallback(async () => {
        if (!site || !editPath.trim()) return;
        const value = await run(() => callApi('read-article', { root: site, path: editPath.trim() }));
        if (value) { fillFrontmatter(value.data ?? {}); setBody(value.body ?? ''); }
      }, [editPath, fillFrontmatter, run, site]);

      const saveFrontmatter = useCallback(async () => {
        if (!site || !editPath.trim()) return;
        const patch = {
          title: fmTitle,
          draft: fmDraft,
          tags: fmTags.split(',').map((s) => s.trim()).filter(Boolean),
          categories: fmCategories.split(',').map((s) => s.trim()).filter(Boolean),
          date: fmDate || undefined,
          publishDate: fmPublishDate || undefined,
          expiryDate: fmExpiryDate || undefined,
          slug: fmSlug || undefined,
        };
        const value = await run(() => callApi('save-article', { root: site, path: editPath.trim(), data: patch, body }), t('panel.ok'));
        if (value) { fillFrontmatter(value.data ?? {}); await refreshStatus(); }
      }, [body, editPath, fillFrontmatter, fmCategories, fmDate, fmDraft, fmExpiryDate, fmPublishDate, fmSlug, fmTags, fmTitle, refreshStatus, run, site, t]);

      const wrapSelection = useCallback((before, after, placeholder) => {
        const el = bodyRef.current;
        if (!el) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        const selected = body.slice(start, end) || placeholder;
        const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
        setBody(next);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(start + before.length, start + before.length + selected.length);
        });
      }, [body]);

      const insertImage = useCallback(async (file) => {
        if (!site || !editPath.trim() || !file) return;
        const buffer = await file.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
        const dataBase64 = window.btoa(binary);
        const value = await run(() => callApi('insert-image', {
          root: site, path: editPath.trim(), name: file.name, dataBase64,
        }), t('panel.ok'));
        if (value?.markdown) setBody((prev) => `${prev}\n\n${value.markdown}\n`);
      }, [editPath, run, site, t]);

      const runCheck = useCallback(async () => {
        if (!site) return;
        const value = await run(() => callApi('check', { root: site }));
        if (value) setCheckItems(value.items ?? []);
      }, [run, site]);

      const build = useCallback(async () => {
        if (!site) return;
        const value = await run(() => callApi('build', { root: site }));
        if (value) {
          say(value.ok
            ? `${t('build.ok')}（${value.outputFiles} 个产物，${value.durationMs}ms）`
            : `${t('build.fail')}：${(value.logTail || '').slice(-300)}`, value.ok ? 'ok' : 'error');
          await refreshStatus();
        }
      }, [refreshStatus, run, say, site, t]);

      const publish = useCallback(async () => {
        if (!site) return;
        if (!confirming) { setConfirming(true); return; }
        setConfirming(false);
        const value = await run(() => callApi('publish', { root: site, confirm: true }));
        if (value) { say(`${t('build.published')}：${value.commitSha || ''}`, 'ok'); await refreshStatus(); }
      }, [confirming, refreshStatus, run, say, site, t]);

      const statusText = status
        ? `${t('status.branch')} ${status.branch || '?'} · ${t('status.drafts')} ${status.drafts?.length ?? 0} · ${status.clean ? t('status.clean') : t('status.dirty')}${status.files?.length ? `（${status.files.length}）` : ''}`
        : t('site.placeholder');

      return h('div', { style: styles.page, 'data-testid': 'hugo-panel' },
        h('div', { style: { fontSize: 16, fontWeight: 700 } }, t('panel.title')),

        h(Section, { title: t('site.title') },
          h('div', { style: styles.row },
            h('input', {
              style: styles.input, value: sitePath, placeholder: t('site.placeholder'),
              onChange: (e) => setSitePath(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter') loadSite(); },
            }),
            h('button', { style: styles.button, disabled: busy, onClick: chooseDirectory }, t('site.choose')),
            h('button', { style: { ...styles.button, ...styles.buttonPrimary }, disabled: busy, onClick: () => loadSite() }, t('site.load')),
          ),
          site ? h('div', { style: { ...styles.muted, ...styles.mono } }, site) : null,
        ),

        site ? h(Section, { title: t('status.title') },
          h('div', { style: styles.row },
            h('span', { style: styles.muted }, statusText),
            h('button', { style: styles.button, disabled: busy, onClick: refreshStatus }, t('status.refresh')),
          ),
          status?.files?.length
            ? h('div', { style: styles.list }, status.files.map((f) => h('div', { key: f, style: styles.mono }, f)))
            : null,
          status?.draftsError ? h('div', { style: styles.error }, status.draftsError) : null,
        ) : null,

        site ? h(Section, { title: t('list.title') },
          h('div', { style: styles.row },
            h('select', {
              style: styles.input, value: listKind, onChange: (e) => setListKind(e.target.value),
            },
              ['drafts', 'future', 'expired', 'all', 'published'].map((k) => h('option', { key: k, value: k }, t(`list.${k}`))),
            ),
            h('button', { style: styles.button, disabled: busy, onClick: listArticles }, t('list.load')),
          ),
          h('input', {
            style: styles.input, value: query, placeholder: t('articles.search'),
            onChange: (e) => setQuery(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') listArticles(); },
          }),
          listRows.length
            ? h('div', { style: styles.list }, listRows.map((a) => h('div', {
                key: a.file, style: { ...styles.mono, cursor: 'pointer', padding: '2px 0' },
                onClick: () => { setEditPath(a.file); loadArticle(a.file); },
              }, `${a.draft ? '📝 ' : ''}${a.title || a.file} · ${a.date?.slice(0, 10) || ''}`)))
            : h('div', { style: styles.muted }, t('articles.empty')),
        ) : null,

        site ? h(Section, { title: t('new.title') },
          h('div', { style: styles.row },
            h('input', {
              style: styles.input, value: newPath, placeholder: t('new.path'),
              onChange: (e) => setNewPath(e.target.value),
            }),
            h('button', { style: { ...styles.button, ...styles.buttonPrimary }, disabled: busy, onClick: createArticle }, t('new.create')),
            h('button', { style: styles.button, disabled: busy, onClick: createBundle }, t('new.bundle')),
          ),
        ) : null,

        site ? h(Section, { title: t('edit.title') },
          h('div', { style: styles.row },
            h('input', {
              style: styles.input, value: editPath, placeholder: t('edit.path'),
              onChange: (e) => setEditPath(e.target.value),
            }),
            h('button', { style: styles.button, disabled: busy, onClick: loadFrontmatter }, t('edit.load')),
            h('button', { style: { ...styles.button, ...styles.buttonPrimary }, disabled: busy, onClick: saveFrontmatter }, t('edit.save')),
          ),
          h('label', { style: styles.label }, t('edit.titleField'),
            h('input', { style: styles.input, value: fmTitle, onChange: (e) => setFmTitle(e.target.value) })),
          h('div', { style: styles.row },
            h('label', { style: styles.check },
              h('input', { type: 'checkbox', checked: fmDraft, onChange: (e) => setFmDraft(e.target.checked) }),
              t('edit.draft')),
            h('label', { style: { ...styles.label, flex: '1 1 160px' } }, t('edit.slug'),
              h('input', { style: styles.input, value: fmSlug, onChange: (e) => setFmSlug(e.target.value) })),
          ),
          h('label', { style: styles.label }, t('edit.tags'),
            h('input', { style: styles.input, value: fmTags, onChange: (e) => setFmTags(e.target.value) })),
          h('label', { style: styles.label }, t('edit.categories'),
            h('input', { style: styles.input, value: fmCategories, onChange: (e) => setFmCategories(e.target.value) })),
          h('div', { style: styles.row },
            h('label', { style: { ...styles.label, flex: '1 1 140px' } }, t('edit.date'),
              h('input', { style: styles.input, value: fmDate, placeholder: '2026-11-05', onChange: (e) => setFmDate(e.target.value) })),
            h('label', { style: { ...styles.label, flex: '1 1 140px' } }, t('edit.publishDate'),
              h('input', { style: styles.input, value: fmPublishDate, placeholder: '2026-11-05', onChange: (e) => setFmPublishDate(e.target.value) })),
            h('label', { style: { ...styles.label, flex: '1 1 140px' } }, t('edit.expiryDate'),
              h('input', { style: styles.input, value: fmExpiryDate, placeholder: '2026-11-05', onChange: (e) => setFmExpiryDate(e.target.value) })),
          ),
          h('label', { style: styles.label }, t('editor.body'),
            h('div', { style: styles.row },
              h('button', { style: styles.button, type: 'button', onClick: () => wrapSelection('**', '**', '加粗文字') }, t('editor.bold')),
              h('button', { style: styles.button, type: 'button', onClick: () => wrapSelection('## ', '', '小标题') }, t('editor.heading')),
              h('button', { style: styles.button, type: 'button', onClick: () => wrapSelection('- ', '', '列表项') }, t('editor.list')),
              h('button', { style: styles.button, type: 'button', onClick: () => wrapSelection('[', '](https://)', '链接文字') }, t('editor.link')),
              h('label', { style: styles.button },
                t('editor.insertImage'),
                h('input', {
                  type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml', style: { display: 'none' },
                  onChange: (e) => insertImage(e.target.files?.[0]),
                })),
            ),
            h('textarea', {
              ref: bodyRef, style: { ...styles.input, minHeight: 220, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.6 },
              value: body, onChange: (e) => setBody(e.target.value),
            })),
        ) : null,

        site ? h(Section, { title: t('check.title') },
          h('div', { style: styles.row },
            h('button', { style: styles.button, disabled: busy, onClick: runCheck }, t('check.run')),
          ),
          checkItems.length
            ? h('div', { style: styles.list }, checkItems.map((item) => h('div', { key: item.name, style: item.ok ? styles.ok : styles.error },
                `${item.ok ? '✓' : '✗'} ${item.name}：${item.detail}`)))
            : null,
        ) : null,

        site ? h(Section, { title: t('maint.title') },
          h('div', { style: styles.muted }, t('maint.hint')),
        ) : null,

        site ? h(Section, { title: t('build.title') },
          h('div', { style: styles.row },
            h('button', { style: styles.button, disabled: busy, onClick: build }, t('build.check')),
            confirming
              ? [
                  h('button', { key: 'yes', style: { ...styles.button, ...styles.buttonDanger }, disabled: busy, onClick: publish }, t('build.confirmPublish')),
                  h('button', { key: 'no', style: styles.button, disabled: busy, onClick: () => setConfirming(false) }, t('build.cancel')),
                ]
              : h('button', { style: { ...styles.button, ...styles.buttonPrimary }, disabled: busy, onClick: publish }, t('build.publish')),
          ),
        ) : null,

        busy ? h('div', { style: styles.muted }, t('panel.loading')) : null,
        message ? h('div', { style: messageKind === 'error' ? styles.error : messageKind === 'ok' ? styles.ok : styles.muted }, message) : null,
      );
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', ZH), 'hugo-blog: locale zh');
        ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'hugo-blog: locale en');
        const t = ctx.locale.bind(NS);
        const pickDirectory = typeof ctx.uiWorkspace?.pickDirectory === 'function'
          ? () => ctx.uiWorkspace.pickDirectory()
          : undefined;

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 10, label: () => t('panel.title'), locale: NS },
            (props) => h(HugoIcon, { size: props?.size }),
          ),
        );
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            { name: 'main', key: PANEL_ID, locale: NS },
            (props) => h(HugoPanel, { ...props, t, pickDirectory }),
          ),
        );
      },
    };
  },
});
