import path from "node:path";

/**
 * Commit hook: lint only the staged files, not the whole monorepo.
 *
 * Uses `node …/eslint.js` + an explicit `--config` so it works on Windows
 * cmd (Husky) without `cd` / Unix bin shims.
 */
function eslintIn(pkgDir, files) {
  const root = path.resolve(pkgDir);
  const abs = files
    .map((file) => path.resolve(file))
    .filter((file) => file === root || file.startsWith(root + path.sep));
  if (!abs.length) return [];

  const eslintJs = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
  const config = path.join(root, "eslint.config.mjs");
  const args = abs.map((file) => JSON.stringify(file)).join(" ");

  return [
    `node ${JSON.stringify(eslintJs)} --config ${JSON.stringify(config)} --quiet ${args}`,
  ];
}

export default {
  "backend/**/*.{ts,js,mjs}": (files) => eslintIn("backend", files),
  "frontend/**/*.{ts,tsx,js,jsx,mjs}": (files) => eslintIn("frontend", files),
};
