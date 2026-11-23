/**
 * The ψ field's looks on the rail (critique-2026-11-01, plan B5): bound to Psi Watch's kept looks, so the panel and
 * the rail never disagree; setting a new set turns the wanted ones on before the rest off, as the store keeps one on.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRailBindings } from '../railBindings';
import { getPsiFieldLooks, resetPsiFieldLooksForTests } from '../../../../services/psiWatch/psiField/psiFieldLooks';

describe("the ψ field's looks on the rail", () => {
  beforeEach(() => { localStorage.clear(); resetPsiFieldLooksForTests(); });

  it('reads the kept looks, and sets a whole new set, even one sharing none with the old', () => {
    const { result } = renderHook(() => useRailBindings('PsiModel'));
    expect(result.current['psi:looks'].value).toEqual(['heat', 'contours']);
    act(() => result.current['psi:looks'].set(['relief']));
    expect(getPsiFieldLooks()).toEqual({ heat: false, contours: false, relief: true, flow: false });
    expect(result.current['psi:looks'].value).toEqual(['relief']);
    expect(JSON.parse(localStorage.getItem('starcom:psi-field-looks') ?? '{}')).toMatchObject({ relief: true, heat: false });
  });
});
