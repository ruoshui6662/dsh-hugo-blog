---
name: hugo-blog
description: 在 Hugo 站点内写作、检查构建、管理清单并发布推送博客内容。
whenToUse: 当会话位于 Hugo 站点（hugo 配置 + content/）且需要新建内容、改 front matter、构建检查或发布时。
---

# Hugo Blog

在 Hugo 站点内用本包工具写作与发布：

- `hugo_new_content`：新建一篇内容（hugo new content）。
- `hugo_edit_frontmatter`：修改 front matter 元信息。
- `hugo_new_pagebundle`：新建 page bundle（index.md，draft:true）。
- `hugo_build_check`：跑 hugo build --gc --minify 验收；dry_run 只检查二进制与站点根。
- `hugo_list`：列出 drafts/future/expired/all/published 清单。
- `hugo_publish`：门禁（git 干净）→ 构建 → add → commit → push；会产生 git 写操作，宿主策略可要求审批。
- `git_status_summary`：查看分支、ahead/behind 与未提交文件。

不在 Hugo 站点内时工具返回结构化拒绝，不抛异常。发布前先跑 build_check 与 git_status_summary。
