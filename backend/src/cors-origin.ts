const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Browser Origin, or undefined for same-origin / non-browser clients. */
export function isAllowedCorsOrigin(
  origin: string | undefined,
  opts: { isDev: boolean; frontendUrl?: string },
): boolean {
  if (!origin) return true;
  const configured = opts.frontendUrl?.replace(/\/$/, '');
  if (configured && origin === configured) return true;
  return opts.isDev && LOCAL_ORIGIN.test(origin);
}
