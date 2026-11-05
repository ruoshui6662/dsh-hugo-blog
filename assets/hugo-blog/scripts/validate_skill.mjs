// validate_skill.mjs — 纯 Node 校验脚本，无第三方依赖。
// 用法: node scripts/validate_skill.mjs [skillDir]
//   skillDir 默认取脚本所在目录的上一级。
// 校验项: SKILL.md 存在且 frontmatter 含 name/description、name 为 kebab-case、
//   references 引用的文件都存在、evals JSON 可解析且每条有 id/input/expect、没有 TODO/占位符。
// 失败时 exit 1 并列出全部问题；通过时 exit 0。
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(process.argv[2] ?? join(scriptDir, ".."));
const problems = [];

// ---- SKILL.md 存在性与 frontmatter ----
const skillPath = join(skillDir, "SKILL.md");
if (!existsSync(skillPath)) {
  problems.push(`SKILL.md 不存在: ${skillPath}`);
} else {
  const text = readFileSync(skillPath, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) {
    problems.push("SKILL.md 缺少 frontmatter（应以 --- 开头和结尾）");
  } else {
    const fm = m[1];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const descMatch = fm.match(/^description:\s*(\|)?\s*$/m) || fm.match(/^description:\s*(.+)$/m);
    if (!nameMatch) problems.push("frontmatter 缺 name 字段");
    if (!descMatch) problems.push("frontmatter 缺 description 字段");
    if (nameMatch) {
      const name = nameMatch[1].trim();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
        problems.push(`name 不是 kebab-case: ${name}`);
      }
    }
  }

  // references 引用: [xxx](references/yyy.md) 与反引号 references/yyy.md
  const refs = new Set();
  for (const mm of text.matchAll(/\((references\/[^)\s]+)\)/g)) refs.add(mm[1]);
  for (const mm of text.matchAll(/`((?:references|evals|scripts)\/[^`\s]+)`/g)) refs.add(mm[1]);
  for (const ref of refs) {
    if (!existsSync(join(skillDir, ref))) {
      problems.push(`SKILL.md 引用的文件不存在: ${ref}`);
    }
  }
}

// ---- evals JSON ----
const evalsPath = join(skillDir, "evals", "trigger_cases.json");
if (!existsSync(evalsPath)) {
  problems.push(`evals/trigger_cases.json 不存在: ${evalsPath}`);
} else {
  let cases;
  try {
    cases = JSON.parse(readFileSync(evalsPath, "utf8"));
  } catch (e) {
    problems.push(`evals JSON 解析失败: ${e.message}`);
    cases = null;
  }
  if (Array.isArray(cases)) {
    if (cases.length === 0) problems.push("evals 用例为空数组");
    cases.forEach((c, i) => {
      for (const field of ["id", "input", "expect"]) {
        if (!c || typeof c[field] !== "string" || c[field].trim() === "") {
          problems.push(`evals 第 ${i + 1} 条缺字段 ${field}: ${JSON.stringify(c)}`);
        }
      }
      if (c && typeof c.expect === "string" && !["trigger", "no_trigger", "partial"].includes(c.expect)) {
        problems.push(`evals 用例 ${c.id ?? i} 的 expect 非法: ${c.expect}（应为 trigger|no_trigger|partial）`);
      }
    });
  } else if (cases !== null) {
    problems.push("evals 顶层不是 JSON 数组");
  }
}

// ---- TODO/占位符扫描 ----
function scanDir(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (p === fileURLToPath(import.meta.url)) continue; // 本脚本含校验关键字，不自扫
    if (entry.isDirectory()) {
      scanDir(p);
    } else if (/\.(md|json|mjs|js|txt)$/.test(entry.name)) {
      const content = readFileSync(p, "utf8");
      const hit = content.match(/(TODO|FIXME|XXX|PLACEHOLDER|占位符|lorem ipsum)/i);
      if (hit) problems.push(`发现 TODO/占位符（${hit[0]}）: ${p}`);
    }
  }
}
if (existsSync(skillDir) && statSync(skillDir).isDirectory()) scanDir(skillDir);

if (problems.length > 0) {
  console.error(`校验失败，共 ${problems.length} 个问题:\n` + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`校验通过: ${skillDir}`);
