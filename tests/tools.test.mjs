import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXPECTED_TOOLS = [
  "hugo_new_content",
  "hugo_edit_frontmatter",
  "hugo_new_pagebundle",
  "hugo_build_check",
  "hugo_list",
  "hugo_publish",
  "git_status_summary",
];

let mod;
let registered;
let tmpEmpty;

function makeCtx(cwd) {
  registered = new Map();
  return {
    cwd,
    tools: {
      register: (name, def) => {
        // Support register(name, def) and register(def with .name)
        if (typeof name === "object" && name !== null) {
          registered.set(name.name, name);
        } else {
          registered.set(name, def);
        }
      },
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    config: {},
  };
}

function toolDef(name) {
  return registered.get(name);
}

function isRefused(result) {
  if (!result || typeof result !== "object") return false;
  return (
    result.refused === true ||
    result.ok === false ||
    result.error?.refused === true ||
    /refused|not.*hugo|not a hugo/i.test(String(result.error ?? result.reason ?? result.message ?? ""))
  );
}

describe("lib/index.js apply(ctx)", () => {
  beforeEach(async () => {
    tmpEmpty = mkdtempSync(join(tmpdir(), "hugo-tools-"));
    mod = await import("../lib/index.js");
  });

  afterEach(() => {
    rmSync(tmpEmpty, { recursive: true, force: true });
  });

  it("registers all 7 expected tools", async () => {
    const ctx = makeCtx(tmpEmpty);
    await mod.apply(ctx);
    for (const name of EXPECTED_TOOLS) {
      assert.ok(toolDef(name), `missing tool: ${name}`);
    }
    assert.equal(registered.size, EXPECTED_TOOLS.length);
  });

  it("every tool declares parameters.required", async () => {
    const ctx = makeCtx(tmpEmpty);
    await mod.apply(ctx);
    for (const name of EXPECTED_TOOLS) {
      const def = toolDef(name);
      const params = def.parameters ?? def.inputSchema ?? def.schema;
      assert.ok(params, `${name} must declare parameters`);
      assert.ok(
        Array.isArray(params.required),
        `${name} parameters.required must be an array`,
      );
    }
  });

  it("refuses execution outside a Hugo site", async () => {
    const ctx = makeCtx(tmpEmpty); // empty dir: no hugo.toml / content
    await mod.apply(ctx);
    for (const name of EXPECTED_TOOLS) {
      const def = toolDef(name);
      const execute = def.execute ?? def.handler ?? def.run;
      assert.equal(typeof execute, "function", `${name} must expose execute`);
      const result = await execute({}, ctx);
      assert.ok(
        isRefused(result),
        `${name} should refuse outside a Hugo site, got ${JSON.stringify(result)}`,
      );
    }
  });
});
