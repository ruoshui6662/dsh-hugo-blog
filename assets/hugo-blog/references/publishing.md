# Publishing（发布细节）

本文件只供 `hugo-blog` Skill 的发布分支使用；路由与流程见 `SKILL.md`。

## Build gate（构建门）

- `hugo_publish` 的前置是 `hugo_build_check` 通过，未通过禁止发布。
- 构建检查覆盖：front matter 可解析、archetype/taxonomy 引用有效、模板与短代码无错误。
- 构建失败时看日志尾部最后几行定位首个错误，修好后重跑 `hugo_build_check`，不要直接发布。

## Git 顺序

`hugo_publish` 内部按固定顺序执行，不要拆开手工重复：

1. `git add`：只加入本次发布相关的文件（新文章、改动的前端 matter、相关图片），不要 `git add -A` 顺手带入无关改动。
2. `git commit`：提交信息写清动作（如 `post: publish <slug>`），提交前用 `git_status_summary` 核对变更清单。
3. `git push`：推送到当前分支；被拒时先 `pull`（处理冲突）再重推，不要 `--force`。

## GitHub Pages Actions

- 仓库 Pages 的 Source 必须选 **Actions**（不是 “Deploy from a branch”）；用分支部署会与 Hugo 构建产物打架。
- 绝不提交 `public/`：它是构建产物，由 CI 生成；提交它会造成仓库膨胀与产物滞后。
- `.gitignore` 必含 `public/` 与 `resources/_gen/` 两行；提交前先检查 `.gitignore` 存在且这两行未被误删，缺失时先补上再提交。
- Actions 工作流应执行 `hugo` 构建并部署产物；红灯先看 workflow 日志（见下）再重跑，不要改本地构建结果迁就。

## hugo deploy（可选）

- 仅当站点配置了 `[[deployment.targets]]`（如 S3/Cloudflare）时才用 `hugo deploy`；GitHub Pages 部署走 Actions，不用 `hugo deploy`。
- `hugo deploy` 仍需先通过 `hugo_build_check`；部署目标与凭据以站点配置为准，不在 Skill 里硬编码。

## 失败排错

- 构建失败：看 `hugo_build_check` 日志尾，定位首个报错文件与行，修 front matter/模板/短代码后重跑。
- `push` 被拒：先 `git pull` 合并远端更新（有冲突先解冲突），再重跑 `git push`；禁止 `--force`，除非用户明确要求并确认无他人改动。
- Actions 红灯：打开 workflow 日志看失败步骤，再跑 `hugo_build_check` 在本地复现；本地通过但 CI 失败时排查环境差异（Hugo 版本、配置、资源）再重跑 workflow。
- 提交后发现发错：用新的修复提交纠正，不要重写已推送历史。
