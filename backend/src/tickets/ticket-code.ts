/** Same display id the app uses (`BRM-0031`). */
export function formatTicketCode(ticketNumber: number): string {
  return `BRM-${String(ticketNumber).padStart(4, '0')}`;
}

/**
 * Parse a ticket-number query: `BRM-0124`, `#124`, `124`.
 * Returns null when the string is not a ticket-code shape.
 */
export function parseTicketNumberQuery(raw: string): number | null {
  const q = raw.trim().replace(/\s/g, '');
  if (!q) return null;

  const brm = /^BRM-(\d+)$/i.exec(q);
  if (brm) {
    const n = Number.parseInt(brm[1], 10);
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
