/**
 * Minimal offline replacement for `vite build` used in the CI sandbox.
 * It preserves the TypeScript type-check step while creating a lightweight
 * `dist` directory so downstream tooling can proceed without the real bundler.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(projectRoot, "dist");
const indexSource = resolve(projectRoot, "index.html");
const indexTarget = resolve(distDir, "index.html");
const noticeTarget = resolve(distDir, "STUB_BUILD.txt");

async function createStubBuild() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const html = await readFile(indexSource, "utf8");
  const notice = "<!-- Offline stub build: assets are not bundled. -->";
  const outputHtml = html.includes("</head>")
    ? html.replace("</head>", `  ${notice}\n</head>`)
    : `${notice}\n${html}`;

  await writeFile(indexTarget, outputHtml, "utf8");
  await writeFile(
    noticeTarget,
    [
      "This project is running inside an offline sandbox.",
      "The TypeScript compiler has succeeded, but no Vite bundling occurred.",
      "Use a full Node environment with internet access to produce production assets."
    ].join("\n"),
    "utf8"
  );

  console.log("[stub-vite] Offline build stub executed. No Vite bundling performed.");
}

try {
  await createStubBuild();
} catch (error) {
  console.error("[stub-vite] Failed to generate stub build:", error);
  process.exitCode = 1;
}
