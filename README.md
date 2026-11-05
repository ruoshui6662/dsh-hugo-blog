# dsh-hugo-blog

Hugo 博客写作、发布、维护与推送工具层：新建内容、检查构建、清单与发布回执。

## 安装

```sh
dsh plugin --profile web add ./dsh-hugo-blog
# 或从 Git / npm 安装本包后，在 cordis 补丁中插入 id=hugo-blog、name=dsh-hugo-blog
```

## 运行时依赖说明

本包**不**声明 `peerDependencies` 硬依赖。运行时由宿主提供 `dsh-tools` / `dsh-skill` 等服务（`ctx.tools.register`、`ctx.skills.registerProvider`）；本包只用 Node 内置模块，零第三方依赖。Node >= 22。

## 可视化面板（侧边栏）

插件在侧边栏注册 **Hugo 博客** 入口，点开后按顺序展开：

1. **站点目录**：点「选择目录…」打开原生目录选择器（或手动输入路径）→「载入站点」；目录须含 `hugo.toml` 等配置与 `content/`（是否已 `git init` 不影响识别，git 状态另行报告）。目录会记住，下次自动载入。
2. **站点状态**：分支、草稿数、工作区是否干净、改动文件列表。
3. **文章列表**：草稿/未来/已过期/全部/已发布切换，点一行填入编辑区。
4. **新建文章**：`posts/hello.md` 形式创建，或新建 Page Bundle。
5. **编辑 Front Matter**：标题、草稿、标签、分类、日期、定时发布、过期下架、Slug；保存回显 lint 结果。
6. **构建与发布**：`hugo build` 检查 + 两步确认发布（构建失败/工作区脏会被拒绝）。

面板只调 Host 的 `/api/hugo-blog/*` 路由，所有 hugo/git 执行都在 Host 内。

## 工具

`hugo_new_content`、`hugo_edit_frontmatter`、`hugo_new_pagebundle`、`hugo_build_check`、`hugo_list`、`hugo_publish`、`git_status_summary`，外加技能 `hugo-blog`。详情见 `docs/DETAIL.md`。

`hugo_publish` 会产生 git 写操作，宿主策略可要求审批。

## 测试

```sh
node --test "tests/*.test.mjs"
node scripts/check-package.mjs
node assets/hugo-blog/scripts/validate_skill.mjs assets/hugo-blog
```

## 已知限制

- 插件按 profile 隔离安装：桌面 GUI 用 `desktop` profile，CLI-headless 用其自己的 profile；装在哪个 profile 只有那个实例可见。
- Hugo 构建缓存须可写（`HUGO_CACHEDIR`），沙箱环境下注意缓存目录权限。
- GitHub Pages 部署默认走「push → Actions」；CI workflow 需在仓库侧自备。
