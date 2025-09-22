import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(rootDir, "src");

export default defineConfig({
  root: rootDir,
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
    emptyOutDir: true,
    target: "esnext"
  }
});
