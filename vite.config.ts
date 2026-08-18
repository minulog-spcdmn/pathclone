import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * DESIGN.md §12.2 makes the header strategy an M0 decision, not an M5
 * discovery:
 *
 *   "Use SharedArrayBuffer for zero-copy state transfer — note this requires
 *    COOP/COEP headers on all served assets, which constrains third-party
 *    embeds and must be settled in Milestone 0, not discovered in Milestone 5."
 *
 * So they are set here, from the first day, on both the dev server and the
 * preview server. The consequence the design warns about is real and worth
 * writing down: with `require-corp` in force, nothing cross-origin loads unless
 * it opts in with CORP or CORS headers. No CDN fonts, no third-party analytics,
 * no embedded widgets, and the page cannot be framed by an ordinary site. That
 * is the price of `SharedArrayBuffer`, and §12.2's threading plan needs it.
 *
 * These headers must be reproduced by whatever actually serves the built files
 * in production; a static host that cannot set them will silently cost the
 * project its worker threading model.
 */
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export default defineConfig({
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        // Cinderfall, the ARPG this repository already held.
        main: resolve(import.meta.dirname, "index.html"),
        // The substrate arena described in docs/DESIGN.md §4.4.
        arena: resolve(import.meta.dirname, "arena.html"),
      },
    },
  },
});
