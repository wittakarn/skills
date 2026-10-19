#!/usr/bin/env node
// br-guard: a Claude Code PreToolUse hook that asks a human before Claude changes
// a unit test or source line that protects an active business rule (BR-<FEATURE>-<NNN>).
//
// Installed by the guard-business-rules skill as <repo>/.claude/hooks/br-guard.cjs,
// configured by br-guard.config.json next to it. No dependencies; Node 16+.
//
//   hook mode (stdin = hook JSON)   node br-guard.cjs
//   list what is protected           node br-guard.cjs --scan
//   check the install end to end     node br-guard.cjs --selftest
'use strict';

const fs = require('fs');
const path = require('path');

// Rules in these states are not guardrails: draft is unconfirmed, deprecated was
// dropped by the business, retired was judged "not a rule". Any other status,
// including a missing or unrecognised one, is protected.
const INACTIVE = new Set(['draft', 'deprecated', 'retired']);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'bin', 'obj', 'dist', 'build', 'out', 'target',
  'vendor', '.venv', 'venv', '__pycache__', '.idea', '.vs', '.vscode', 'coverage', '.next', '.claude',
  '.gradle', '.pytest_cache', '.mypy_cache', 'TestResults']);

const ID_SOURCE = String.raw`(?<![A-Za-z0-9])BR[-_]([A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z][A-Za-z0-9]*)*)[-_](\d{3,})(?!\d)`;

// ---------------------------------------------------------------- languages

const BRACE = 'brace';
const INDENT = 'indent';
const FILE = 'file';

// unit: a header (attributes, comments, signature) that marks a block as a test,
// a test container, or a declaration worth protecting as one piece.
const LANGUAGES = {
  csharp: { kind: BRACE, exts: ['.cs'], unit: /\[\s*(?:Xunit\.|NUnit\.Framework\.)?(?:Fact|Theory|Test|TestCase|TestCaseSource|TestMethod|DataTestMethod|DataRow|SkippableFact|SkippableTheory)\b|\bclass\s+\w+|\brecord\s+\w+/ },
  java: { kind: BRACE, exts: ['.java'], unit: /@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|Nested)\b|\bclass\s+\w+/ },
  kotlin: { kind: BRACE, exts: ['.kt', '.kts'], unit: /@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|Nested)\b|\bclass\s+\w+|\bfun\s+`|\b(?:test|context|describe|it|should)\s*\(/ },
  javascript: { kind: BRACE, exts: ['.js', '.jsx', '.mjs', '.cjs'], unit: /(?:^|[^.\w$])(?:it|test|describe|context|suite|specify|bench|Deno\.test)(?:\.\w+)*\s*(?:\([^]*?\)\s*)?\(/ },
  typescript: { kind: BRACE, exts: ['.ts', '.tsx', '.mts', '.cts'], unit: /(?:^|[^.\w$])(?:it|test|describe|context|suite|specify|bench|Deno\.test)(?:\.\w+)*\s*(?:\([^]*?\)\s*)?\(/ },
  go: { kind: BRACE, exts: ['.go'], unit: /\bfunc\s+(?:Test|Benchmark|Fuzz|Example)\w*\s*\(|\.Run\s*\(/ },
  php: { kind: BRACE, exts: ['.php'], unit: /\bfunction\s+test\w*|@test\b|#\[\s*Test\b|\bclass\s+\w+|(?:^|[^\w$>])(?:it|test|describe)\s*\(/, hashComments: true },
  swift: { kind: BRACE, exts: ['.swift'], unit: /\bfunc\s+test\w*|@Test\b|@Suite\b|\bclass\s+\w+|\bstruct\s+\w+/ },
  dart: { kind: BRACE, exts: ['.dart'], unit: /(?:^|[^.\w])(?:test|group|testWidgets)\s*\(|\bclass\s+\w+/ },
  scala: { kind: BRACE, exts: ['.scala'], unit: /\btest\s*\(|\bclass\s+\w+|\bobject\s+\w+|"[^"]*"\s*(?:in|should|must|when)\b/ },
  python: { kind: INDENT, exts: ['.py'] },
  file: { kind: FILE, exts: [] },
};

function languageForExt(ext) {
  for (const [name, def] of Object.entries(LANGUAGES)) if (def.exts.includes(ext)) return name;
  return 'file';
}

// ---------------------------------------------------------------- small helpers

function toPosix(p) { return p.replace(/\\/g, '/'); }
function norm(p) { return toPosix(path.resolve(p)); }
function squash(s) { return s.replace(/\s+/g, ' ').trim(); }
function lineOf(text, idx) { let n = 1; for (let i = 0; i < idx && i < text.length; i++) if (text[i] === '\n') n++; return n; }
function readText(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function idRegex(cfg) { return new RegExp(cfg && cfg.idPattern ? cfg.idPattern : ID_SOURCE, 'gi'); }

function normalizeId(feature, num) { return `BR-${feature.toUpperCase().replace(/_/g, '-')}-${num}`; }

function findIds(text, cfg) {
  const out = [];
  const re = idRegex(cfg);
  let m;
  while ((m = re.exec(text))) {
    const id = m[2] !== undefined ? normalizeId(m[1], m[2]) : m[0].toUpperCase().replace(/_/g, '-');
    out.push({ id, index: m.index });
  }
  return out;
}

function globToRegExp(glob) {
  let g = toPosix(glob);
  if (!g.includes('/')) g = '**/' + g;
  let re = '';
  for (let i = 0; i < g.length;) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 3; } else { re += '.*'; i += 2; }
      } else { re += '[^/]*'; i++; }
    } else if (c === '?') { re += '[^/]'; i++; }
    else if (c === '{' && g.indexOf('}', i) > i) {
      const j = g.indexOf('}', i);
      re += '(?:' + g.slice(i + 1, j).split(',').map(escapeRe).join('|') + ')';
      i = j + 1;
    } else { re += escapeRe(c); i++; }
  }
  return new RegExp('^' + re + '$');
}

// ---------------------------------------------------------------- config & rules

function loadConfig() {
  const cfgPath = process.env.BR_GUARD_CONFIG || path.join(__dirname, 'br-guard.config.json');
  const raw = readText(cfgPath);
  if (raw === null) throw new Error(`config not found: ${cfgPath}`);
  const cfg = JSON.parse(raw);
  const cfgDir = path.dirname(path.resolve(cfgPath));
  cfg.root = norm(cfg.root ? path.resolve(cfgDir, cfg.root) : path.resolve(cfgDir, '..', '..'));
  cfg.rulesDir = norm(path.resolve(cfg.root, cfg.rulesDir || 'business-rules'));
  cfg.tests = (cfg.tests || []).map(t => ({
    language: LANGUAGES[t.language] ? t.language : 'file',
    include: (t.include || []).map(globToRegExp),
    exclude: (t.exclude || []).map(globToRegExp),
  }));
  if (cfg.protectSource === undefined) cfg.protectSource = true;
  if (cfg.guardShell === undefined) cfg.guardShell = true;
  return cfg;
}

// Reads business-rules/*.md as written by extract-business-rules:
//   ### BR-ORD-003 — Free shipping threshold
//   - **Status:** tested
//   - **Source:** `src/Orders/Pricing.cs:42-58` (`Shipping`), `web/cart.ts:118`
// and "(was BR-ORD-005; ID retired)" lines under "Not rules".
function loadRules(cfg) {
  const rules = new Map();
  let names = [];
  try { names = fs.readdirSync(cfg.rulesDir); } catch { return rules; }
  for (const name of names.sort()) {
    if (!name.toLowerCase().endsWith('.md') || name.toLowerCase() === 'readme.md') continue;
    const file = path.join(cfg.rulesDir, name);
    const text = readText(file);
    if (text === null) continue;

    let base = cfg.root;
    const header = text.match(/^\s*[-*]\s*Source:\s*`?([^`\n@]+?)`?\s*(?:@.*)?$/m);
    if (header) {
      const candidate = path.resolve(cfg.root, header[1].trim());
      try { if (fs.statSync(candidate).isDirectory()) base = candidate; } catch { /* a repo name, not a path */ }
    }

    let cur = null;
    for (const line of text.split(/\r?\n/)) {
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        const ids = h[1].length >= 2 ? findIds(h[2], cfg) : [];
        cur = null;
        if (ids.length && ids[0].index < 3) {
          const title = h[2].slice(ids[0].index).replace(/^\S+\s*[—–:-]*\s*/, '').trim();
          cur = { id: ids[0].id, title, status: 'unknown', file: toPosix(path.relative(cfg.root, file)), sources: [] };
          rules.set(cur.id, cur);
        }
        continue;
      }
      const retired = line.match(/\(\s*was\s+([^;)]+?)\s*;[^)]*retired/i);
      if (retired) {
        for (const { id } of findIds(retired[1], cfg)) if (!rules.has(id)) {
          rules.set(id, { id, title: '', status: 'retired', file: toPosix(path.relative(cfg.root, file)), sources: [] });
        }
      }
      if (!cur) continue;
      const st = line.match(/\*\*Status:?\*\*:?\s*`?([A-Za-z][A-Za-z-]*)/);
      if (st) { cur.status = st[1].toLowerCase(); continue; }
      if (/\*\*Source:?\*\*/.test(line)) {
        for (const span of line.match(/`[^`]+`/g) || []) {
          const m = span.slice(1, -1).trim().match(/^(.+?\.[A-Za-z0-9]+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
          if (!m || /\s/.test(m[1])) continue;
          const abs = norm(path.isAbsolute(m[1]) ? m[1] : path.resolve(base, m[1]));
          const start = m[2] ? Number(m[2]) : null;
          cur.sources.push({ file: abs, start, end: m[3] ? Number(m[3]) : start });
        }
      }
    }
  }
  return rules;
}

function ruleState(rules, id) {
  const r = rules.get(id);
  if (!r) return { protected: true, label: `${id} (not found in business-rules/)` };
  const title = r.title ? ` ${r.title}` : '';
  return { protected: !INACTIVE.has(r.status), label: `${id}${title} [${r.status}]` };
}

function testLanguageFor(cfg, absFile) {
  const rel = toPosix(path.relative(cfg.root, absFile));
  if (rel.startsWith('../') || path.isAbsolute(rel)) return null;
  for (const t of cfg.tests) {
    if (t.include.some(r => r.test(rel)) && !t.exclude.some(r => r.test(rel))) return t.language;
  }
  return null;
}

// ---------------------------------------------------------------- parsing tests into regions

// Blank out comments and string/char literals (newlines kept) so braces inside them
// don't count. IDs are still searched in the raw text.
function maskBrace(text, lang) {
  const out = text.split('');
  const n = text.length;
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
  const hash = LANGUAGES[lang] && LANGUAGES[lang].hashComments;
  let i = 0;
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if ((c === '/' && d === '/') || (hash && c === '#' && d !== '[')) {
      let e = text.indexOf('\n', i); if (e < 0) e = n; blank(i, e); i = e; continue;
    }
    if (c === '/' && d === '*') {
      let e = text.indexOf('*/', i + 2); e = e < 0 ? n : e + 2; blank(i, e); i = e; continue;
    }
    if (c === '"' && text.startsWith('"""', i)) {
      let e = text.indexOf('"""', i + 3); e = e < 0 ? n : e + 3;
      while (text[e] === '"') e++;
      blank(i, e); i = e; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const verbatim = lang === 'csharp' && c === '"' && (text[i - 1] === '@' || (text[i - 1] === '$' && text[i - 2] === '@'));
      const raw = c === '`' && lang === 'go';
      let j = i + 1;
      while (j < n) {
        const ch = text[j];
        if (verbatim) { if (ch === '"') { if (text[j + 1] === '"') { j += 2; continue; } break; } j++; continue; }
        if (ch === '\\' && !raw) { j += 2; continue; }
        if (ch === c) break;
        if (ch === '\n' && c !== '`') break;
        j++;
      }
      const e = Math.min(n, j + 1); blank(i, e); i = e; continue;
    }
    i++;
  }
  return out.join('');
}

function braceBlocks(text, masked) {
  const stack = [], blocks = [];
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '{') stack.push(i);
    else if (c === '}' && stack.length) blocks.push({ open: stack.pop(), close: i });
  }
  while (stack.length) blocks.push({ open: stack.pop(), close: masked.length - 1 });
  const closeToOpen = new Map(blocks.map(b => [b.close, b.open]));

  for (const b of blocks) {
    // Walk back from "{" to the previous statement boundary (; { }) to find the header:
    // attributes, comments, decorators and signature. A boundary inside an open call,
    // like the "}" of an options object in it('x', { retry: 2 }, () => {, is skipped.
    let bal = 0, i = b.open - 1;
    for (; i >= 0; i--) {
      const c = masked[i];
      if (c === ')') bal--;
      else if (c === '(') bal++;
      else if (c === ';' || c === '{' || c === '}') {
        if (bal >= 0) break;
        if (c === '}' && closeToOpen.has(i)) i = closeToOpen.get(i);
      }
    }
    let hs = i + 1;
    // skip whitespace and the tail of the previous statement, but not a comment: it may carry the ID
    while (hs < b.open && (/\s/.test(text[hs]) || /[),;]/.test(masked[hs]))) hs++;
    b.start = hs;
    b.end = b.close + 1;
  }
  return blocks;
}

function regionsBrace(text, lang, cfg) {
  const masked = maskBrace(text, lang);
  const unit = LANGUAGES[lang].unit;
  const units = braceBlocks(text, masked).filter(b => unit.test(text.slice(b.start, b.open)));
  return assign(text, units, cfg, b => text.slice(b.start, b.open));
}

function regionsIndent(text, cfg) {
  const lines = text.split('\n');
  const offs = [];
  let o = 0;
  for (const l of lines) { offs.push(o); o += l.length + 1; }
  const indent = l => l.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
  const blank = l => !l.trim();
  const units = [];
  lines.forEach((line, i) => {
    if (!/^\s*(?:async\s+)?(?:def|class)\s+\w/.test(line)) return;
    const k = indent(line);
    // header: decorators and comments directly above, including multi-line decorator args
    let start = i, j = i - 1;
    while (j >= 0 && !blank(lines[j])) {
      const ind = indent(lines[j]);
      if (ind < k) break;
      if (ind === k && /^\s*[@#]/.test(lines[j])) { start = j; j--; continue; }
      if (ind > k || /^\s*[)\]]/.test(lines[j])) {
        let m = j;
        while (m >= 0 && !blank(lines[m]) && (indent(lines[m]) > k || /^\s*[)\]]/.test(lines[m]))) m--;
        if (m >= 0 && indent(lines[m]) === k && /^\s*@/.test(lines[m])) { start = m; j = m - 1; continue; }
      }
      break;
    }
    let last = i;
    for (let m = i + 1; m < lines.length; m++) {
      if (blank(lines[m])) continue;
      if (indent(lines[m]) <= k) break;
      last = m;
    }
    units.push({ start: offs[start] + indent(lines[start]), open: offs[i] + line.length, end: offs[last] + lines[last].length });
  });
  return assign(text, units, cfg, u => text.slice(u.start, u.open));
}

// Each ID occurrence belongs to the innermost unit that contains it (header or body).
// An ID outside every unit (file docstring, module-level marker) protects the whole file.
function assign(text, units, cfg, headerOf) {
  const regions = new Map();
  for (const { id, index } of findIds(text, cfg)) {
    let owner = null;
    for (const u of units) {
      if (index >= u.start && index < u.end && (!owner || u.start >= owner.start && u.end <= owner.end)) owner = u;
    }
    const key = owner ? `${owner.start}:${owner.end}` : 'file';
    if (!regions.has(key)) {
      const start = owner ? owner.start : 0, end = owner ? owner.end : text.length;
      regions.set(key, { start, end, ids: new Set(), line: lineOf(text, start), label: owner ? labelOf(headerOf(owner)) : '(whole file)' });
    }
    regions.get(key).ids.add(id);
  }
  return [...regions.values()];
}

function labelOf(header) {
  const str = header.match(/(?:(?<![\w$.])(?:it|test|describe|context|group|testWidgets)|\.Run)\s*(?:\.\w+)*\s*(?:\([^]*?\)\s*)?\(\s*(['"`])(.*?)\1/);
  if (str) return `"${str[2].slice(0, 70)}"`;
  const fn = header.match(/(?:def|func|fun|function|class|record|struct|object)\s+`?([\w ]+?)`?\s*[(:<{]|(\w+)\s*\([^()]*\)\s*(?::[^{=]+)?(?:=>)?\s*$/);
  if (fn) return (fn[1] || fn[2]).trim();
  const last = header.trim().split('\n').pop().trim();
  return last.slice(0, 70);
}

function testRegions(text, lang, cfg) {
  const kind = (LANGUAGES[lang] || LANGUAGES.file).kind;
  if (kind === BRACE) return regionsBrace(text, lang, cfg);
  if (kind === INDENT) return regionsIndent(text, cfg);
  const ids = findIds(text, cfg);
  return ids.length ? [{ start: 0, end: text.length, ids: new Set(ids.map(x => x.id)), line: 1, label: '(whole file)' }] : [];
}

function sourceRegions(text, refs) {
  const lines = text.split('\n');
  const offs = [];
  let o = 0;
  for (const l of lines) { offs.push(o); o += l.length + 1; }
  return refs.map(({ ref, label }) => {
    if (ref.start === null || ref.start > lines.length) return { start: 0, end: text.length, line: 1, span: '(whole file)', label };
    const a = ref.start - 1, b = Math.min(lines.length, ref.end || ref.start) - 1;
    return { start: offs[a], end: offs[b] + lines[b].length, line: ref.start, span: a === b ? `line ${a + 1}` : `lines ${a + 1}-${b + 1}`, label };
  });
}

// ---------------------------------------------------------------- the check

// Everything in `file` that is protected: tagged test regions whose IDs are active or
// unknown, and line ranges cited by active rules' Source fields.
function protectedIn(cfg, rules, absFile, text) {
  const found = [];
  const lang = testLanguageFor(cfg, absFile);
  if (lang) {
    for (const r of testRegions(text, lang, cfg)) {
      const hits = [...r.ids].map(id => ruleState(rules, id)).filter(s => s.protected);
      if (hits.length) found.push({ ...r, why: hits.map(h => h.label), kind: 'test' });
    }
  }
  if (cfg.protectSource) {
    const refs = [];
    for (const r of rules.values()) {
      if (INACTIVE.has(r.status)) continue;
      for (const s of r.sources) if (s.file === absFile) refs.push({ ref: s, label: ruleState(rules, r.id).label });
    }
    for (const reg of sourceRegions(text, refs)) found.push({ ...reg, why: [reg.label], label: reg.span, kind: 'source' });
  }
  return found;
}

function applyEdits(text, edits) {
  let out = text;
  for (const e of edits) {
    const oldS = e.old_string !== undefined ? e.old_string : e.old_str;
    const newS = e.new_string !== undefined ? e.new_string : (e.new_str !== undefined ? e.new_str : '');
    if (typeof oldS !== 'string' || oldS === '') { out = typeof e.content === 'string' ? e.content : newS; continue; }
    if (!out.includes(oldS)) continue;
    out = e.replace_all ? out.split(oldS).join(newS) : out.replace(oldS, () => newS);
  }
  return out;
}

// Returns the protected regions of `absFile` whose text does not survive in `after`
// (null = file deleted). Whitespace-only changes are ignored.
function touched(cfg, rules, absFile, before, after) {
  if (before === null) return [];
  const flat = after === null ? null : squash(after);
  return protectedIn(cfg, rules, absFile, before)
    .filter(r => flat === null || !flat.includes(squash(before.slice(r.start, r.end))));
}

function fileChanges(input) {
  const ti = input.tool_input || {};
  const name = input.tool_name;
  const changes = new Map();
  const add = (fp, edit) => {
    if (!fp) return;
    const abs = norm(path.isAbsolute(fp) ? fp : path.resolve(input.cwd || process.cwd(), fp));
    if (!changes.has(abs)) changes.set(abs, []);
    changes.get(abs).push(edit);
  };
  if (name === 'Write') add(ti.file_path, { content: ti.content !== undefined ? ti.content : ti.file_text });
  else if (Array.isArray(ti.edits)) for (const e of ti.edits) add(e.file_path || ti.file_path, e);
  else if (name === 'Edit' || ti.old_string !== undefined) add(ti.file_path, ti);
  return changes;
}

function walk(dir, onFile) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), onFile); }
    else if (e.isFile()) onFile(path.join(dir, e.name));
  }
}

// Every file holding something protected, with the reasons. Used for shell commands and --scan.
function protectedFiles(cfg, rules) {
  const files = new Map();
  walk(cfg.root, f => {
    const abs = norm(f);
    if (!testLanguageFor(cfg, abs)) return;
    const text = readText(f);
    if (text === null || !idRegex(cfg).test(text)) return;
    const regions = protectedIn(cfg, rules, abs, text);
    if (regions.length) files.set(abs, regions);
  });
  if (cfg.protectSource) {
    for (const r of rules.values()) {
      if (INACTIVE.has(r.status)) continue;
      for (const s of r.sources) {
        if (files.has(s.file)) continue;
        const text = readText(s.file);
        if (text !== null) files.set(s.file, protectedIn(cfg, rules, s.file, text));
      }
    }
  }
  return files;
}

// Shell commands are read best effort: split into simple commands, then take the paths
// each one writes, moves or deletes. Reads (cat, grep, dotnet test) never prompt.
const DELETE_OR_MOVE = /^(?:rm|rmdir|unlink|shred|truncate|mv|tee|del|erase|move|ren|rename|rd|remove-item|move-item|rename-item|set-content|add-content|clear-content|out-file|ri|mi|rni|sc|ac|clc)$/i;
const COPY = /^(?:cp|copy|copy-item|cpi|install|rsync|ditto)$/i;
const GIT_WRITE = /^(?:rm|mv|checkout|restore|clean)$/;
const FORMATTER = /^(?:prettier|black|ruff|eslint|gofmt|goimports|php-cs-fixer|ktlint|swiftformat|dart|dotnet|csharpier)$/i;

function shellTokens(segment) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\d?>>?|<)|([^\s<>]+)/g;
  let m;
  while ((m = re.exec(segment))) out.push(m[3] ? { op: m[3] } : { word: m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[4] });
  return out;
}

function shellTargets(command, cwd) {
  const targets = [];
  let dir = cwd;
  for (const seg of command.split(/&&|\|\||[;|\n]/)) {
    const toks = shellTokens(seg.trim().replace(/^[({]\s*|\s*[)}]$/g, ''));
    const words = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.op) { const nxt = toks[i + 1]; if (/>/.test(t.op) && nxt && nxt.word && !/^&/.test(nxt.word)) targets.push([dir, nxt.word]); i++; continue; }
      words.push(t.word);
    }
    while (words.length && /^\w+=/.test(words[0])) words.shift();
    if (/^(sudo|command|xargs|nohup|time)$/.test(words[0] || '')) words.shift();
    const verb = (words[0] || '').replace(/^.*[\\/]/, '');
    const args = words.slice(1).filter(w => !/^-/.test(w));
    if (verb === 'cd') { if (args[0]) dir = path.resolve(dir, args[0]); continue; }
    let hit = [];
    if (DELETE_OR_MOVE.test(verb)) hit = args;
    else if (COPY.test(verb)) hit = args.slice(-1);
    else if (verb === 'dd') hit = words.filter(w => /^of=/.test(w)).map(w => w.slice(3));
    else if ((verb === 'sed' || verb === 'perl') && words.some(w => /^-[A-Za-z]*i/.test(w) || w === '--in-place')) hit = args.slice(1);
    else if (verb === 'git' && GIT_WRITE.test(args[0] || '')) hit = args.slice(1);
    else if (verb === 'find' && words.some(w => w === '-delete' || w === '-exec' || w === '-execdir')) hit = args.slice(0, 1);
    else if (FORMATTER.test(verb) && words.some(w => /^(--write|--fix|-w|format|fmt)$/.test(w))) hit = args.filter(w => !/^(format|fmt)$/.test(w));
    for (const h of hit) targets.push([dir, h]);
  }
  return targets;
}

function shellHits(cfg, rules, command, cwd) {
  const targets = shellTargets(command, cwd);
  if (!targets.length) return [];
  const files = protectedFiles(cfg, rules);
  const hits = new Map();
  for (const [dir, t] of targets) {
    const abs = norm(path.resolve(dir, t.replace(/^~(?=[\\/]|$)/, process.env.HOME || process.env.USERPROFILE || '~')));
    const glob = /[*?[{]/.test(t) ? globToRegExp(abs.replace(/^\//, '')) : null;
    for (const [f, regions] of files) {
      if (f === abs || f.startsWith(abs.endsWith('/') ? abs : abs + '/') || (glob && glob.test(f.replace(/^\//, '')))) hits.set(f, regions);
    }
  }
  return [...hits].map(([file, regions]) => ({ file, regions }));
}

function describe(cfg, file, regions) {
  const rel = toPosix(path.relative(cfg.root, file));
  return regions.map(r => `- ${r.why.join(', ')} — ${r.kind === 'source' ? 'source' : 'test'} ${rel}:${r.line} ${r.label}`);
}

function decide(input, cfg) {
  const rules = loadRules(cfg);
  const lines = [];
  const name = input.tool_name || '';

  if (/^(Bash|PowerShell)$/.test(name)) {
    if (!cfg.guardShell) return null;
    const cmd = (input.tool_input && input.tool_input.command) || '';
    for (const { file, regions } of shellHits(cfg, rules, cmd, input.cwd || cfg.root)) {
      lines.push(...describe(cfg, file, regions));
    }
    if (!lines.length) return null;
    return `Business-rule guard: this ${name} command may delete, move or rewrite files that protect active business rules:\n` +
      lines.join('\n') + `\nApprove only if this change is intended and the rule's behaviour stays covered. Rules: ${toPosix(path.relative(cfg.root, cfg.rulesDir))}/`;
  }

  for (const [file, edits] of fileChanges(input)) {
    const before = readText(file);
    if (before === null) continue;
    const after = applyEdits(before, edits);
    if (after === before) continue;
    const t = touched(cfg, rules, file, before, after);
    if (t.length) lines.push(...describe(cfg, file, t));
  }
  if (!lines.length) return null;
  return `Business-rule guard: this edit changes code that protects active business rules:\n` +
    lines.join('\n') + `\nApprove only if the rule itself changed or the edit keeps the rule's behaviour and its test. Rules: ${toPosix(path.relative(cfg.root, cfg.rulesDir))}/`;
}

function askJson(reason) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } });
}

// ---------------------------------------------------------------- CLI modes

function scan(cfg) {
  const rules = loadRules(cfg);
  const files = protectedFiles(cfg, rules);
  const out = [];
  const counts = {};
  for (const r of rules.values()) counts[r.status] = (counts[r.status] || 0) + 1;
  out.push(`Root: ${cfg.root}`);
  out.push(`Rules: ${rules.size} in ${toPosix(path.relative(cfg.root, cfg.rulesDir))}/ (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})`);
  let n = 0;
  for (const [file, regions] of files) {
    out.push(`\n${toPosix(path.relative(cfg.root, file))}`);
    for (const l of describe(cfg, file, regions)) { out.push('  ' + l.replace(/^- /, '')); n++; }
  }
  out.push(`\n${n} protected region(s) in ${files.size} file(s).`);
  // tagged tests that are not protected, so the user sees what the guard lets through
  const free = [];
  walk(cfg.root, f => {
    const abs = norm(f);
    const lang = testLanguageFor(cfg, abs);
    if (!lang) return;
    const text = readText(f);
    if (text === null) return;
    for (const r of testRegions(text, lang, cfg)) {
      const states = [...r.ids].map(id => ruleState(rules, id));
      if (states.every(s => !s.protected)) free.push(`  ${toPosix(path.relative(cfg.root, abs))}:${r.line} ${r.label} (${states.map(s => s.label).join(', ')})`);
    }
  });
  if (free.length) out.push(`\nTagged but not protected (inactive rules):\n${free.join('\n')}`);
  return out.join('\n');
}

function run(input, cfg) {
  try { return decide(input, cfg); } catch (e) { return `Business-rule guard could not check this call (${e.message}). Review it yourself before approving.`; }
}

// Builds edits from the repo's own files and checks the guard reacts as designed.
function selftest(cfg) {
  const rules = loadRules(cfg);
  const files = protectedFiles(cfg, rules);
  const results = [];
  const check = (name, input, expectAsk) => {
    const reason = run(input, cfg);
    const ok = Boolean(reason) === expectAsk;
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${name} → ${reason ? 'ask' : 'no prompt'}`);
  };
  const testFile = [...files].find(([, regs]) => regs.some(r => r.kind === 'test'));
  if (!testFile) return 'FAIL  no protected tests found — check the "tests" globs and the rules statuses (run --scan)';
  const [file, regs] = testFile;
  const text = readText(file);
  const region = regs.find(r => r.kind === 'test');
  const body = text.slice(region.start, region.end);
  const rel = toPosix(path.relative(cfg.root, file));
  const lastLine = body.trimEnd().split('\n').slice(-2).join('\n');
  check(`edit inside protected test ${rel}:${region.line}`, { tool_name: 'Edit', tool_input: { file_path: file, old_string: lastLine, new_string: lastLine.replace(/(\S)/, '$1 /*x*/') } }, true);
  const idHit = findIds(body, cfg)[0];
  if (idHit) {
    const idText = body.slice(idHit.index, idHit.index + idHit.id.length);
    if (text.split(idText).length === 2) check(`remove the ID ${idHit.id} from the test`, { tool_name: 'Edit', tool_input: { file_path: file, old_string: idText, new_string: 'X' } }, true);
  }
  check(`Write that drops the test from ${rel}`, { tool_name: 'Write', tool_input: { file_path: file, content: text.slice(0, region.start) + text.slice(region.end) } }, true);
  check(`append new code at end of ${rel}`, { tool_name: 'Write', tool_input: { file_path: file, content: text + '\n// new test here\n' } }, region.label === '(whole file)');
  check(`rm ${rel}`, { tool_name: 'Bash', cwd: cfg.root, tool_input: { command: `rm ${rel}` } }, true);
  check(`cat ${rel} (read-only)`, { tool_name: 'Bash', cwd: cfg.root, tool_input: { command: `cat ${rel}` } }, false);

  // an untagged or inactive test elsewhere should pass silently
  let quiet = null;
  walk(cfg.root, f => {
    if (quiet) return;
    const abs = norm(f);
    const lang = testLanguageFor(cfg, abs);
    if (!lang) return;
    const t = readText(f);
    if (t === null) return;
    const prot = protectedIn(cfg, rules, abs, t);
    const lines = t.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const pos = t.split('\n').slice(0, i).join('\n').length + (i ? 1 : 0);
      const line = lines[i];
      if (line.trim().length < 8 || t.split(line).length !== 2) continue;
      if (prot.some(r => pos < r.end && pos + line.length > r.start)) continue;
      if (/^\s*(\/\/|#|\*|\/\*)/.test(line)) continue;
      quiet = { abs, line, rel: toPosix(path.relative(cfg.root, abs)), n: i + 1 };
      return;
    }
  });
  if (quiet) check(`edit outside protected tests ${quiet.rel}:${quiet.n}`, { tool_name: 'Edit', tool_input: { file_path: quiet.abs, old_string: quiet.line, new_string: quiet.line + ' ' } }, false);

  const src = [...files].find(([, regs]) => regs.some(r => r.kind === 'source'));
  if (src) {
    const [sfile, sregs] = src;
    const stext = readText(sfile);
    const r = sregs.find(x => x.kind === 'source');
    const seg = stext.slice(r.start, r.end).split('\n').find(l => l.trim().length > 3 && stext.split(l).length === 2);
    if (seg) check(`edit cited source ${toPosix(path.relative(cfg.root, sfile))}:${r.line}`, { tool_name: 'Edit', tool_input: { file_path: sfile, old_string: seg, new_string: seg + ' /*x*/' } }, true);
  }
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  results.push(`\n${results.length - fails} passed, ${fails} failed.`);
  return results.join('\n');
}

function main() {
  const arg = process.argv[2];
  if (arg === '--scan' || arg === '--selftest') {
    const cfg = loadConfig();
    process.stdout.write((arg === '--scan' ? scan(cfg) : selftest(cfg)) + '\n');
    return;
  }
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { raw += d; });
  process.stdin.on('end', () => {
    let reason;
    try {
      const input = JSON.parse(raw || '{}');
      reason = run(input, loadConfig());
    } catch (e) {
      reason = `Business-rule guard could not check this call (${e.message}). Review it yourself before approving.`;
    }
    if (reason) process.stdout.write(askJson(reason));
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { LANGUAGES, languageForExt, findIds, globToRegExp, testRegions, loadRules, loadConfig, decide, walk, SKIP_DIRS };
