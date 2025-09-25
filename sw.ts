/// <reference lib="webworker" />

export {};

declare const self: ServiceWorkerGlobalScope;

const STATIC_CACHE_NAME = "dragon-succession-static-v1";
const STATIC_ASSETS: readonly string[] = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png"
];

self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(cacheStaticAssets());
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(purgeLegacyCaches());
});

self.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheStaticAssets(): Promise<void> {
  const cache = await caches.open(STATIC_CACHE_NAME);
  await cache.addAll([...STATIC_ASSETS]);
  self.skipWaiting();
}

async function purgeLegacyCaches(): Promise<void> {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key !== STATIC_CACHE_NAME)
      .map((key) => caches.delete(key))
  );
  await self.clients.claim();
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    void cacheResponse(request, response.clone());
    return response;
  } catch (error) {
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function cacheResponse(request: Request, response: Response): Promise<void> {
  if (!response.ok || response.status === 206) {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  const cache = await caches.open(STATIC_CACHE_NAME);
  await cache.put(request, response);
}
