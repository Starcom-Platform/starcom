/**
 * Containment is a capability. These tests pin that it behaves like one.
 *
 * The property that matters: research about people proceeds normally and cannot
 * leak. Not "research is blocked" — the gate is on publication, and it was
 * always on publication. What is new is that the workspace now guarantees the
 * separation rather than relying on nobody having clicked the wrong thing.
 */
import { describe, it, expect } from 'vitest';
import {
  defaultContainment, release, mayLeaveWorkspace, explainContainment,
} from '../workspaceContainment';
import { evaluatePublication } from '../publicationPolicy';

describe('workspace containment', () => {
  it('holds person research by default, without blocking the research', () => {
    const c = defaultContainment('person');
    expect(c.contained).toBe(true);
    expect(c.reason).toBe('person-subject-default');
    // Nothing here refuses the work — only its onward transmission.
    expect(mayLeaveWorkspace(c)).toBe(false);
  });

  it('holds anything that opts in, and does not stand in front of anything else', () => {
    expect(mayLeaveWorkspace(defaultContainment('organization'))).toBe(false);
    expect(mayLeaveWorkspace(defaultContainment(undefined))).toBe(false);

    // Absent means NOT containment-managed, not "suspect". Material arriving
    // from paths with their own provenance and person gates is not made safer
    // by a third gate everyone has to remember — that is how safety machinery
    // gets routed around instead of used.
    expect(mayLeaveWorkspace(undefined)).toBe(true);
  });

  it('releases only with an attributed reason', () => {
    const good = release('jono', 'subject consented on the record 2026-08-20');
    // Asks the exported question rather than the internal type guard — a test
    // that reaches for a private helper is testing the implementation.
    expect(mayLeaveWorkspace(good)).toBe(true);
    expect(good.contained).toBe(false);

    // An unattributed release is indistinguishable from an accident afterwards.
    expect(mayLeaveWorkspace(release('', 'because'))).toBe(false);
    expect(mayLeaveWorkspace(release('jono', '   '))).toBe(false);
  });

  it('keeps release and publish as two decisions', () => {
    const released = release('jono', 'consented');
    // Released, and STILL refused at the person gate — deciding to stop
    // treating something as private is not deciding to broadcast it.
    const decision = evaluatePublication('person', {
      isMock: false, containment: released, subjectRole: 'public-office',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toContain('public office capacity');
  });

  it('refuses contained material above consent, not because of it', () => {
    // Consent granted, containment not lifted: still refused, and the reason
    // says why — this is not the person gate firing.
    const decision = evaluatePublication('person', {
      isMock: false,
      consentToPublishAboutPerson: true,
      containment: defaultContainment('person'),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toContain('workspace');
  });

  it('lets fully-decided person publication through', () => {
    const decision = evaluatePublication('person', {
      isMock: false,
      consentToPublishAboutPerson: true,
      subjectRole: 'public-office',
      containment: release('jono', 'source asked to be named'),
    });
    expect(decision.allowed).toBe(true);
  });

  it('explains what is true rather than what is forbidden', () => {
    const text = explainContainment(defaultContainment('person'));
    expect(text).toContain('without watching every keystroke');
    expect(text).not.toMatch(/forbidden|not allowed|prohibited/i);
  });
});
