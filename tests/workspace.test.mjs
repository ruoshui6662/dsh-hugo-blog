import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { findHugoRoot, isHugoWorkspace } from "../lib/workspace.js";

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hugo-ws-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeSite(dir) {
  mkdirSync(join(dir, "content", "posts"), { recursive: true });
  writeFileSync(
    join(dir, "hugo.toml"),
    'baseURL = "https://example.com/"\ntitle = "T"\n',
  );
  writeFileSync(join(dir, "content", "posts", "a.md"), "---\ntitle: A\n---\n\nB\n");
  try {
    execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  } catch {
    /* git optional for workspace detection */
  }
}

describe("findHugoRoot / isHugoWorkspace", () => {
  it("finds the Hugo root of a site directory", async () => {
    makeSite(root);
    assert.equal(await findHugoRoot(root), root);
    assert.equal(await isHugoWorkspace(root), true);
  });

  it("returns undefined for a non-site directory", async () => {
    mkdirSync(join(root, "empty"));
    assert.equal(await findHugoRoot(join(root, "empty")), undefined);
    assert.equal(await isHugoWorkspace(join(root, "empty")), false);
  });

  it("finds the root by walking up from a subdirectory", async () => {
    makeSite(root);
    const sub = join(root, "content", "posts", "deep");
    mkdirSync(sub, { recursive: true });
    assert.equal(await findHugoRoot(sub), root);
    assert.equal(await isHugoWorkspace(sub), true);
  });

  it("accepts hugo.yaml / config.toml variants as site markers", async () => {
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(join(root, "hugo.yaml"), "baseURL: https://example.com/\ntitle: T\n");
    try { execFileSync("git", ["init"], { cwd: root, stdio: "ignore" }); } catch {}
    const found = await findHugoRoot(root);
    assert.equal(found, root);
  });
});
