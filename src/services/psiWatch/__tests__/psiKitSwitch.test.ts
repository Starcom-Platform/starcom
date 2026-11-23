/**
 * Psi Watch's switch (decision D-PW, PW12 and PW19; open to everyone from 1 Nov, OR6): shown unless ?psi=off hid it
 * in this tab, shown again with ?psi=kit, the choice kept for the tab.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { psiKitOn } from '../psiKitSwitch';
import { primaryRailModes } from '../../../components/HUD/Bars/CyberCommandRails/railModeConfig';

const at = (search: string) => window.history.replaceState(null, '', `/${search}`);

describe('psiKitOn', () => {
  beforeEach(() => { window.sessionStorage.clear(); at(''); });

  it('is on for everyone, with or without the old link', () => {
    expect(psiKitOn()).toBe(true);
    at('?psi=kit');
    expect(psiKitOn()).toBe(true);
    at('?psi=yes');
    expect(psiKitOn()).toBe(true);
  });

  it('turns off with ?psi=off and stays off for the tab when the link moves on', () => {
    at('?psi=off');
    expect(psiKitOn()).toBe(false);
    at('?mode=CyberCommand');
    expect(psiKitOn()).toBe(false);
  });

  it('turns on again with ?psi=kit', () => {
    at('?psi=off');
    psiKitOn();
    at('?psi=kit');
    expect(psiKitOn()).toBe(true);
    at('');
    expect(psiKitOn()).toBe(true);
  });

  it('puts Psi Watch on the rail only with the switch on', () => {
    expect(primaryRailModes(false).map((m) => m.mode)).not.toContain('PsiWatch');
    expect(primaryRailModes(true).map((m) => m.mode).at(-1)).toBe('PsiWatch');
  });
});
