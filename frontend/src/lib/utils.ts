import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Same display id the app and digest emails use (`BRM-0031`). */
export function formatTicketCode(ticketNumber: number | null | undefined): string | null {
  if (ticketNumber == null) return null;
  return `BRM-${String(ticketNumber).padStart(4, "0")}`;
}

/**
 * QA display ids, in the same shape as `BRM-0142` so the two read as one
 * system. Mirrors `backend/src/testing/test-code.ts`.
 */
function padCode(prefix: string, n: number | null | undefined): string | null {
  if (n == null) return null;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

export const formatSuiteCode = (n: number | null | undefined) => padCode("TS", n);
export const formatCaseCode = (n: number | null | undefined) => padCode("TC", n);
export const formatBugCode = (n: number | null | undefined) => padCode("BUG", n);

/** Meetings surface — mirrors `backend/src/meetings/meeting-code.ts`. */
export const formatMeetingCode = (n: number | null | undefined) => padCode("MTG", n);
export const formatRequirementCode = (n: number | null | undefined) => padCode("REQ", n);

/** Human file size for attachment chips (`1.4 MB`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Stable avatar tint per user, so the same person keeps the same colour. */
const AVATAR_TINTS = ["#4F46E5", "#8B5CF6", "#0EA5E9", "#0D9488", "#F59E0B", "#E11D48"];

export function avatarTint(seed: string | undefined | null): string {
  if (!seed) return AVATAR_TINTS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}
