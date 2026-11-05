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
