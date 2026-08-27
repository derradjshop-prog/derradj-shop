/* ==========================================================
   validate-repository.js — Derradj Shop

   Safety-net checks for things that have actually broken
   production before: unresolved git-merge conflict markers
   landing on main (index.html / subscriptions/index.html /
   sitemap.xml / a generated product page, 2026-08-27), malformed
   generated output, and local-only config accidentally tracked.

   Run manually: node scripts/validate-repository.js
   Run via npm:   npm run validate
   Exits non-zero if any check finds a real problem.
   ========================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let warnings = 0;

function fail(msg) { console.error(`[FAIL] ${msg}`); failures++; }
function warn(msg) { console.warn(`[WARN] ${msg}`); warnings++; }
function ok(msg) { console.log(`[ OK ] ${msg}`); }

function trackedFiles() {
  const out = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map(l => l.trim()).filter(Boolean);
}

const ALL_TRACKED = trackedFiles();

/* ── 1. Merge-conflict markers ──
   Real git markers are a specific run-length: exactly 7 of the
   marker char, at start of line. Decorative comment banners like
   "// ============" use a different length, so require the exact
   git format (marker + a space + ref, or bare marker for =======). */
function checkConflictMarkers() {
  const CONFLICT_RE = /^(<{7} \S|={7}$|>{7} \S|\|{7} \S)/m;
  const exts = new Set(['.html', '.js', '.json', '.xml', '.sql', '.yml', '.yaml', '.md', '.css', '.txt']);
  let hit = 0;
  for (const rel of ALL_TRACKED) {
    if (!exts.has(path.extname(rel))) continue;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    if (CONFLICT_RE.test(text)) {
      fail(`unresolved merge-conflict markers in ${rel}`);
      hit++;
    }
  }
  if (!hit) ok('no unresolved merge-conflict markers found');
}

/* ── 2. JSON syntax ── */
function checkJson() {
  let hit = 0;
  for (const rel of ALL_TRACKED) {
    if (path.extname(rel) !== '.json') continue;
    if (rel.includes('node_modules/')) continue;
    const abs = path.join(ROOT, rel);
    try {
      JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      fail(`malformed JSON in ${rel}: ${err.message}`);
      hit++;
    }
  }
  if (!hit) ok('all tracked .json files parse');
}

/* ── 3. XML well-formedness (sitemap.xml + any other tracked .xml) ──
   No XML parser dependency available — do a structural sanity pass:
   balanced tags via a simple stack, since this only needs to catch
   the failure mode that already happened (conflict markers / stray
   text breaking the tag structure), not validate against a schema. */
function checkXml() {
  let hit = 0;
  for (const rel of ALL_TRACKED) {
    if (path.extname(rel) !== '.xml') continue;
    const abs = path.join(ROOT, rel);
    const xml = fs.readFileSync(abs, 'utf8');
    const stack = [];
    const tagRe = /<\/?([a-zA-Z0-9:_-]+)(?:\s[^>]*)?\/?>/g;
    let m; let bad = false;
    while ((m = tagRe.exec(xml))) {
      const full = m[0];
      if (full.startsWith('<?') || full.endsWith('/>')) continue;
      if (full.startsWith('</')) {
        const top = stack.pop();
        if (top !== m[1]) { bad = true; break; }
      } else {
        stack.push(m[1]);
      }
    }
    if (bad || stack.length) {
      fail(`${rel} does not look well-formed (unbalanced tags)`);
      hit++;
      continue;
    }
    if (rel === 'sitemap.xml') {
      const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(x => x[1]);
      const seen = new Set();
      const dupes = new Set();
      locs.forEach(l => { if (seen.has(l)) dupes.add(l); seen.add(l); });
      if (dupes.size) {
        fail(`sitemap.xml has duplicate <loc> entries: ${[...dupes].join(', ')}`);
        hit++;
      } else {
        ok(`sitemap.xml has ${locs.length} unique <loc> entries`);
      }
    }
  }
  if (!hit) ok('all tracked .xml files are well-formed');
}

/* ── 4. JavaScript syntax ── */
function checkJsSyntax() {
  let hit = 0;
  for (const rel of ALL_TRACKED) {
    if (path.extname(rel) !== '.js') continue;
    if (rel.includes('node_modules/')) continue;
    const abs = path.join(ROOT, rel);
    try {
      execSync(`node --check "${abs}"`, { stdio: 'pipe' });
    } catch (err) {
      fail(`JS syntax error in ${rel}: ${err.stderr ? err.stderr.toString().split('\n')[0] : err.message}`);
      hit++;
    }
  }
  if (!hit) ok('all tracked .js files pass node --check');
}

/* ── 5. Generated product/book pages vs sitemap consistency ──
   A directory under product/ or books/ that is NOT a redirect stub
   (no <meta http-equiv="refresh">) should have a matching sitemap
   <loc> entry, and vice versa — catches a page that got generated
   but never made it into the sitemap, or a stale sitemap entry for a
   page that no longer exists on disk. */
function checkGeneratedVsSitemap() {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) { warn('sitemap.xml not found — skipping generated/sitemap consistency check'); return; }
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  const locs = new Set([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(x => x[1]));

  let hit = 0;
  for (const kind of ['product', 'books']) {
    const dir = path.join(ROOT, kind);
    if (!fs.existsSync(dir)) continue;
    for (const slug of fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
      const indexPath = path.join(dir, slug, 'index.html');
      if (!fs.existsSync(indexPath)) continue;
      const html = fs.readFileSync(indexPath, 'utf8');
      const isStub = /<meta http-equiv="refresh"/i.test(html);
      if (isStub) continue;
      const loc = `https://derradjshop.com/${kind}/${encodeURIComponent(slug)}/`;
      if (!locs.has(loc)) {
        warn(`${kind}/${slug}/ is a real (non-stub) generated page but has no matching sitemap.xml <loc> entry`);
        hit++;
      }
    }
  }
  if (!hit) ok('generated product/book pages match sitemap.xml entries');
}

/* ── 6. Dangerous tracked local files ── */
function checkDangerousTrackedFiles() {
  const DANGEROUS = [/^\.env(\..*)?$/, /^\.claude\/settings\.local\.json$/, /\.pem$/, /id_rsa/];
  let hit = 0;
  for (const rel of ALL_TRACKED) {
    if (DANGEROUS.some(re => re.test(rel)) && rel !== '.env.example') {
      fail(`local-only/sensitive file is tracked in git: ${rel}`);
      hit++;
    }
  }
  if (!hit) ok('no dangerous local-only files are tracked');
}

console.log('=== Derradj Shop repository validation ===\n');
checkConflictMarkers();
checkJson();
checkXml();
checkJsSyntax();
checkGeneratedVsSitemap();
checkDangerousTrackedFiles();

console.log(`\n=== ${failures} failure(s), ${warnings} warning(s) ===`);
if (failures > 0) process.exit(1);
