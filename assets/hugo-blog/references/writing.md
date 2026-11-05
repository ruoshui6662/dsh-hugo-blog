# Writing（写作细节）

本文件只供 `hugo-blog` Skill 的写作分支使用；路由与流程见 `SKILL.md`。

## hugo new content 用法

- 新建单页内容：`hugo_new_content`，参数至少含目标路径（相对 `content/`）与 archetype 名称，默认用站点默认 archetype（如 `default`）。
- 新建内容包（带图片/附件）：`hugo_new_pagebundle`，生成 `content/<section>/<slug>/index.md`，资源与正文同目录。
- 工具会按 archetype 生成 front matter 骨架；生成后立刻用 `hugo_edit_frontmatter` 补字段，不要在正文里手写第二份 front matter。
- 路径用小写连字符（如 `posts/my-new-post.md`），避免空格与中文路径；slug 与文件名保持一致。

## Archetype 与 taxonomy

- archetype 位于站点 `archetypes/` 目录；默认 archetype 决定新建文件自带字段。改 archetype 前先确认站点已有的 archetype 名称，不要假设是 `default`。
- taxonomy（`tags` / `categories`）必须在站点配置文件（`hugo.toml` / `config.yaml` 等）中声明后才生效；未声明时 front matter 里写了也不会生成分类页。
- 新增 taxonomy 属于站点配置变更，先向用户确认，再改配置并用 `hugo_build_check` 验证。
- archetype 里已写死的值（如默认分类）新建后仍要用 `hugo_edit_frontmatter` 按文章实际内容覆盖。

## Front matter 常用字段表

| 字段 | 含义 | 备注 |
| --- | --- | --- |
| `title` | 标题 | 必填，展示在列表与页面标题 |
| `date` | 写作/创建日期 | Hugo 排序与 RSS 依赖；用 RFC3339 格式 |
| `draft` | 是否草稿 | `true` 时不发布；发布前改为 `false` |
| `publishDate` | 定时发布时间 | 到点前不公开，用于定时发布 |
| `expiryDate` | 下架时间 | 到点后自动下架，用于定时下架 |
| `aliases` | 旧 URL 别名 | 迁移或改名时保留旧路径 |
| `layout` | 模板覆盖 | 仅特殊页面使用，默认不要设 |
| `params` | 自定义参数 | 放封面图、作者、摘要等站点自定义字段 |

字段类型与格式以站点 archetype 和主题约定为准；不确定时先看同目录已有文章的 front matter。

## Page bundle 约定

- 内容包是目录：`index.md` 为正文，其余图片与附件放同目录，相对路径引用。
- 不要把内容包拆成裸 `.md` 文件散落在 `content/` 根目录；一个主题对应一个 bundle 目录。
- 只有一篇文章、没有资源时用单文件 `hugo_new_content`，不需要 bundle。

## 图片放法

- bundle 内图片放 bundle 目录，用相对路径（如 `![alt](cover.jpg)`），不要用 `static/` 的绝对路径。
- 非 bundle 的单文件文章图片放站点 `static/images/`（或主题约定目录），引用时用站点相对 URL。
- 图片文件名用小写连字符；正文图片必须写 alt 文本。
- 引用前先确认文件已存在，避免断链；巡检清单见 `maintenance.md`。
