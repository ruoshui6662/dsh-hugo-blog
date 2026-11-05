// Front matter 最小解析（YAML --- / TOML +++），无第三方依赖，纯函数可测。
// 覆盖 title/date/draft/publishDate/expiryDate/tags/categories/aliases/layout/type/slug/url/weight/params 常见值。
const fmReYaml = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;
const fmReToml = /^\+\+\+[ \t]*\r?\n([\s\S]*?)\r?\n\+\+\+[ \t]*\r?\n?/;
function stripQuotes(v) {
  const t = v.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) return t.slice(1, -1);
  return t;
}
function parseScalar(raw) {
  let v = String(raw).trim();
  // 行内注释（未引用时）
  if (!/^(["'])/.test(v)) { const c = /\s+#/.exec(v); if (c) v = v.slice(0, c.index).trim(); }
  if (v === '' ) return '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    const q = v[0]; const inner = v.slice(1, -1);
    return q === '"' ? inner.replace(/\\"/g, '"').replace(/\\n/g, '\n') : inner.replace(/''/g, "'");
  }
  if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
  if (/^(null|~)$/i.test(v)) return null;
  if (/^\[.*\]$/.test(v)) {
    const inner = v.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((s) => parseScalar(s)).filter((s) => s !== '');
  }
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  // 日期/时间原样保留字符串（避免时区漂移）
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) return v;
  return v;
}
function parseYamlBlock(block) {
  const data = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (/^\s+/.test(line)) continue; // 嵌套块（如 params 子键）只做一层，跳过续行
    const m = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const key = m[1];
    const val = (m[2] ?? '').trim();
    if (val === '') {
      // 可能是块列表
      const items = [];
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const lm = /^\s*-\s+(.*)$/.exec(lines[j]);
        if (lm) { items.push(parseScalar(lm[1])); continue; }
        if (!lines[j].trim() || lines[j].trimStart().startsWith('#')) continue;
        break;
      }
      if (items.length > 0) { data[key] = items; i = j - 1; }
      else data[key] = '';
      continue;
    }
    if (val === '|' || val === '>' || val.startsWith('|-') || val.startsWith('>-')) {
      const buf = []; let j = i + 1;
      for (; j < lines.length; j += 1) {
        if (/^\S/.test(lines[j]) && lines[j].trim()) break;
        buf.push(lines[j]);
      }
      data[key] = buf.join(val.startsWith('>') ? ' ' : '\n').trim();
      i = j - 1;
      continue;
    }
    data[key] = parseScalar(val);
  }
  return data;
}
function parseTomlBlock(block) {
  const data = {};
  for (const line of block.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith('[')) continue; // 表头跳过（params 等深层表不展开）
    const m = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(t);
    if (!m) continue;
    let v = m[2].trim();
    const c = /\s+#/.exec(v); if (c && !/^(["'])/.test(v)) v = v.slice(0, c.index).trim();
    data[m[1]] = parseScalar(v);
  }
  return data;
}
export function parseFrontmatter(content) {
  const src = String(content ?? '').replace(/^\uFEFF/, '');
  let m = fmReYaml.exec(src);
  if (m) return { format: 'yaml', data: parseYamlBlock(m[1]), body: src.slice(m[0].length), raw: m[0] };
  m = fmReToml.exec(src);
  if (m) return { format: 'toml', data: parseTomlBlock(m[1]), body: src.slice(m[0].length), raw: m[0] };
  return { format: null, data: {}, body: src, raw: '' };
}
function fmtYamlValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => fmtYamlValue(x)).join(', ')}]`;
  const s = String(v);
  if (/[:#\[\]{},&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s) || s === '') return `"${s.replace(/"/g, '\\"')}"`;
  return s;
}
function fmtTomlValue(v) {
  if (v === null || v === undefined) return '""';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => fmtTomlValue(x)).join(', ')}]`;
  return `"${String(v).replace(/"/g, '\\"')}"`;
}
export function serializeFrontmatter(format, data) {
  const entries = Object.entries(data ?? {});
  if (format === 'toml') {
    return `+++\n${entries.map(([k, v]) => `${k} = ${fmtTomlValue(v)}`).join('\n')}\n+++\n`;
  }
  return `---\n${entries.map(([k, v]) => `${k}: ${fmtYamlValue(v)}`).join('\n')}\n---\n`;
}
/** 只改 front matter 区，保留正文原样（该区重写）。patch 中值为 undefined 表示删除该键。 */
export function updateFrontmatter(content, patch) {
  const src = String(content ?? '');
  const parsed = parseFrontmatter(src);
  const format = parsed.format ?? 'yaml';
  const merged = { ...parsed.data };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  return serializeFrontmatter(format, merged) + parsed.body;
}
function toDate(v) {
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
/** @returns {{level:'warn'|'error',message:string,field:string}[]} */
export function lintFrontmatter(data, opts = {}) {
  // 兼容传入原始文本：先解析再 lint。
  if (typeof data === 'string') data = parseFrontmatter(data).data;
  const out = [];
  const tax = opts.taxonomies ?? ['tags', 'categories'];
  if (!data.title || String(data.title).trim() === '') out.push({ level: 'warn', message: '缺少 title', field: 'title' });
  if (!data.date) out.push({ level: 'warn', message: '缺少 date', field: 'date' });
  else if (!toDate(data.date)) out.push({ level: 'warn', message: `date 无法解析：${data.date}`, field: 'date' });
  if (data.draft === true && data.publishDate) out.push({ level: 'warn', message: 'draft=true 与 publishDate 同时存在，发布时机不明确', field: 'publishDate' });
  if (data.expiryDate && data.date) {
    const e = toDate(data.expiryDate); const d = toDate(data.date);
    if (e && d && e < d) out.push({ level: 'warn', message: 'expiryDate 早于 date，页面可能未上线即过期', field: 'expiryDate' });
  }
  for (const key of tax) {
    if (key in data) {
      const v = data[key];
      if (!Array.isArray(v)) out.push({ level: 'warn', message: `${key} 应为数组`, field: key });
      else if (v.some((x) => typeof x !== 'string' || !x.trim())) out.push({ level: 'warn', message: `${key} 含非字符串或空项`, field: key });
    }
  }
  return out;
}
