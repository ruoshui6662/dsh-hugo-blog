# dsh-hugo-blog 详情

Hugo 博客写作、发布、维护与推送工具层（DeepSeek Harness 组合包核心工具层，V1）。

## 功能列表

- 在 Hugo 站点内新建内容、编辑 front matter、新建 page bundle。
- 运行 `hugo build --gc --minify` 验收构建，统计 `public/` 产物文件数。
- 列出草稿 / 未来 / 过期 / 全部 / 已发布清单。
- 发布：git 干净门禁 → 构建 → `git add -A` → commit → push；支持 `dry_run` 只检查不写不推。
- 查看 git 分支、ahead/behind 与未提交文件摘要。
- 配置三层合并（包默认 < 用户 < 站点）；工作区门禁（hugo 配置 + `content/`）；front matter 最小解析与 lint。

## 工具表

| 工具 | 参数 | 拒绝条件 |
|---|---|---|
| `hugo_new_content` | `path` 必填，`kind`、`draft` 可选 | 不在 Hugo 站点；`path` 逃逸站点根；目标已存在；`hugo new` 失败 |
| `hugo_edit_frontmatter` | `path` 必填，`patch` 必填（对象） | 不在站点；`path` 逃逸；文件不存在；`patch` 非对象 |
| `hugo_new_pagebundle` | `dir` 必填，`title` 可选 | 不在站点；`dir` 逃逸；`index.md` 已存在 |
| `hugo_build_check` | `dry_run` 可选 | 不在站点；`dry_run` 时 hugo 二进制不可用；构建失败 |
| `hugo_list` | `kind` 必填（drafts/future/expired/all/published） | 不在站点；`kind` 非法；`hugo list` 失败 |
| `hugo_publish` | `message`、`dry_run` 可选 | 不在站点；工作区有未提交改动；构建失败；add/commit/push 失败 |
| `git_status_summary` | 无 | 不在 Hugo 站点；git 命令失败（返回 `ok:false` + error） |

所有拒绝均为结构化返回 `{ok:false, refused:true, reason}`，不抛裸异常。`hugo_publish` 会产生 git 写操作，宿主策略可要求审批（审批由宿主策略钩子处理）。

## 配置三层说明

优先级：包默认 `< $DSH_HOME/hugo-blog/settings.json` `< <root>/.dsh/hugo-blog.json`。缺文件不报错。

| 键 | 默认 | 说明 |
|---|---|---|
| `hugoBin` | `hugo` | Hugo 可执行文件 |
| `contentRoot` | `content` | 内容根目录（相对站点根） |
| `gitRemote` | `origin` | 发布 remote |
| `branch` | `main` | 发布分支 |
| `siteUrl` | — | 站点 URL（可空） |
| `target` | — | 部署 target（可空，V1 未使用） |
| `timeoutMs` | `120000` | Hugo/git 子进程超时 |

## 已知限制

- 依赖系统已安装的 Hugo 与 git 可执行文件；V1 不下载 Hugo。
- Hugo 版本：未在代码中 pin 具体版本，行为以当前 `hugo` 输出为准；`hugo list` 的 kind 集合按当前 Hugo 约定。
- Windows 路径：进程树杀戮在 Windows 用 `taskkill /T /F`，其余平台用进程组 `SIGKILL`；路径分隔符按平台处理，`path` 参数建议用 `/`。
- Actions 轮询（GitHub Actions 部署状态回查）不在 V1。
- Front matter 只做最小解析（title/date/draft/publishDate/expiryDate/tags/categories/aliases/layout/type/slug/url/weight/params 常见值），深层嵌套与多行块只做近似处理。
- 非 git 检出或无 `content/` 的目录不是 Hugo 站点，工具直接拒绝。
