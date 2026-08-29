import { parseCodeQuery } from '../testing/test-code';

/**
 * Display ids for the meetings surface, in the same shape as `BRM-0142` and
 * `BUG-0114` so every board reads as one system: `MTG-0007` for a meeting,
 * `REQ-0114` for a requirement.
 */
export function formatMeetingCode(meetingNumber: number): string {
  return `MTG-${String(meetingNumber).padStart(4, '0')}`;
}

export function formatRequirementCode(requirementNumber: number): string {
  return `REQ-${String(requirementNumber).padStart(4, '0')}`;
}

export const parseMeetingNumberQuery = (raw: string) => parseCodeQuery(raw, 'MTG');
export const parseRequirementNumberQuery = (raw: string) => parseCodeQuery(raw, 'REQ');
