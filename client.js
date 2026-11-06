/**
 * Hugo 博客管理面板（浏览器半）。
 *
 * 双页面结构（参考 quiet-md 的 Home + 编辑器分离）：
 *  - 管理页：左侧文件树 + 右侧文章卡片网格，顶部站点选择、搜索、排序、
 *    同步状态与发布入口。
 *  - 编辑页：独立的专业 Markdown 编辑器（工具栏 + 元数据栏 + 大编辑区）。
 * 所有执行都在 Host 的 /api/hugo-blog/* 路由内完成。
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
      'site.title': '站点目录',
      'site.choose': '选择目录…',
      'site.load': '载入站点',
      'site.placeholder': '输入 Hugo 站点根目录，如 /Users/me/blog',
      'site.pickUnsupported': '当前环境不支持目录选择，请手动输入路径',
      'site.loaded': '已载入',
      'manage.title': '文章管理',
      'manage.search': '搜索文章…',
      'manage.new': '写新文章',
      'manage.refresh': '刷新',
      'manage.sync': '同步状态',
      'manage.grid': '卡片',
      'manage.list': '列表',
      'manage.sortDate': '按日期',
      'manage.sortTitle': '按标题',
      'manage.empty': '还没有文章，点「写新文章」开始。',
      'manage.branch': '分支',
      'manage.drafts': '草稿',
      'manage.clean': '干净',
      'manage.dirty': '有改动',
      'manage.ahead': '领先',
      'manage.behind': '落后',
      'editor.back': '← 返回管理',
      'editor.save': '保存',
      'editor.check': '检查',
      'editor.publish': '发布',
      'editor.confirmPublish': '确认发布？',
      'editor.cancel': '取消',
      'editor.title': '标题',
      'editor.draft': '草稿',
      'editor.tags': '标签（逗号分隔）',
      'editor.categories': '分类（逗号分隔）',
      'editor.date': '日期',
      'editor.publishDate': '定时发布',
      'editor.expiryDate': '过期下架',
      'editor.slug': 'Slug',
      'editor.body': '正文（Markdown）',
      'editor.insertImage': '插入图片',
      'editor.bold': '加粗',
      'editor.heading': '标题',
      'editor.list': '列表',
      'editor.link': '链接',
      'editor.newPath': 'content 相对路径，如 posts/hello.md',
      'check.pass': '通过',
      'check.fail': '未通过',
      'panel.loading': '处理中…',
      'panel.error': '出错',
      'panel.ok': '完成',
    };
    const EN = {
      'panel.title': 'Hugo Blog',
      'site.title': 'Site directory',
      'site.choose': 'Choose directory…',
      'site.load': 'Load site',
      'site.placeholder': 'Hugo site root, e.g. /Users/me/blog',
      'site.pickUnsupported': 'Directory picker unavailable here; type the path manually',
      'site.loaded': 'Loaded',
      'manage.title': 'Articles',
      'manage.search': 'Search articles…',
      'manage.new': 'New article',
      'manage.refresh': 'Refresh',
      'manage.sync': 'Sync status',
      'manage.grid': 'Grid',
      'manage.list': 'List',
      'manage.sortDate': 'By date',
      'manage.sortTitle': 'By title',
      'manage.empty': 'No articles yet. Click New article.',
      'manage.branch': 'branch',
      'manage.drafts': 'drafts',
      'manage.clean': 'clean',
      'manage.dirty': 'dirty',
      'manage.ahead': 'ahead',
      'manage.behind': 'behind',
      'editor.back': '← Back',
      'editor.save': 'Save',
      'editor.check': 'Check',
      'editor.publish': 'Publish',
      'editor.confirmPublish': 'Confirm publish?',
      'editor.cancel': 'Cancel',
      'editor.title': 'Title',
      'editor.draft': 'Draft',
      'editor.tags': 'Tags (comma separated)',
      'editor.categories': 'Categories (comma separated)',
      'editor.date': 'Date',
      'editor.publishDate': 'Publish date',
      'editor.expiryDate': 'Expiry date',
      'editor.slug': 'Slug',
      'editor.body': 'Body (Markdown)',
      'editor.insertImage': 'Insert image',
      'editor.bold': 'Bold',
      'editor.heading': 'Heading',
      'editor.list': 'List',
      'editor.link': 'Link',
      'editor.newPath': 'Path under content/, e.g. posts/hello.md',
      'check.pass': 'Pass',
      'check.fail': 'Fail',
      'panel.loading': 'Working…',
      'panel.error': 'Error',
      'panel.ok': 'Done',
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
        display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box',
        color: 'var(--dsw-alias-label-primary)', fontSize: 13, fontFamily: 'inherit',
      },
      header: {
        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)', flexWrap: 'wrap',
      },
      title: { fontSize: 16, fontWeight: 700, marginRight: 8 },
      body: { flex: '1 1 auto', display: 'flex', minHeight: 0 },
      sidebar: {
        width: 240, flexNone: 'none', borderRight: '1px solid var(--dsw-alias-border-l1)',
        overflowY: 'auto', padding: '10px 8px', background: 'var(--dsw-alias-bg-base)',
      },
      content: { flex: '1 1 auto', overflowY: 'auto', padding: 16, minWidth: 0 },
      treeRow: {
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7,
        cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden',
      },
      treeRowActive: { background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))' },
      cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
      card: {
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12,
        background: 'var(--dsw-alias-bg-layer-1)', padding: '12px 14px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 6, minHeight: 90,
      },
      cardTitle: { fontWeight: 600, fontSize: 13.5 },
      meta: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' },
      badge: {
        display: 'inline-flex', padding: '1px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 600,
        border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-secondary)',
      },
      button: {
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
        color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, cursor: 'pointer',
        lineHeight: 1.5, fontFamily: 'inherit', whiteSpace: 'nowrap',
      },
      buttonPrimary: {
        border: '1px solid transparent', background: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-label-primary-inverted, #1b1b1b)', fontWeight: 600,
      },
      buttonDanger: {
        border: '1px solid var(--dsw-alias-state-error-primary)',
        color: 'var(--dsw-alias-state-error-primary)',
      },
      input: {
        flex: '1 1 auto', minWidth: 0, padding: '7px 10px', borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
      },
      select: {
        padding: '6px 8px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)',
        fontSize: 12.5, fontFamily: 'inherit',
      },
      label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      muted: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
      error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 },
      ok: { color: 'var(--dsw-alias-label-primary)', fontSize: 12 },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, wordBreak: 'break-all' },
      bar: {
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', flexWrap: 'wrap',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      editorWrap: { flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '14px 20px', gap: 10, overflowY: 'auto' },
      editorArea: {
        flex: '1 1 auto', minHeight: 300, padding: '12px 14px', borderRadius: 10, resize: 'vertical',
        border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)', fontSize: 13.5, lineHeight: 1.7,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', outline: 'none',
      },
      metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 },
      checkRow: { display: 'flex', gap: 8, fontSize: 12.5, padding: '3px 0' },
    };

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
      const [view, setView] = useState('manage');
      const [sitePath, setSitePath] = useState(() => {
        try { return window.localStorage?.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
      });
      const [site, setSite] = useState(null);
      const [status, setStatus] = useState(null);
      const [tree, setTree] = useState([]);
      const [articles, setArticles] = useState([]);
      const [query, setQuery] = useState('');
      const [kind, setKind] = useState('all');
      const [layout, setLayout] = useState('grid');
      const [sort, setSort] = useState('date');
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState('');
      const [messageKind, setMessageKind] = useState('muted');
      const [newPath, setNewPath] = useState('posts/');
      const [newOpen, setNewOpen] = useState(false);

      const say = useCallback((text, k = 'muted') => { setMessage(text); setMessageKind(k); }, []);

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

      const refreshAll = useCallback(async (root) => {
        const [st, tr, arts] = await Promise.all([
          callApi('status', { root }),
          callApi('tree', { root }),
          callApi('articles', { root, kind, query }),
        ]);
        setSite(st.root);
        setStatus(st);
        setTree(tr.nodes ?? []);
        setArticles(arts.articles ?? []);
        try { window.localStorage?.setItem(STORAGE_KEY, st.root); } catch { /* 忽略 */ }
      }, [kind, query]);

      const loadSite = useCallback(async (root) => {
        await run(() => refreshAll(root || sitePath));
      }, [refreshAll, run, sitePath]);

      useEffect(() => {
        if (sitePath) loadSite(sitePath);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const chooseDirectory = useCallback(async () => {
        if (typeof pickDirectory !== 'function') { say(t('site.pickUnsupported'), 'error'); return; }
        try {
          const picked = await pickDirectory();
          if (picked) { setSitePath(picked); await loadSite(picked); }
        } catch (error) {
          say(`${t('panel.error')}：${error.message}`, 'error');
        }
      }, [loadSite, pickDirectory, say, t]);

      const [editing, setEditing] = useState(null);
      const openArticle = useCallback((file) => {
        setEditing(file);
        setView('editor');
      }, []);

      const createArticle = useCallback(async () => {
        if (!site || !newPath.trim()) return;
        const value = await run(() => callApi('new-content', { root: site, path: newPath.trim() }), t('panel.ok'));
        if (value?.file) { setNewOpen(false); await run(() => refreshAll(site)); openArticle(value.file); }
      }, [newPath, openArticle, refreshAll, run, site, t]);

      const createBundle = useCallback(async () => {
        if (!site || !newPath.trim()) return;
        const dir = newPath.trim().replace(/\.md$/, '').replace(/\/index$/, '');
        const value = await run(() => callApi('new-pagebundle', { root: site, dir }), t('panel.ok'));
        if (value?.file) { setNewOpen(false); await run(() => refreshAll(site)); openArticle(value.file); }
      }, [newPath, openArticle, refreshAll, run, site, t]);

      const sortedArticles = [...articles].sort((a, b) => sort === 'title'
        ? (a.title || a.file).localeCompare(b.title || b.file)
        : String(b.date).localeCompare(String(a.date)));

      const syncText = status
        ? `${t('manage.branch')} ${status.branch || '?'} · ${status.ahead >= 0 ? `${t('manage.ahead')} ${status.ahead}` : ''} ${status.behind >= 0 ? `${t('manage.behind')} ${status.behind}` : ''} · ${status.clean ? t('manage.clean') : `${t('manage.dirty')}（${status.files?.length ?? 0}）`} · ${t('manage.drafts')} ${status.drafts?.length ?? 0}`
        : '';

      if (view === 'editor') {
        return h(EditorPage, {
          t, site, file: editing, run, say, busy, message, messageKind, refreshAll,
          onBack: () => { setView('manage'); run(() => refreshAll(site)); },
        });
      }

      return h('div', { style: styles.page, 'data-testid': 'hugo-panel' },
        h('div', { style: styles.header },
          h('span', { style: styles.title }, t('panel.title')),
          h('input', {
            style: { ...styles.input, maxWidth: 420 }, value: sitePath, placeholder: t('site.placeholder'),
            onChange: (e) => setSitePath(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') loadSite(); },
          }),
          h('button', { style: styles.button, disabled: busy, onClick: chooseDirectory }, t('site.choose')),
          h('button', { style: { ...styles.button, ...styles.buttonPrimary }, disabled: busy, onClick: () => loadSite() }, t('site.load')),
          site ? h('span', { style: styles.muted }, syncText) : null,
          h('button', { style: styles.button, disabled: busy || !site, onClick: () => run(() => refreshAll(site)) }, t('manage.refresh')),
        ),

        site ? h('div', { style: styles.body },
          h('div', { style: styles.sidebar },
            tree.map((node) => h('div', {
              key: node.path,
              style: {
                ...styles.treeRow,
                paddingLeft: 8 + node.depth * 14,
                fontWeight: node.dir ? 600 : 400,
                color: node.dir ? 'var(--dsw-alias-label-secondary)' : undefined,
              },
              onClick: () => { if (!node.dir) openArticle(node.path); },
            }, node.dir ? `📁 ${node.path}` : `📄 ${node.path.split('/').pop()}`)),
          ),
          h('div', { style: styles.content },
            h('div', { style: { ...styles.header, padding: '0 0 12px', borderBottom: 'none' } },
              h('span', { style: styles.title }, t('manage.title')),
              h('input', {
                style: { ...styles.input, maxWidth: 240 }, value: query, placeholder: t('manage.search'),
                onChange: (e) => setQuery(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') run(() => refreshAll(site)); },
              }),
              h('select', {
                style: styles.select, value: kind, onChange: (e) => { setKind(e.target.value); },
              }, ['all', 'drafts', 'future', 'expired', 'published'].map((k) => h('option', { key: k, value: k }, k))),
              h('select', {
                style: styles.select, value: sort, onChange: (e) => setSort(e.target.value),
              },
                h('option', { value: 'date' }, t('manage.sortDate')),
                h('option', { value: 'title' }, t('manage.sortTitle')),
              ),
              h('button', {
                style: { ...styles.button, background: layout === 'grid' ? 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))' : undefined },
                onClick: () => setLayout('grid'),
              }, t('manage.grid')),
              h('button', {
                style: { ...styles.button, background: layout === 'list' ? 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))' : undefined },
                onClick: () => setLayout('list'),
              }, t('manage.list')),
              h('button', { style: { ...styles.button, ...styles.buttonPrimary }, disabled: busy, onClick: () => setNewOpen(true) }, t('manage.new')),
            ),
            newOpen ? h('div', {
              style: {
                border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, padding: 12,
                marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
              },
            },
              h('input', {
                style: { ...styles.input, maxWidth: 320 }, value: newPath, placeholder: t('editor.newPath'),
                onChange: (e) => setNewPath(e.target.value),
              }),
              h('button', { style: { ...styles.button, ...styles.buttonPrimary }, disabled: busy, onClick: createArticle }, t('editor.save')),
              h('button', { style: styles.button, disabled: busy, onClick: createBundle }, 'Page Bundle'),
              h('button', { style: styles.button, onClick: () => setNewOpen(false) }, '✕'),
            ) : null,
            sortedArticles.length
              ? (layout === 'grid'
                  ? h('div', { style: styles.cardGrid }, sortedArticles.map((a) => h('div', {
                      key: a.file, style: styles.card, onClick: () => openArticle(a.file),
                    },
                      h('div', { style: styles.cardTitle }, a.title || a.file),
                      h('div', { style: styles.meta }, `${a.date?.slice(0, 10) || ''} · ${a.file}`),
                      h('div', { style: styles.row }, a.draft ? h('span', { style: styles.badge }, t('manage.drafts')) : null,
                        (a.tags ?? []).map((tag) => h('span', { key: tag, style: styles.badge }, tag))),
                    )))
                  : h('div', {}, sortedArticles.map((a) => h('div', {
                      key: a.file, style: styles.treeRow, onClick: () => openArticle(a.file),
                    }, `${a.draft ? '📝 ' : ''}${a.title || a.file} · ${a.date?.slice(0, 10) || ''} · ${a.file}`))))
              : h('div', { style: styles.muted }, t('manage.empty')),
          ),
        ) : h('div', { style: { ...styles.content, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          h('div', { style: styles.muted }, t('site.placeholder'))),
      );
    }

    function EditorPage({ t, site, file: initialFile, run, say, busy, message, messageKind, refreshAll, onBack }) {
      const [file] = useState(initialFile ?? '');
      const [fmTitle, setFmTitle] = useState('');
      const [fmDraft, setFmDraft] = useState(true);
      const [fmTags, setFmTags] = useState('');
      const [fmCategories, setFmCategories] = useState('');
      const [fmDate, setFmDate] = useState('');
      const [fmPublishDate, setFmPublishDate] = useState('');
      const [fmExpiryDate, setFmExpiryDate] = useState('');
      const [fmSlug, setFmSlug] = useState('');
      const [body, setBody] = useState('');
      const [checkItems, setCheckItems] = useState([]);
      const [confirming, setConfirming] = useState(false);
      const bodyRef = useRef(null);

      const fill = useCallback((data) => {
        setFmTitle(data.title ?? '');
        setFmDraft(data.draft === true);
        setFmTags(Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags ?? ''));
        setFmCategories(Array.isArray(data.categories) ? data.categories.join(', ') : (data.categories ?? ''));
        setFmDate(data.date ?? '');
        setFmPublishDate(data.publishDate ?? '');
        setFmExpiryDate(data.expiryDate ?? '');
        setFmSlug(data.slug ?? '');
      }, []);

      const load = useCallback(async (target) => {
        const value = await run(() => callApi('read-article', { root: site, path: target }));
        if (value) { fill(value.data ?? {}); setBody(value.body ?? ''); }
      }, [fill, run, site]);

      useEffect(() => {
        if (file) load(file);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const save = useCallback(async () => {
        if (!file) return;
        const patch = {
          title: fmTitle, draft: fmDraft,
          tags: fmTags.split(',').map((s) => s.trim()).filter(Boolean),
          categories: fmCategories.split(',').map((s) => s.trim()).filter(Boolean),
          date: fmDate || undefined, publishDate: fmPublishDate || undefined,
          expiryDate: fmExpiryDate || undefined, slug: fmSlug || undefined,
        };
        const value = await run(() => callApi('save-article', { root: site, path: file, data: patch, body }), t('panel.ok'));
        if (value) fill(value.data ?? {});
      }, [body, file, fill, fmCategories, fmDate, fmDraft, fmExpiryDate, fmPublishDate, fmSlug, fmTags, fmTitle, run, site, t]);

      const wrapSelection = useCallback((before, after, placeholder) => {
        const el = bodyRef.current;
        if (!el) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        const selected = body.slice(start, end) || placeholder;
        setBody(`${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(start + before.length, start + before.length + selected.length);
        });
      }, [body]);

      const insertImage = useCallback(async (imgFile) => {
        if (!file || !imgFile) return;
        const buffer = await imgFile.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
        const value = await run(() => callApi('insert-image', {
          root: site, path: file, name: imgFile.name, dataBase64: window.btoa(binary),
        }), t('panel.ok'));
        if (value?.markdown) setBody((prev) => `${prev}\n\n${value.markdown}\n`);
      }, [file, run, site, t]);

      const runCheck = useCallback(async () => {
        const value = await run(() => callApi('check', { root: site }));
        if (value) setCheckItems(value.items ?? []);
      }, [run, site]);

      const publish = useCallback(async () => {
        if (!confirming) { setConfirming(true); return; }
        setConfirming(false);
        const value = await run(() => callApi('publish', { root: site, confirm: true }));
        if (value) { say(`${t('editor.publish')}：${value.commitSha || ''}`, 'ok'); await refreshAll(site); }
      }, [confirming, refreshAll, run, say, site, t]);

      return h('div', { style: styles.page, 'data-testid': 'hugo-editor' },
        h('div', { style: styles.bar },
          h('button', { style: styles.button, onClick: onBack }, t('editor.back')),
          h('span', { style: { ...styles.mono, flex: '1 1 auto' } }, file),
          h('button', { style: styles.button, disabled: busy, onClick: runCheck }, t('editor.check')),
          h('button', { style: { ...styles.button, ...styles.buttonPrimary }, disabled: busy, onClick: save }, t('editor.save')),
          confirming
            ? [
                h('button', { key: 'yes', style: { ...styles.button, ...styles.buttonDanger }, disabled: busy, onClick: publish }, t('editor.confirmPublish')),
                h('button', { key: 'no', style: styles.button, disabled: busy, onClick: () => setConfirming(false) }, t('editor.cancel')),
              ]
            : h('button', { style: { ...styles.button, ...styles.buttonPrimary }, disabled: busy, onClick: publish }, t('editor.publish')),
        ),
        h('div', { style: styles.editorWrap },
          h('input', {
            style: { ...styles.input, fontSize: 18, fontWeight: 600, padding: '10px 12px' },
            value: fmTitle, placeholder: t('editor.title'), onChange: (e) => setFmTitle(e.target.value),
          }),
          h('div', { style: styles.metaGrid },
            h('label', { style: styles.label }, t('editor.date'),
              h('input', { style: styles.input, value: fmDate, placeholder: '2026-11-05', onChange: (e) => setFmDate(e.target.value) })),
            h('label', { style: styles.label }, t('editor.publishDate'),
              h('input', { style: styles.input, value: fmPublishDate, placeholder: '2026-11-05', onChange: (e) => setFmPublishDate(e.target.value) })),
            h('label', { style: styles.label }, t('editor.expiryDate'),
              h('input', { style: styles.input, value: fmExpiryDate, placeholder: '2026-11-05', onChange: (e) => setFmExpiryDate(e.target.value) })),
            h('label', { style: styles.label }, t('editor.slug'),
              h('input', { style: styles.input, value: fmSlug, onChange: (e) => setFmSlug(e.target.value) })),
            h('label', { style: styles.label }, t('editor.tags'),
              h('input', { style: styles.input, value: fmTags, onChange: (e) => setFmTags(e.target.value) })),
            h('label', { style: styles.label }, t('editor.categories'),
              h('input', { style: styles.input, value: fmCategories, onChange: (e) => setFmCategories(e.target.value) })),
            h('label', { style: { ...styles.label, flexDirection: 'row', alignItems: 'center', gap: 6 } },
              h('input', { type: 'checkbox', checked: fmDraft, onChange: (e) => setFmDraft(e.target.checked) }),
              t('editor.draft')),
          ),
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
            ref: bodyRef, style: styles.editorArea, value: body,
            onChange: (e) => setBody(e.target.value),
          }),
          checkItems.length
            ? h('div', {}, checkItems.map((item) => h('div', {
                key: item.name, style: item.ok ? styles.ok : styles.error,
              }, `${item.ok ? '✓' : '✗'} ${item.name}：${item.detail}`)))
            : null,
          busy ? h('div', { style: styles.muted }, t('panel.loading')) : null,
          message ? h('div', { style: messageKind === 'error' ? styles.error : messageKind === 'ok' ? styles.ok : styles.muted }, message) : null,
        ),
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
