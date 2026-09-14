// Fails if the engine reaches outside itself: no UI/CLI imports, no browser or Node globals.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../packages/engine/src", import.meta.url).pathname;
const banned = [
  /from\s+["']@natural\/(ui|cli)/,
  /from\s+["']node:/,
  /from\s+["']fs["']/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bprocess\.env\b/,
];
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) files.push(p);
  }
})(root);
let bad = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const re of banned) {
    if (re.test(src)) {
      console.error(`boundary violation in ${f}: ${re}`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log(`engine boundary ok (${files.length} files)`);
