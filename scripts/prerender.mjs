import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { homeMarkup } from "../frontend/.prerender/prerender.js";

const build = new URL("../frontend/dist/", import.meta.url);
const template = await readFile(new URL("index.html", build), "utf8");
if (!template.includes('<div id="root"></div>')) throw new Error("Missing empty application root in client template");
let html = template.replace('<div id="root"></div>', `<div id="root">${homeMarkup}</div>`);
// Inline the small compressed page stylesheet to avoid a first-paint waterfall.
const stylesheet = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!stylesheet) throw new Error("Missing built stylesheet");
const css = await readFile(new URL(stylesheet[1].replace(/^\//, ""), build), "utf8");
const inlineCss = css.replace(/url\((["']?)\.\//g, "url($1/assets/");
html = html.replace(stylesheet[0], `<style>${inlineCss}</style>`);
const font = (await readdir(new URL("assets/", build))).find(name => /^outfit-latin-wght-normal-.*\.woff2$/.test(name));
if (!font) throw new Error("Missing local headline font");
html = html.replace("</head>", `<link rel="preload" href="/assets/${font}" as="font" type="font/woff2" crossorigin></head>`);
const destination = new URL("home.html", build);
await writeFile(destination, html);
console.log(`Pre-rendered lunar home page: ${fileURLToPath(destination)}`);
