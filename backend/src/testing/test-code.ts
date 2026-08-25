/**
 * Display ids for the QA surface, in the same shape as `BRM-0142` so the two
 * read as one system: `TS-0007` for a suite, `TC-0114` for a case, `BUG-0114`
 * for a bug.
 */
export function formatSuiteCode(suiteNumber: number): string {
  return `TS-${String(suiteNumber).padStart(4, '0')}`;
}

export function formatCaseCode(caseNumber: number): string {
  return `TC-${String(caseNumber).padStart(4, '0')}`;
}

export function formatBugCode(bugNumber: number): string {
  return `BUG-${String(bugNumber).padStart(4, '0')}`;
}

/**
 * Parse a code query for one prefix: `TS-0007`, `#7`, `7`.
 * Returns null when the string is not that code's shape, so the caller can fall
 * back to a plain text search rather than returning nothing.
 */
export function parseCodeQuery(raw: string, prefix: string): number | null {
  const q = raw.trim().replace(/\s/g, '');
  if (!q) return null;

  const prefixed = new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(q);
  if (prefixed) {
    const n = Number.parseInt(prefixed[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  const hash = /^#(\d+)$/.exec(q);
  if (hash) {
    const n = Number.parseInt(hash[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  if (/^\d+$/.test(q)) {
    const n = Number.parseInt(q, 10);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

export const parseSuiteNumberQuery = (raw: string) => parseCodeQuery(raw, 'TS');
export const parseCaseNumberQuery = (raw: string) => parseCodeQuery(raw, 'TC');
export const parseBugNumberQuery = (raw: string) => parseCodeQuery(raw, 'BUG');
