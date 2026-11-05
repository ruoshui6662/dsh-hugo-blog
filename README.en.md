# dsh-hugo-blog

Hugo blog writing, building, listing, and publishing tool layer for DeepSeek Harness.

Runtime services (`dsh-tools`, `dsh-skill`) are provided by the host; this package declares no `peerDependencies` and uses only Node built-ins. Node >= 22.

Tools: `hugo_new_content`, `hugo_edit_frontmatter`, `hugo_new_pagebundle`, `hugo_build_check`, `hugo_list`, `hugo_publish`, `git_status_summary`. See `docs/DETAIL.md`.
