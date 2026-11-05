#!/usr/bin/env node
// Validates dsh-hugo-blog/package.json against files on disk.
// Prints ✓/✗ details; exits 1 on any failure.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;

function check(ok, label, detail = "") {
  checks += 1;
  if (ok) {
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
}

function exists(rel) {
  try {
    return existsSync(join(pkgDir, rel)) && statSync(join(pkgDir, rel)).isFile();
  } catch {
    return false;
  }
}

let pkg;
try {
  pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  check(true, "package.json is valid JSON");
} catch (err) {
  check(false, "package.json is valid JSON", err.message);
  console.log(`\n${failures.length} failure(s) out of ${checks} checks`);
  process.exit(1);
}

// 1. version matches semver
check(
  typeof pkg.version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version),
  "version matches semver",
  String(pkg.version),
);

// 2. dsh.bundle.patch exists and the file exists
const patch =
  pkg.dsh?.bundle?.patch ?? pkg.dsh?.patch ?? pkg.dsh?.bundlePatch ?? null;
check(patch != null, "dsh.bundle.patch is declared", patch ?? "(missing)");
if (patch != null) {
  check(exists(patch), `dsh.bundle.patch file exists: ${patch}`);
}

// 3. files manifest: key files exist
const keyFiles = [
  "lib/index.js",
  "lib/frontmatter.js",
  "lib/workspace.js",
  "lib/hugo-cli.js",
  "lib/git.js",
  "lib/config.js",
  "tests/frontmatter.test.mjs",
  "tests/workspace.test.mjs",
  "tests/hugo-cli.test.mjs",
  "tests/tools.test.mjs",
  "tests/integration.test.mjs",
  "test/fixtures/hugo-site/hugo.toml",
  "test/fixtures/hugo-site/content/posts/welcome.md",
  "README.md",
  "LICENSE",
];
for (const f of keyFiles) {
  check(exists(f), `key file exists: ${f}`);
}

// If a `files` array is declared, verify every non-glob entry exists
// (directories are valid entries, e.g. "lib").
if (Array.isArray(pkg.files)) {
  for (const entry of pkg.files) {
    if (/[*?[\]{}]/.test(entry)) continue; // glob entries checked via key files above
    const target = entry.replace(/^\.\//, "");
    check(
      existsSync(join(pkgDir, target)),
      `files entry exists: ${entry}`,
    );
  }
} else {
  check(false, "package.json declares a `files` array");
}

// 4. exports targets exist
function collectExports(value, path = "exports") {
  if (typeof value === "string") {
    if (/[*?[\]{}]/.test(value)) {
      console.log(`✓ ${path} target is a glob, skipped: ${value}`);
      return;
    }
    if (value.startsWith(".")) check(exists(value), `${path} target exists: ${value}`);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectExports(v, `${path}.${k}`);
  }
}
if (pkg.exports) {
  collectExports(pkg.exports);
} else {
  check(false, "package.json declares `exports`");
}

// 5. main entry exists (when declared)
if (pkg.main) {
  check(exists(pkg.main), `main entry exists: ${pkg.main}`);
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  console.log(`${failures.length} failure(s): ${failures.join("; ")}`);
  process.exit(1);
}
console.log("All package checks passed ✓");
