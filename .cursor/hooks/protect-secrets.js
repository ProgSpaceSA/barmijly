#!/usr/bin/env node
/**
 * beforeReadFile — deny .env and credential files.
 * beforeShellExecution — block committing secrets and destructive git.
 */
function readStdin() {
  return new Promise((resolve) => {
    let raw = "";
    if (process.stdin.isTTY) return resolve("{}");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => resolve(raw || "{}"));
  });
}

const DENY_READ = [
  /(^|[\\/])\.env$/i,
  /(^|[\\/])\.env\.[^\\/]+$/i,
  /credentials\.json$/i,
  /[\\/]uploads[\\/]/i,
  /\.sql\.gz$/i,
];

function deny(message) {
  process.stdout.write(
    JSON.stringify({ permission: "deny", user_message: message })
  );
  process.exit(0);
}

function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
  process.exit(0);
}

(async () => {
  let data = {};
  try {
    data = JSON.parse(await readStdin());
  } catch {
    allow();
  }

  const filePath = data.file_path || "";
  if (filePath && DENY_READ.some((re) => re.test(filePath))) {
    if (!/\.env\.example$/i.test(filePath)) {
      deny("Blocked: do not read .env, credentials, uploads, or backup files.");
    }
  }

  const command = data.command || "";
  if (command) {
    const lower = command.toLowerCase();
    if (/(^|[;&|]\s*)git\s+push\s+.*--force/.test(lower) || /git\s+push\s+-f\b/.test(lower)) {
      deny("Blocked: force-push is not allowed unless the user explicitly requests it.");
    }
    if (/git\s+commit/.test(lower) && /\.env\b/.test(lower) && !/\.env\.example/.test(lower)) {
      deny("Blocked: do not commit .env files.");
    }
    if (/git\s+(reset\s+--hard|clean\s+-fd)/.test(lower)) {
      deny("Blocked: destructive git reset/clean requires an explicit user request.");
    }
  }

  allow();
})();
