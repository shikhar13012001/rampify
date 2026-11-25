import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Linux-CI guard. This repo is developed on Windows, whose filesystem is
 * case-insensitive: `import './ExportEngine'` happily resolves a file named
 * `exportEngine.ts`. On the case-sensitive Linux runners CI uses, that import
 * fails. This test resolves every relative import against the EXACT on-disk
 * casing so the mistake is caught here, on the developer's machine.
 */
const root = process.cwd();
const SCAN_DIRS = ['src', 'api', 'scripts', 'test'];
const SKIP = new Set(['node_modules', 'artifacts', '__pycache__', 'fixtures']);
const EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '.css'];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const dirCache = new Map<string, Set<string>>();
function names(dir: string): Set<string> {
  let set = dirCache.get(dir);
  if (!set) {
    try { set = new Set(readdirSync(dir)); } catch { set = new Set(); }
    dirCache.set(dir, set);
  }
  return set;
}

/** True only if every path segment exists with exactly this casing. */
function existsExact(absolute: string): boolean {
  const rel = relative(root, absolute);
  if (rel.startsWith('..')) return true; // outside the repo: not ours to judge
  let current = root;
  for (const segment of rel.split(sep)) {
    if (!names(current).has(segment)) return false;
    current = join(current, segment);
  }
  return true;
}

function existsAnyCase(absolute: string): boolean {
  try { statSync(absolute); return true; } catch { return false; }
}

const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

describe('relative imports resolve with exact filename casing (Linux CI safety)', () => {
  it('has no case-only mismatches', () => {
    const problems: string[] = [];
    for (const dir of SCAN_DIRS) {
      let files: string[];
      try { files = listFiles(join(root, dir)); } catch { continue; }
      for (const file of files) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(IMPORT)) {
          const specifier = match[1].split('?')[0];
          const base = resolve(dirname(file), specifier);
          const candidates = [
            ...EXTS.map((e) => base + e),
            base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'),
            ...['index.ts', 'index.tsx', 'index.js'].map((i) => join(base, i)),
          ];
          const exact = candidates.some(existsExact);
          const anyCase = candidates.some(existsAnyCase);
          // Only flag "resolves here on a case-insensitive FS, but not on Linux".
          if (!exact && anyCase) problems.push(`${relative(root, file)} -> ${specifier}`);
        }
      }
    }
    expect(problems, 'These imports only resolve on a case-insensitive filesystem').toEqual([]);
  });
});
