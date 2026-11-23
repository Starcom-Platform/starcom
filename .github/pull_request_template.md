## What changed, for the people who use it

## Why (the decision, finding or story it serves)

## Checked
- [ ] `npm run verify -- --quick` (guards, typecheck, conformance)
- [ ] The tests near the change (`npx vitest run <folder>`)
- [ ] Words a person sees, in all six languages
- [ ] If it changes what a person sees or does: the walk (`scripts/audit-intern.mjs --only=…`), or a new story
- [ ] If it touches the globe's interactivity: `npm run guard:globe-architecture`, and the canonical path (`Globe.tsx` → `Enhanced3DGlobeInteractivity.tsx`) kept

## Risk, and how to undo it
