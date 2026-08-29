import { BadRequestException } from '@nestjs/common';
import type { TicketScopeRef } from '../access/access.service';

/** Exactly one of these is ever set — a comment hangs off one parent. */
export interface CommentParentRef {
  ticketId?: string | null;
  requirementId?: string | null;
}

export type CommentParentKind = 'ticket' | 'requirement';

/**
 * A thread parent, flattened to the handful of things the comment flow needs.
 *
 * `scope` is deliberately a `TicketScopeRef`: mention filtering asks "can this
 * person reach the thing being discussed", and that question has one answer
 * shape whether the thing is a ticket or a requirement. A requirement with no
 * system yet carries `systemId: null`, which `filterMentionable` reads as "no
 * system membership counts here" rather than as an error.
 */
export interface ResolvedCommentParent {
  kind: CommentParentKind;
  id: string;
  title: string;
  number: number;
  scope: TicketScopeRef;
  /** Who owns the thread and hears about a new comment on it. */
  notifyUserIds: string[];
  url: string;
  companyName?: string | null;
  systemName?: string | null;
}

/** Reads the single parent out of a route's params, or refuses. */
export function pickParent(ref: CommentParentRef): {
  kind: CommentParentKind;
  id: string;
} {
  if (ref.ticketId && ref.requirementId) {
    throw new BadRequestException('A comment belongs to one parent, not two');
  }
  if (ref.ticketId) return { kind: 'ticket', id: ref.ticketId };
  if (ref.requirementId) return { kind: 'requirement', id: ref.requirementId };
  throw new BadRequestException('Must provide ticketId or requirementId');
}
