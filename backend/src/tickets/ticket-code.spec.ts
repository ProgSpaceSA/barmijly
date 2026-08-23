import { formatTicketCode, parseTicketNumberQuery } from './ticket-code';

describe('ticket-code', () => {
  it('formats with a four-digit pad', () => {
    expect(formatTicketCode(124)).toBe('BRM-0124');
  });

  it('parses BRM codes case-insensitively', () => {
    expect(parseTicketNumberQuery('BRM-0124')).toBe(124);
    expect(parseTicketNumberQuery('brm-0124')).toBe(124);
  });

  it('parses hash and bare numbers', () => {
    expect(parseTicketNumberQuery('#124')).toBe(124);
    expect(parseTicketNumberQuery('124')).toBe(124);
  });

  it('returns null for title-like text', () => {
    expect(parseTicketNumberQuery('فاتورة')).toBeNull();
    expect(parseTicketNumberQuery('BRM-abc')).toBeNull();
  });
});
