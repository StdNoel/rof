import { defineConfig, type Plugin } from "vite";
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The quiz fetches its data with root-relative URLs ("data/..."), and the
 * data/ folder must stay at the repository root. Vite's dev server already
 * serves files under the project root, so this plugin only has to mirror
 * data/ into the build output.
 */
function copyDataDir(): Plugin {
  return {
    name: "rof-copy-data",
    apply: "build",
    closeBundle() {
      const src = resolve(process.cwd(), "data");
      const dest = resolve(process.cwd(), "dist", "data");
      if (existsSync(src)) {
        cpSync(src, dest, { recursive: true });
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/rof/" : "/",
  plugins: [copyDataDir()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        minigames: resolve(process.cwd(), "minigames/index.html"),
        darts: resolve(process.cwd(), "darts/index.html"),
        runner: resolve(process.cwd(), "midnight-runner/index.html"),
        tetris: resolve(process.cwd(), "tetris-protocol/index.html"),
        lux: resolve(process.cwd(), "lux/index.html"),
        credits: resolve(process.cwd(), "credits.html"),
      },
    },
  },
}));
