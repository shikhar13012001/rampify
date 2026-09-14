/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Injected at build time by vite.config.ts / vitest.config.ts `define` — the
// package.json version, so analytics events can report which build sent them.
declare const __APP_VERSION__: string;
