# Dragon Succession

Phaser 3 + TypeScript prototype bootstrapped with Vite. The project now ships with a progressive web app manifest, offline-first service worker, and an optional Electron shell for desktop packaging.

## Development

```bash
npm install
npm run dev
```

The dev server exposes the game at `http://localhost:5173` and automatically reloads on source changes.

## Building

This repository runs in an offline sandbox, so `npm run build` performs strict type-checking and then generates a lightweight `dist` placeholder via `scripts/offline-vite-stub.mjs`.

```bash
npm run build
```

To produce a full production bundle with the service worker, run `npm run build` inside a fully enabled Node.js environment and replace the stub script with `vite build`.

After building you can preview the static output:

```bash
npm run preview
```

## Progressive Web App

- `public/manifest.webmanifest` describes the app metadata, colors, and icons used when installing to a device.
- `sw.ts` implements a minimal cache-first service worker compiled by Vite. During production builds the worker pre-caches shell assets and keeps them fresh across updates.
- `src/utils/registerServiceWorker.ts` safely registers the worker after the Phaser game boots (production-only).

The Vite configuration exposes the `public` directory, emits the service worker, and groups hashed assets under `dist/assets`.

## Electron Desktop Shell (Optional)

A minimal Electron entry point lives in `electron/main.ts`. It loads the Vite dev server during development and the built `dist/index.html` in production. To experiment locally:

```bash
# Requires Electron installed globally or via npx
npx electron electron/main.ts
```

When packaging, build the web client first and then point your preferred Electron bundler (e.g. `electron-builder`) at `electron/main.ts`.

## Asset Pipeline

No external art assets are committed. Runtime graphics should continue to be generated via `Phaser.GameObjects.Graphics#generateTexture` or other procedural methods.

## PWA Testing Checklist

1. Run `npm run build` followed by `npm run preview`.
2. Open the preview URL and inspect the Application tab in devtools.
3. Verify the manifest loads, icons render, and the service worker caches shell files.
