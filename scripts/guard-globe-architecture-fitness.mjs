#!/usr/bin/env node
// @asserts The globe interactivity refactor declared in ADR-0002 has landed, and Enhanced3DGlobeInteractivity stays within its line and effect budgets.
/*
 * ─── STATUS: GREEN SINCE 2026-10-24, AND IN `npm run guards` ────────────────
 *
 * This guard encodes the TARGET state of ADR-0002's globe interactivity
 * refactor. It was committed in 8ec0754d alongside the ADR, and stayed red for
 * two months while the refactor did not follow, listed in guard-gate-coverage.mjs
 * as failing on purpose. On 2026-10-24 (D-GV GV0.4) the last three extractions
 * landed: the hover raycast, the click-and-drag handling and the popup flow,
 * each a hook under src/features/globe/interaction/, joining the cursor trail,
 * the model screen projection and the RLSH selection memory before them.
 *
 * DO NOT "fix" a future failure by relaxing the limits. The numbers are the ADR's
 * judgement about a file that had already grown past what one component should
 * hold, and moving them to match the code would delete the only record of that
 * decision. Extract instead.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const interactivityPath = path.join(repoRoot, 'src', 'components', 'Globe', 'Enhanced3DGlobeInteractivity.tsx');
const globePath = path.join(repoRoot, 'src', 'components', 'Globe', 'Globe.tsx');

const MAX_INTERACTIVITY_LINES = 900;
const MAX_INTERACTIVITY_EFFECTS = 10;

const REQUIRED_IMPORT_SNIPPETS = [
  "from '../../features/globe/interaction/useIntelRlshPopupFlow'",
  "from '../../features/globe/interaction/usePointerClickDrag'",
  "from '../../features/globe/interaction/useHoverRaycastMove'",
  "from '../../features/globe/rendering/useCursorTrail3D'",
  "from '../../features/globe/rendering/useModelScreenProjection'",
  "from '../../features/globe/rlsh/useSelectionMemory'"
];

const FORBIDDEN_INLINE_SNIPPETS = [
  'const handleUnifiedMouseMove = useCallback(',
  'const handleUnifiedMouseDown = useCallback(',
  'const handleUnifiedMouseUp = useCallback(',
  /*
   * No trailing '(' — the real declaration is `useState<Map<string,
   * THREE.Vector2>>(new Map())`, so a snippet ending in `useState(` matched
   * nothing and this check silently passed while the construct it forbids sat
   * in the file. Three of these four were failing loudly; this one had never
   * been able to fail at all.
   */
  'const [screenPositions, _setScreenPositions] = useState'
];

const lineCount = (value) => value.split(/\r?\n/).length;
const regexCount = (value, regex) => {
  const matches = value.match(regex);
  return matches ? matches.length : 0;
};

const main = async () => {
  const errors = [];

  const [interactivitySource, globeSource] = await Promise.all([
    readFile(interactivityPath, 'utf8'),
    readFile(globePath, 'utf8')
  ]);

  const interactivityLines = lineCount(interactivitySource);
  const interactivityEffects = regexCount(interactivitySource, /useEffect\(/g);

  if (interactivityLines > MAX_INTERACTIVITY_LINES) {
    errors.push(
      `Enhanced3DGlobeInteractivity.tsx exceeds max lines (${interactivityLines} > ${MAX_INTERACTIVITY_LINES}).`
    );
  }

  if (interactivityEffects > MAX_INTERACTIVITY_EFFECTS) {
    errors.push(
      `Enhanced3DGlobeInteractivity.tsx exceeds max useEffect count (${interactivityEffects} > ${MAX_INTERACTIVITY_EFFECTS}).`
    );
  }

  REQUIRED_IMPORT_SNIPPETS.forEach((snippet) => {
    if (!interactivitySource.includes(snippet)) {
      errors.push(`Missing required extracted-hook import in Enhanced3DGlobeInteractivity.tsx: ${snippet}`);
    }
  });

  FORBIDDEN_INLINE_SNIPPETS.forEach((snippet) => {
    if (interactivitySource.includes(snippet)) {
      errors.push(`Found forbidden inline legacy logic in Enhanced3DGlobeInteractivity.tsx: ${snippet}`);
    }
  });

  if (!globeSource.includes("from './Enhanced3DGlobeInteractivity'")) {
    errors.push('Globe.tsx must import Enhanced3DGlobeInteractivity as canonical interactivity entry.');
  }

  if (!globeSource.includes('<Enhanced3DGlobeInteractivity')) {
    errors.push('Globe.tsx must render Enhanced3DGlobeInteractivity in runtime wiring.');
  }

  if (errors.length > 0) {
    console.error('\n[guard:globe-fitness] FAILED');
    errors.forEach((entry) => console.error(`- ${entry}`));
    process.exit(1);
  }

  console.log('[guard:globe-fitness] PASS', {
    interactivityLines,
    interactivityEffects,
    maxLines: MAX_INTERACTIVITY_LINES,
    maxEffects: MAX_INTERACTIVITY_EFFECTS
  });
};

main().catch((error) => {
  console.error('[guard:globe-fitness] ERROR', error);
  process.exit(1);
});