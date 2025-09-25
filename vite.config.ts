import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(rootDir, "src");
const publicDir = path.resolve(rootDir, "public");
const serviceWorkerEntry = path.resolve(rootDir, "sw.ts");

export default defineConfig({
  root: rootDir,
  publicDir,
  resolve: {
    alias: {
      "@": srcDir
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    open: false
  },
  build: {
    outDir: path.resolve(rootDir, "dist"),
    assetsDir: "assets",
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: {
        main: path.resolve(rootDir, "index.html"),
        sw: serviceWorkerEntry
      }
    }
  }
});
