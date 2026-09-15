import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Regression test for a real, confirmed production bug: opticalFlowWorker.ts
// hardcodes a CDN URL (`https://cdn.jsdelivr.net/npm/onnxruntime-web@<version>/dist/`)
// that MUST match the actual installed onnxruntime-web version exactly. It
// silently drifted to a stale "1.17.3" while the real dependency moved to
// 1.26.0 — the JS API (from 1.26.0) requested a WASM filename that doesn't
// exist in the CDN's 1.17.3 package, producing a plain 404 that surfaced to
// users as "no available backend found" / AI frame interpolation hanging
// with zero indication of the real cause. See docs/validation/STATUS.md.
//
// This test can't catch every possible drift (someone could bump the
// dependency and this hardcoded string in the same commit and still get it
// wrong), but it guarantees the two can never silently diverge over time,
// which is exactly how this bug actually happened.
describe('opticalFlowWorker.ts CDN version pinning', () => {
  it('the hardcoded onnxruntime-web CDN version matches the installed package version', () => {
    const workerSource = readFileSync(
      join(__dirname, '..', '..', 'src', 'workers', 'opticalFlowWorker.ts'),
      'utf-8',
    );
    const installedVersion = (
      JSON.parse(
        readFileSync(
          join(__dirname, '..', '..', 'node_modules', 'onnxruntime-web', 'package.json'),
          'utf-8',
        ),
      ) as { version: string }
    ).version;

    const match = workerSource.match(
      /cdn\.jsdelivr\.net\/npm\/onnxruntime-web@([\d.]+)\/dist\//,
    );
    expect(match, 'expected to find the wasmPaths CDN URL in opticalFlowWorker.ts').not.toBeNull();
    const hardcodedVersion = match![1];

    expect(
      hardcodedVersion,
      `opticalFlowWorker.ts's CDN version ("${hardcodedVersion}") no longer matches ` +
        `the installed onnxruntime-web version ("${installedVersion}") — update the ` +
        `hardcoded URL in opticalFlowWorker.ts to @${installedVersion} before this drifts ` +
        `into the exact same silent production failure it caused before.`,
    ).toBe(installedVersion);
  });
});
