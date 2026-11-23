import type { IntelCaseUI } from '../../../types/intel/IntelCaseUI';

/**
 * Whether a case is one of MINE, for the purpose of raising attention about it.
 *
 * THIS IS NOT ACCESS CONTROL, and saying so plainly matters more than the code
 * below. Starcom is local-first: every case in the workspace is already on this
 * machine, readable by anyone who can open the devtools. A filter applied here
 * cannot keep a determined reader out of anything, and presenting it as though
 * it could would be exactly the sort of security theatre this codebase keeps
 * removing.
 *
 * What it IS: a relevance boundary. I.B.4 asks for "cross-case intersection
 * without leaking across collaborator boundaries", and the leak that actually
 * matters here is one of ATTENTION. If a case was shared into your workspace
 * so you could look at one thing, its contradictions should not start
 * appearing in your queue as work you owe — and, in the other direction, your
 * queue should not silently disclose which entities a colleague's case is
 * about by raising items that name them.
 *
 * Real confidentiality between collaborators requires the case never arriving
 * unencrypted in the first place, which is a transport and key-management
 * problem, not a filter.
 */

/** Everything that can make a case yours. Internal — callers use myCases(). */
function isMyCase(c: IntelCaseUI, actorId: string | null): boolean {
  // A public case is everyone's business by construction.
  if (c.permissions?.isPublic) return true;

  // No identity yet. Treat only public cases as mine, which fails CLOSED:
  // a quiet queue is recoverable, and a queue that surfaced a colleague's
  // subjects before we knew who we were is not.
  if (!actorId) return false;

  if (c.createdBy === actorId) return true;
  if (c.assignedTo?.includes(actorId)) return true;
  // Being named in a permission list used to count here too. Those lists were
  // removed (nothing enforced them), and a record saved before that still
  // carries one; it makes the case no more yours.
  return Boolean(c.collaborators?.some((collab) => collab.userId === actorId));
}

/** Cases this actor participates in. */
export function myCases(cases: IntelCaseUI[], actorId: string | null): IntelCaseUI[] {
  return cases.filter((c) => isMyCase(c, actorId));
}
