// Copies MapLibre's background worker into /public so the address map can load
// it (the bundler doesn't emit it). Runs after every install, on Netlify too.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
const src = "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs";
if (existsSync(src)) {
  mkdirSync("public/vendor", { recursive: true });
  copyFileSync(src, "public/vendor/maplibre-gl-worker.mjs");
  console.log("copied map worker to public/vendor");
}
