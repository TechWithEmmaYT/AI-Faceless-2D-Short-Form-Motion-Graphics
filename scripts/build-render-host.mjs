// Builds the sandboxed render host: public/render-host/index.html (host script inlined, renderer
// worker embedded as a string) plus the two font files the studio hands to it. Runs before `dev`
// and `build` (package.json predev/prebuild); run it by hand after changing lib/render:
//   npm run build:render-host
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);
const out = path.resolve("public/render-host");
mkdirSync(path.join(out, "fonts"), { recursive: true });

const common = { bundle: true, write: false, format: "iife", platform: "browser", target: "es2022", minify: true, legalComments: "none" };

const worker = buildSync({ ...common, entryPoints: ["lib/render/host/worker.ts"] }).outputFiles[0].text;
const host = buildSync({
  ...common,
  entryPoints: ["lib/render/host/host.ts"],
  define: { __WORKER_SOURCE__: JSON.stringify(worker) },
}).outputFiles[0].text;

// Same policy as next.config.ts sends in headers; repeated here so the file is safe on its own.
// 'unsafe-eval' lets agent code compile; containment comes from the sandbox (opaque origin) and
// connect-src 'none' (no fetch, XHR, WebSocket or beacons), not from blocking eval.
const csp = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "worker-src blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data: blob:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">
<title>MotionStudio render host</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{display:block;width:100%;height:100%}</style>
</head><body><script>${host.replace(/<\/script/gi, "<\\/script")}</script></body></html>
`;
writeFileSync(path.join(out, "index.html"), html);

const fonts = {
  "inter.woff2": "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  "jetbrains-mono.woff2": "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
};
for (const [name, spec] of Object.entries(fonts)) copyFileSync(require.resolve(spec), path.join(out, "fonts", name));

console.log(`render host built: index.html ${(html.length / 1024).toFixed(1)} KB (worker ${(worker.length / 1024).toFixed(1)} KB)`);
