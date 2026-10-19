import { readdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.resolve(projectRoot, process.argv[2] || "dist/build/mp-weixin");
const manifest = JSON.parse(await readFile(path.join(projectRoot, "src/manifest.json"), "utf8"));
const project = JSON.parse(await readFile(path.join(directory, "project.config.json"), "utf8"));
const appid = manifest["mp-weixin"]?.appid;
if (!/^wx[\da-f]{16}$/.test(appid || "") || project.appid !== appid)
  throw new Error("WeChat AppID is missing or differs from src/manifest.json mp-weixin.appid.");
const browserTags = new Set(["html", "body", "uni-page-head"]);
const browserStates = new Set([":root", ":hover", ":focus", ":focus-visible"]);
const problems = [];
let count = 0;

async function verifyDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await verifyDirectory(file);
    else if (entry.isFile() && file.endsWith(".wxss")) {
      count++;
      const stylesheet = postcss.parse(await readFile(file, "utf8"), { from: file });
      stylesheet.walkRules((rule) => {
        // Keyframe steps such as `50%` are not element selectors.
        for (let parent = rule.parent; parent; parent = parent.parent)
          if (parent.type === "atrule" && /keyframes$/i.test(parent.name)) return;
        selectorParser((selectors) => selectors.walk((node) => {
          if (node.type === "universal" ||
              node.type === "tag" && browserTags.has(node.value) ||
              node.type === "pseudo" && browserStates.has(node.value))
            problems.push(`${path.relative(projectRoot, file)}: ${rule.selector}`);
        })).processSync(rule.selector);
      });
    }
  }
}

await verifyDirectory(directory);
if (!count) throw new Error(`No WXSS files found in ${directory}`);
if (problems.length)
  throw new Error(`WXSS contains universal or browser-only selectors. Use H5 conditional styles or mini-program elements:\n${[...new Set(problems)].join("\n")}`);
function gitValue(args) {
  try { return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}
const status = gitValue(["status", "--porcelain", "--untracked-files=normal"]);
await writeFile(path.join(directory, "build-info.json"), JSON.stringify({
  version: manifest.versionName,
  sourceCommit: gitValue(["rev-parse", "HEAD"]),
  sourceHasLocalChanges: status === null ? null : Boolean(status),
  appid,
  platform: "mp-weixin",
  generatedAt: new Date().toISOString(),
  checks: ["manifest-appid", "wxss-selectors"],
}, null, 2) + "\n");
console.log(`WeChat AppID and selector check passed (${count} WXSS files). Build origin saved in build-info.json.`);
