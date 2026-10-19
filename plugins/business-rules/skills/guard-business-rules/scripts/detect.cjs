#!/usr/bin/env node
// Survey a repo before installing br-guard: which languages and test frameworks it uses,
// how tests carry BR IDs, which IDs are unknown, and a suggested br-guard.config.json.
//
//   node detect.cjs <repo-root>
'use strict';

const fs = require('fs');
const path = require('path');
const { LANGUAGES, languageForExt, findIds, globToRegExp, walk } = require('./br-guard.cjs');

const root = path.resolve(process.argv[2] || '.');
const toPosix = p => p.replace(/\\/g, '/');
const rel = f => toPosix(path.relative(root, f));

const TEST_MARKERS = {
  csharp: [[/\[\s*(?:Fact|Theory|SkippableFact)\b/, 'xUnit'], [/\[\s*(?:Test|TestCase|TestCaseSource)\b/, 'NUnit'], [/\[\s*(?:TestMethod|DataTestMethod)\b/, 'MSTest']],
  java: [[/@(?:Test|ParameterizedTest)\b/, 'JUnit']],
  kotlin: [[/@(?:Test|ParameterizedTest)\b/, 'JUnit'], [/\b(?:StringSpec|FunSpec|DescribeSpec|BehaviorSpec)\b/, 'Kotest']],
  javascript: [[/from\s+['"]vitest['"]|require\(['"]vitest['"]\)/, 'Vitest'], [/@jest\/globals|\bjest\.(?:fn|mock|spyOn)\b/, 'Jest'], [/from\s+['"]node:test['"]/, 'node:test'], [/(?:^|[^.\w])(?:describe|it|test)\s*(?:\.\w+)*\s*\(/m, 'describe/it']],
  typescript: [[/from\s+['"]vitest['"]/, 'Vitest'], [/@jest\/globals|\bjest\.(?:fn|mock|spyOn)\b/, 'Jest'], [/from\s+['"]@playwright\/test['"]/, 'Playwright'], [/(?:^|[^.\w])(?:describe|it|test)\s*(?:\.\w+)*\s*\(/m, 'describe/it']],
  python: [[/^\s*(?:async\s+)?def\s+test_|^\s*class\s+Test/m, 'pytest/unittest']],
  go: [[/func\s+Test\w*\s*\(\s*\w+\s+\*testing\.T/, 'go test']],
  php: [[/extends\s+(?:\\?PHPUnit\\Framework\\)?TestCase|@test\b|#\[\s*Test\b/, 'PHPUnit'], [/(?:^|[^\w$>])(?:it|test)\s*\(\s*['"]/m, 'Pest']],
  swift: [[/XCTestCase|@Test\b/, 'XCTest/Swift Testing']],
  dart: [[/(?:^|[^.\w])(?:test|testWidgets|group)\s*\(/m, 'package:test']],
  scala: [[/\b(?:AnyFunSuite|AnyFlatSpec|FunSuite|Specification)\b/, 'ScalaTest/specs2']],
};

const NAME_GLOBS = {
  csharp: ['**/*Tests.cs', '**/*Test.cs', '**/*Specs.cs', '**/*Spec.cs'],
  java: ['**/*Test.java', '**/*Tests.java', '**/*IT.java', '**/*Spec.java'],
  kotlin: ['**/*Test.kt', '**/*Tests.kt', '**/*Spec.kt'],
  javascript: ['**/*.{test,spec}.{js,jsx,mjs,cjs}', '**/__tests__/**/*.{js,jsx,mjs,cjs}'],
  typescript: ['**/*.{test,spec}.{ts,tsx,mts,cts}', '**/__tests__/**/*.{ts,tsx,mts,cts}'],
  python: ['**/test_*.py', '**/*_test.py', '**/tests/**/*.py'],
  go: ['**/*_test.go'],
  php: ['**/*Test.php', '**/tests/**/*.php'],
  swift: ['**/*Tests.swift', '**/*Test.swift'],
  dart: ['**/*_test.dart'],
  scala: ['**/*Spec.scala', '**/*Test.scala', '**/*Suite.scala'],
};

const EXCLUDES = ['**/bin/**', '**/obj/**', '**/node_modules/**', '**/dist/**', '**/build/**', '**/target/**', '**/vendor/**'];
const TEXT_EXT = /\.(cs|java|kt|kts|js|jsx|mjs|cjs|ts|tsx|mts|cts|py|go|php|swift|dart|scala|rb|rs|ex|exs|clj|fs|vb|cpp|cc|c|h|hpp|m|lua|r|sql|feature|robot)$/i;

// Classify where in the test the ID sits, so the user can see the convention in use.
function styleOf(lang, text, index) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const line = text.slice(lineStart, text.indexOf('\n', index) < 0 ? text.length : text.indexOf('\n', index)).trim();
  if (/^(\/\/|#(?!\[)|\*|\/\*)/.test(line)) return 'comment';
  if (/^\[.*\]$/.test(line) || /^#\[/.test(line)) return 'attribute';
  if (/^@/.test(line)) return 'annotation/decorator';
  if (/['"`][^'"`]*$/.test(text.slice(lineStart, index))) return 'string or docstring';
  if (/\b(?:def|func|fun|function|void|Task|async)\b/.test(line)) return 'method name';
  return 'other';
}

const rulesDir = path.join(root, 'business-rules');
const ruleIds = new Map();
try {
  for (const name of fs.readdirSync(rulesDir)) {
    if (!/\.md$/i.test(name) || /^readme\.md$/i.test(name)) continue;
    const text = fs.readFileSync(path.join(rulesDir, name), 'utf8');
    let cur = null;
    for (const line of text.split(/\r?\n/)) {
      const h = line.match(/^#{2,6}\s+(.*)$/);
      if (h) { const ids = findIds(h[1]); cur = ids.length && ids[0].index < 3 ? ids[0].id : null; if (cur) ruleIds.set(cur, 'unknown'); continue; }
      const retired = line.match(/\(\s*was\s+([^;)]+?)\s*;[^)]*retired/i);
      if (retired) for (const { id } of findIds(retired[1])) if (!ruleIds.has(id)) ruleIds.set(id, 'retired');
      const st = cur && line.match(/\*\*Status:?\*\*:?\s*`?([A-Za-z][A-Za-z-]*)/);
      if (st) ruleIds.set(cur, st[1].toLowerCase());
    }
  }
} catch { /* no rules folder */ }

const langs = {};
const taggedNonTest = [];
const idsInTests = new Map();
walk(root, f => {
  if (!TEXT_EXT.test(f)) return;
  let stat; try { stat = fs.statSync(f); } catch { return; }
  if (stat.size > 2_000_000) return;
  const text = fs.readFileSync(f, 'utf8');
  const lang = languageForExt(path.extname(f).toLowerCase());
  const markers = (TEST_MARKERS[lang] || []).filter(([re]) => re.test(text)).map(([, n]) => n);
  const relPath = rel(f);
  const looksTest = markers.length > 0 || /(^|\/)(tests?|specs?|__tests__)\//i.test(relPath) || /[._-](test|spec)s?\.[a-z]+$|Tests?\.[a-z]+$/i.test(relPath);
  const ids = findIds(text);
  if (!looksTest) { if (ids.length) taggedNonTest.push(`${relPath} (${[...new Set(ids.map(i => i.id))].join(', ')})`); return; }
  const L = langs[lang] || (langs[lang] = { files: [], tagged: [], frameworks: new Set(), styles: {} });
  L.files.push(relPath);
  markers.forEach(m => L.frameworks.add(m));
  if (!ids.length) return;
  L.tagged.push(relPath);
  for (const { id, index } of ids) {
    const s = styleOf(lang, text, index);
    L.styles[s] = (L.styles[s] || 0) + 1;
    if (!idsInTests.has(id)) idsInTests.set(id, []);
    idsInTests.get(id).push(`${relPath}:${text.slice(0, index).split('\n').length}`);
  }
});

const tests = [];
for (const [lang, L] of Object.entries(langs)) {
  if (!L.tagged.length) continue;
  const include = [];
  const covered = new Set();
  for (const g of NAME_GLOBS[lang] || []) {
    const re = globToRegExp(g);
    const hit = L.files.filter(f => re.test(f));
    if (hit.some(f => L.tagged.includes(f))) { include.push(g); hit.forEach(f => covered.add(f)); }
  }
  for (const f of L.tagged) {
    if (covered.has(f)) continue;
    const top = f.split('/')[0];
    const ext = path.extname(f);
    const g = f.includes('/') ? `${top}/**/*${ext}` : `*${ext}`;
    if (!include.includes(g)) include.push(g);
    const re = globToRegExp(g);
    L.files.filter(x => re.test(x)).forEach(x => covered.add(x));
  }
  tests.push({ language: LANGUAGES[lang] ? lang : 'file', include, exclude: EXCLUDES });
}

const unknown = [...idsInTests].filter(([id]) => !ruleIds.has(id)).map(([id, where]) => ({ id, where }));
const statusCount = {};
for (const s of ruleIds.values()) statusCount[s] = (statusCount[s] || 0) + 1;
const untested = [...ruleIds].filter(([id, s]) => !['draft', 'deprecated', 'retired'].includes(s) && !idsInTests.has(id)).map(([id, s]) => `${id} [${s}]`);

const report = {
  root: toPosix(root),
  rulesFolder: fs.existsSync(rulesDir) ? 'business-rules/' : null,
  rules: { total: ruleIds.size, byStatus: statusCount },
  languages: Object.fromEntries(Object.entries(langs).map(([lang, L]) => [lang, {
    supported: Boolean(LANGUAGES[lang]) && lang !== 'file',
    parser: (LANGUAGES[lang] || LANGUAGES.file).kind === 'file' ? 'whole file (no per-test parsing for this language)' : 'per test block',
    testFiles: L.files.length,
    taggedTestFiles: L.tagged,
    frameworks: [...L.frameworks],
    idPlacement: L.styles,
  }])),
  unknownIdsInTests: unknown,
  activeRulesWithoutTests: untested,
  idsOutsideTests: taggedNonTest,
  suggestedConfig: { rulesDir: 'business-rules', tests, protectSource: true, guardShell: true },
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
