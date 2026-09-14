/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Injected at build time by vite.config.ts / vitest.config.ts `define` — the
// package.json version, so analytics events can report which build sent them.
declare const __APP_VERSION__: string;

interface Window {
  /** Set via Playwright's page.add_init_script() ONLY by
   *  test/skyvern/run_export_test.py, before any app code runs. Never set
   *  in a normal browser session. See src/lib/firebase.ts. */
  __RAMPIFY_EMULATOR_TEST__?: boolean;
}
