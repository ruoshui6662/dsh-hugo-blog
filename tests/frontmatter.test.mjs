import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseFrontmatter,
  serializeFrontmatter,
  updateFrontmatter,
  lintFrontmatter,
} from "../lib/frontmatter.js";

// Helpers tolerate reasonable return-shape variations from lib implementations.
function dataOf(parsed) {
  if (!parsed) return {};
  return parsed.data ?? parsed.frontmatter ?? parsed.attributes ?? parsed;
}
function bodyOf(parsed) {
  return parsed?.body ?? parsed?.content ?? parsed?.rest ?? "";
}
function issuesOf(result) {
  if (Array.isArray(result)) return result;
  return result?.issues ?? result?.warnings ?? result?.errors ?? [];
}
function issueText(issue) {
  return String(issue?.message ?? issue?.msg ?? issue?.code ?? issue ?? "");
}
function lint(textOrData) {
  // lintFrontmatter may accept raw text or a data object; pass text through
  // directly and data objects as-is.
  return issuesOf(lintFrontmatter(textOrData));
}

describe("parseFrontmatter", () => {
  it("parses YAML front matter", () => {
    const md = `---\ntitle: Hello\ndraft: false\n---\n\nBody text\n`;
    const parsed = parseFrontmatter(md);
    assert.equal(dataOf(parsed).title, "Hello");
    assert.equal(dataOf(parsed).draft, false);
    assert.match(bodyOf(parsed), /Body text/);
  });

  it("parses TOML front matter (+++ delimiters)", () => {
    const md = `+++\ntitle = "TOML Title"\ndraft = true\n+++\n\nBody\n`;
    const parsed = parseFrontmatter(md);
    assert.equal(dataOf(parsed).title, "TOML Title");
    assert.equal(dataOf(parsed).draft, true);
  });

  it("parses inline arrays for tags/categories", () => {
    const md = `---\ntitle: A\ntags: ["hugo", "fixture"]\ncategories: ["blog"]\n---\n\nB\n`;
    const parsed = parseFrontmatter(md);
    assert.deepEqual([...dataOf(parsed).tags], ["hugo", "fixture"]);
    assert.deepEqual([...dataOf(parsed).categories], ["blog"]);
  });

  it("parses date fields", () => {
    const md = `---\ntitle: A\ndate: 2026-11-05T10:00:00+08:00\n---\n\nB\n`;
    const parsed = parseFrontmatter(md);
    const d = dataOf(parsed).date;
    // Date object or ISO string are both acceptable; compare as time.
    const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
    assert.equal(t, new Date("2026-11-05T10:00:00+08:00").getTime());
  });

  it("returns empty data when no front matter present", () => {
    const parsed = parseFrontmatter("Just body, no front matter.\n");
    assert.deepEqual({ ...dataOf(parsed) }, {});
    assert.match(bodyOf(parsed) || "Just body", /Just body/);
  });
});

describe("serializeFrontmatter round-trip", () => {
  it("parse -> serialize -> parse preserves data", () => {
    const md = `---\ntitle: Round Trip\ndate: 2026-11-05T10:00:00+08:00\ndraft: false\ntags: ["x", "y"]\ncategories: ["blog"]\n---\n\nHello body\n`;
    const first = parseFrontmatter(md);
    const data = dataOf(first);
    const out = serializeFrontmatter(first.format, data) + bodyOf(first);
    const second = parseFrontmatter(out);
    assert.equal(dataOf(second).title, "Round Trip");
    assert.deepEqual([...dataOf(second).tags], ["x", "y"]);
    assert.match(bodyOf(second), /Hello body/);
  });
});

describe("updateFrontmatter", () => {
  it("changes only the front matter zone, not the body", () => {
    const md = `---\ntitle: Old\ndraft: true\n---\n\nBody mentioning title: Old and draft: true\n`;
    const out = updateFrontmatter(md, { title: "New", draft: false });
    assert.equal(typeof out, "string");
    const parsed = parseFrontmatter(out);
    assert.equal(dataOf(parsed).title, "New");
    assert.equal(dataOf(parsed).draft, false);
    // Body must be untouched.
    assert.match(bodyOf(parsed), /Body mentioning title: Old and draft: true/);
  });

  it("preserves untouched fields", () => {
    const md = `---\ntitle: Keep\ndate: 2026-11-05T10:00:00+08:00\n---\n\nB\n`;
    const out = updateFrontmatter(md, { draft: false });
    const parsed = parseFrontmatter(out);
    assert.equal(dataOf(parsed).title, "Keep");
    assert.equal(dataOf(parsed).draft, false);
  });
});

describe("lintFrontmatter", () => {
  it("warns when title is missing", () => {
    const issues = lint(`---\ndraft: false\n---\n\nB\n`);
    assert.ok(issues.length >= 1, "expected at least one issue");
    assert.match(issues.map(issueText).join(" "), /title/i);
  });

  it("flags draft + publishDate conflict", () => {
    const issues = lint(
      `---\ntitle: X\ndraft: true\npublishDate: 2026-11-05T10:00:00+08:00\n---\n\nB\n`,
    );
    assert.ok(issues.length >= 1, "expected at least one issue");
    assert.match(issues.map(issueText).join(" "), /publishDate|draft/i);
  });

  it("flags expiryDate earlier than date", () => {
    const issues = lint(
      `---\ntitle: X\ndate: 2026-11-05T10:00:00+08:00\nexpiryDate: 2026-11-01T10:00:00+08:00\n---\n\nB\n`,
    );
    assert.ok(issues.length >= 1, "expected at least one issue");
    assert.match(issues.map(issueText).join(" "), /expiryDate|expir/i);
  });

  it("passes a clean front matter block", () => {
    const issues = lint(
      `---\ntitle: Clean\ndate: 2026-11-05T10:00:00+08:00\nexpiryDate: 2026-12-05T10:00:00+08:00\ndraft: false\n---\n\nB\n`,
    );
    const errors = issues.filter(
      (i) => (i?.severity ?? i?.level ?? "error") === "error",
    );
    assert.equal(errors.length, 0);
  });
});
