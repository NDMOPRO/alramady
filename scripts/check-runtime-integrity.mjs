import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const rootDir = process.cwd();
const includeRoots = [
  resolve(rootDir, "services"),
  resolve(rootDir, "frontend", "app"),
  resolve(rootDir, "frontend", "components"),
  resolve(rootDir, "frontend", "state"),
  resolve(rootDir, "frontend", "lib"),
];

const denyPatterns = [
  /\bTODO\b/,
  /\bstub\b/i,
  /\bmocks?\b/i,
];

const allowedPathFragments = [
  "\\__tests__\\",
  "\\src\\tests\\",
  "\\e2e\\",
  "\\node_modules\\",
  "\\dist\\",
  "\\coverage\\",
  "\\docs\\",
  "\\src\\_app_legacy\\",
];

const findings = [];

function shouldSkip(path) {
  return allowedPathFragments.some((fragment) => path.includes(fragment));
}

function walk(path) {
  const entries = readdirSync(path);
  for (const entry of entries) {
    const fullPath = join(path, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (!shouldSkip(fullPath)) {
        walk(fullPath);
      }
      continue;
    }

    if (!/\.(ts|tsx|js|mjs)$/.test(fullPath) || shouldSkip(fullPath)) {
      continue;
    }

    const content = readFileSync(fullPath, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (denyPatterns.some((pattern) => pattern.test(line))) {
        findings.push(`${fullPath}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

for (const root of includeRoots) {
  walk(root);
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log("runtime-integrity:ok");
