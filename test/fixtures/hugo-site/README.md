# Fixture: hugo-site

最小 Hugo 站 fixture，供集成测试使用（见 `tests/integration.test.mjs`）。

- `hugo.toml`：`baseURL` / `title`，声明 `[taxonomies] tag / category`
- `content/posts/welcome.md`：完整 front matter（title/date/draft/tags/categories）
- `content/posts/draft-note.md`：`draft: true`
- `archetypes/default.md`：标准 archetype 模板（含 `{{ .Date }}`）
- `layouts/_default/single.html` / `list.html`：极简模板
- 无 `themes/`：使用 Hugo 内置
- `.gitignore`：`public/`、`resources/_gen/`

> 仅用于测试：集成测试会把本目录复制到临时目录后 `git init` 使用。
> **勿提交 `public/`**（构建产物），已通过 `.gitignore` 排除。
