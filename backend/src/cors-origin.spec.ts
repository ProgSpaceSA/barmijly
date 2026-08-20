import { isAllowedCorsOrigin } from './cors-origin';

describe('isAllowedCorsOrigin', () => {
  it('allows a missing origin (curl, server-to-server)', () => {
    expect(isAllowedCorsOrigin(undefined, { isDev: false, frontendUrl: 'https://barmijly.ai' })).toBe(true);
  });

  it('allows the configured frontend URL in production', () => {
    expect(isAllowedCorsOrigin('https://barmijly.ai', { isDev: false, frontendUrl: 'https://barmijly.ai' })).toBe(true);
  });

  it('rejects a random origin in production', () => {
    expect(isAllowedCorsOrigin('http://localhost:3005', { isDev: false, frontendUrl: 'https://barmijly.ai' })).toBe(false);
  });

  it('allows any localhost port in development', () => {
    expect(isAllowedCorsOrigin('http://localhost:3005', { isDev: true, frontendUrl: 'http://localhost:3000' })).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1:3005', { isDev: true, frontendUrl: 'http://localhost:3000' })).toBe(true);
  });
});
