#!/usr/bin/env node
/**
 * afterFileEdit / afterTabFileEdit — format backend TypeScript with Prettier.
 * Fail-open: missing prettier or non-backend files are ignored.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function readStdin() {
  return new Promise((resolve) => {
    let raw = "";
    if (process.stdin.isTTY) return resolve("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => resolve(raw));
  });
}

(async () => {
  const raw = await readStdin();
  let filePath = "";
  try {
    filePath = JSON.parse(raw || "{}").file_path || "";
  } catch {
    process.exit(0);
  }

  if (!filePath) process.exit(0);

  const ext = path.extname(filePath);
  if (![".ts", ".js", ".json"].includes(ext)) process.exit(0);
  if (/node_modules|\.next|[\\/]dist[\\/]|uploads/.test(filePath)) process.exit(0);
  if (!/[\\/]backend[\\/]/.test(filePath)) process.exit(0);

  const root = path.resolve(__dirname, "../..");
  const prettier = path.join(root, "backend", "node_modules", "prettier", "bin", "prettier.cjs");
  if (!fs.existsSync(prettier) || !fs.existsSync(filePath)) process.exit(0);

  spawnSync(process.execPath, [prettier, "--write", "--log-level", "silent", filePath], {
    stdio: "ignore",
    windowsHide: true,
  });
  process.exit(0);
})();
