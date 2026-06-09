import * as esbuild from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await esbuild.build({
  entryPoints: {
    content: "src/entries/content-entry.js",
    popup: "src/entries/popup-entry.js"
  },
  bundle: true,
  minify: true,
  sourcemap: false,
  legalComments: "none",
  format: "iife",
  target: ["chrome114"],
  outdir: "dist"
});

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
manifest.action.default_popup = "popup.html";
manifest.content_scripts = manifest.content_scripts.map((script) => ({
  ...script,
  js: ["content.js"]
}));
await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

let popupHtml = await readFile("src/popup/popup.html", "utf8");
popupHtml = popupHtml.replace(
  /<script src="\.\.\/common\/excel\.js"><\/script>\s*<script src="popup-content-script-files\.js"><\/script>\s*<script src="popup\.js"><\/script>/,
  '<script src="popup.js"></script>'
);
await writeFile("dist/popup.html", popupHtml);

await copyFile("src/popup/styles.css", "dist/styles.css");
