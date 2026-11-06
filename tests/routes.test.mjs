import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHugoRoutes } from "../lib/routes.js";

let root;
let handlers;

let cacheDir;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hugo-routes-"));
  cacheDir = mkdtempSync(join(tmpdir(), "hugo-cache-"));
  process.env.HUGO_CACHEDIR = cacheDir;
  mkdirSync(join(root, "content", "posts"), { recursive: true });
  mkdirSync(join(root, "layouts", "_default"), { recursive: true });
  writeFileSync(join(root, "layouts", "_default", "single.html"), "<html></html>");
  writeFileSync(join(root, "layouts", "_default", "list.html"), "<html></html>");
  writeFileSync(join(root, "hugo.toml"), 'baseURL = "https://example.com/"\ntitle = "T"\n');
  writeFileSync(join(root, "content", "posts", "a.md"), "---\ntitle: A\ndraft: true\n---\n\nB\n");
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@e.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "T"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
  handlers = createHugoRoutes({ config: { rootPath: root } });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
  delete process.env.HUGO_CACHEDIR;
});

describe("hugo panel routes", () => {
  it("status 返回分支/干净/草稿数", async () => {
    const res = await (await handlers["/api/hugo-blog/status"]({}, {})).json();
    assert.equal(res.ok, true);
    assert.equal(res.value.root, root);
    assert.equal(res.value.clean, true);
    assert.ok(Array.isArray(res.value.drafts));
    assert.ok(res.value.drafts.length >= 1);
  });

  it("非 Hugo 站点拒绝", async () => {
    const empty = mkdtempSync(join(tmpdir(), "hugo-not-site-"));
    try {
      const res = await (await handlers["/api/hugo-blog/status"]({ root: empty }, {})).json();
      assert.equal(res.ok, false);
      assert.equal(res.error.code, "not-hugo-site");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("publish 未带 confirm 拒绝", async () => {
    const res = await (await handlers["/api/hugo-blog/publish"]({}, {})).json();
    assert.equal(res.ok, false);
    assert.equal(res.error.code, "confirmation-required");
  });

  it("new-content 创建文章，read/edit-frontmatter 可往返", async () => {
    const created = await (await handlers["/api/hugo-blog/new-content"]({ path: "posts/hello.md" }, {})).json();
    assert.equal(created.ok, true);
    assert.equal(created.value.file, "posts/hello.md");

    const read = await (await handlers["/api/hugo-blog/read-frontmatter"]({ path: "posts/hello.md" }, {})).json();
    assert.equal(read.ok, true);
    assert.ok("title" in read.value.data);

    const edited = await (await handlers["/api/hugo-blog/edit-frontmatter"]({
      path: "posts/hello.md",
      patch: { title: "Edited", draft: true, tags: ["a", "b"] },
    }, {})).json();
    assert.equal(edited.ok, true);
    assert.equal(edited.value.data.title, "Edited");
    assert.deepEqual(edited.value.data.tags, ["a", "b"]);
  });

  it("tree 列出内容目录结构", async () => {
    const res = await (await handlers["/api/hugo-blog/tree"]({}, {})).json();
    assert.equal(res.ok, true);
    assert.ok(res.value.nodes.some((n) => n.path === "posts/a.md"));
    assert.ok(res.value.nodes.some((n) => n.dir === true));
  });

  it("cover 无封面返回空，order 保存并生效", async () => {
    const cover = await (await handlers["/api/hugo-blog/cover"]({ path: "posts/a.md" }, {})).json();
    assert.equal(cover.ok, true);
    assert.equal(cover.value.dataUrl, "");

    const ordered = await (await handlers["/api/hugo-blog/order"]({ order: ["posts/a.md"] }, {})).json();
    assert.equal(ordered.ok, true);
    assert.deepEqual(ordered.value.order, ["posts/a.md"]);
  });

  it("articles 列表与搜索、read/save-article 往返", async () => {
    const list = await (await handlers["/api/hugo-blog/articles"]({ kind: "all" }, {})).json();
    assert.equal(list.ok, true);
    assert.ok(list.value.total >= 1);
    assert.ok(list.value.articles[0].file.endsWith(".md"));

    const searched = await (await handlers["/api/hugo-blog/articles"]({ query: "a.md" }, {})).json();
    assert.ok(searched.value.articles.length >= 1);

    const saved = await (await handlers["/api/hugo-blog/save-article"]({
      path: "posts/a.md",
      data: { title: "Renamed" },
      body: "new body\n",
    }, {})).json();
    assert.equal(saved.ok, true);
    assert.equal(saved.value.data.title, "Renamed");

    const read = await (await handlers["/api/hugo-blog/read-article"]({ path: "posts/a.md" }, {})).json();
    assert.equal(read.ok, true);
    assert.equal(read.value.data.title, "Renamed");
    assert.equal(read.value.body, "new body\n");
  });

  it("insert-image 落盘并返回引用，非法后缀拒绝", async () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
    const res = await (await handlers["/api/hugo-blog/insert-image"]({
      path: "posts/a.md", name: "pic.png", dataBase64: png,
    }, {})).json();
    assert.equal(res.ok, true);
    assert.equal(res.value.image, "images/pic.png");
    assert.equal(res.value.markdown, "![pic](images/pic.png)");

    const bad = await (await handlers["/api/hugo-blog/insert-image"]({
      path: "posts/a.md", name: "x.exe", dataBase64: png,
    }, {})).json();
    assert.equal(bad.ok, false);
    assert.equal(bad.error.code, "bad-name");
  });

  it("check 清单结构", async () => {
    const res = await (await handlers["/api/hugo-blog/check"]({}, {})).json();
    assert.equal(res.ok, true);
    assert.ok(Array.isArray(res.value.items));
    assert.ok(res.value.items.some((i) => i.name === "build"));
  });

  it("内容路径越界拒绝", async () => {
    const res = await (await handlers["/api/hugo-blog/read-frontmatter"]({ path: "../outside.md" }, {})).json();
    assert.equal(res.ok, false);
    assert.equal(res.error.code, "bad-path");
  });

  it("publish 干净工作区 + 无远端时 push 失败（不抛裸异常）", async () => {
    const res = await (await handlers["/api/hugo-blog/publish"]({ confirm: true }, {})).json();
    assert.equal(res.ok, false);
    assert.equal(res.error.code, "git-push-failed");
  });
});
