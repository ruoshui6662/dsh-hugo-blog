import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  cpSync,
  rmSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureSrc = join(here, "..", "test", "fixtures", "hugo-site");

function hasHugo() {
  const r = spawnSync("hugo", ["version"], { encoding: "utf8" });
  return r.status === 0;
}
function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

let site;
let tools;

let itCacheDir;
beforeEach(async () => {
  itCacheDir = mkdtempSync(join(tmpdir(), "hugo-it-cache-"));
  process.env.HUGO_CACHEDIR = itCacheDir;
  site = mkdtempSync(join(tmpdir(), "hugo-it-"));
  cpSync(fixtureSrc, site, { recursive: true });
  git(["init"], site);
  git(["config", "user.email", "test@example.com"], site);
  git(["config", "user.name", "Fixture"], site);
  git(["add", "-A"], site);
  git(["commit", "-m", "fixture"], site);

  const registered = new Map();
  const ctx = {
    cwd: site,
    tools: {
      register: (name, def) => {
        if (typeof name === "object" && name !== null) registered.set(name.name, name);
        else registered.set(name, def);
      },
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    config: {},
  };
  const mod = await import("../lib/index.js");
  await mod.apply(ctx);
  tools = registered;
});

afterEach(() => {
  rmSync(site, { recursive: true, force: true });
  if (itCacheDir) rmSync(itCacheDir, { recursive: true, force: true });
  delete process.env.HUGO_CACHEDIR;
});

function execute(name, args) {
  const def = tools.get(name);
  assert.ok(def, `tool not registered: ${name}`);
  const fn = def.execute ?? def.handler ?? def.run;
  assert.equal(typeof fn, "function", `${name} has no execute`);
  return fn(args ?? {}, { agent: { session: { header: { cwd: site } } } });
}

function textOf(result) {
  if (typeof result === "string") return result;
  return JSON.stringify(result ?? "");
}

describe("integration (real hugo binary)", () => {
  it("hugo_new_content creates a new post, build passes, list shows draft, publish dry-run makes no commit", async (t) => {
    if (!hasHugo()) {
      t.skip("hugo binary not found on PATH");
      return;
    }

    const before = git(["rev-parse", "HEAD"], site).trim();
    const slug = `it-post-${Date.now()}`;

    // 1. create new content
    const created = await execute("hugo_new_content", {
      path: `posts/${slug}.md`,
    });
    assert.ok(!isRefusedResult(created), `new_content refused: ${textOf(created)}`);
    const createdPath = join(site, "content", "posts", `${slug}.md`);
    const altPath = join(site, "content", "posts", slug, "index.md");
    assert.ok(
      existsSync(createdPath) || existsSync(altPath),
      `expected new post file, dir listing: ${readdirSync(join(site, "content", "posts")).join(",")}`,
    );

    // 2. build check passes
    const built = await execute("hugo_build_check", {});
    assert.ok(!isRefusedResult(built), `build_check refused: ${textOf(built)}`);
    assert.ok(
      built?.ok !== false,
      `build_check should succeed: ${textOf(built)}`,
    );

    // 3. list includes drafts
    const listed = await execute("hugo_list", { kind: "drafts" });
    assert.ok(!isRefusedResult(listed), `list refused: ${textOf(listed)}`);
    assert.match(textOf(listed), /draft-note|Draft Note/);

    // 4. publish dry-run creates no commit（先提交新文章，满足发布门禁的干净工作区要求）
    git(["add", "-A"], site);
    git(["commit", "-m", "add integration post"], site);
    const beforePublish = git(["rev-parse", "HEAD"], site).trim();
    const published = await execute("hugo_publish", { dry_run: true });
    assert.ok(!isRefusedResult(published), `publish refused: ${textOf(published)}`);
    const after = git(["rev-parse", "HEAD"], site).trim();
    assert.equal(after, beforePublish, "dry_run publish must not create a commit");
  });
});

function isRefusedResult(r) {
  return r && typeof r === "object" && (r.refused === true || r.ok === false && /refus/i.test(JSON.stringify(r)));
}
