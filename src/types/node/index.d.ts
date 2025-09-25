declare module "path" {
  function join(...segments: string[]): string;
  function dirname(path: string): string;
  export { dirname, join };
}

declare module "url" {
  function fileURLToPath(url: string | URL): string;
  function pathToFileURL(path: string): URL;
  export { fileURLToPath, pathToFileURL };
}

declare const process: {
  readonly platform: string;
  env: Record<string, string | undefined>;
};
