#!/usr/bin/env node
/**
 * Publishes the share-handle contract to /.well-known/starcom-share-contract.json
 *
 * ─── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 *
 * `window.__starcomShareCard` is how Mecha Jono produces every image it posts.
 * Mecha Jono is a separate codebase on its own release schedule, so it cannot
 * be recompiled when this one changes — the same condition that made Starcom
 * publish a node descriptor rather than expect consumers to read its source.
 *
 * An agent should be able to ask what it is talking to BEFORE it drives it,
 * and get an answer from the deployment rather than from a README that may
 * describe a different build. Fetching this file tells it the API version and
 * the exact surface that version guarantees.
 *
 * It is emitted from src/features/globe/capture/shareHandleContract.ts, which
 * is also what the running app builds its handle from and what the tests
 * assert against. One declaration, three consumers; nothing here is retyped.
 *
 * Run under tsx so the TypeScript source is the single source of truth —
 * the same treatment publish-node-descriptor gets, and for the same reason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHARE_HANDLE_CONTRACT,
  SHARE_HANDLE_FINGERPRINT,
  stableContractString,
} from '../src/features/globe/capture/shareHandleContract';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../public/.well-known/starcom-share-contract.json');

/*
 * Refuse to publish a contract whose fingerprint does not match its
 * declaration. The tests check this too, but a publish step that emits a
 * contract nobody re-versioned would put the stale promise on a public URL,
 * which is worse than a failing test — somebody could build against it.
 */
const actual = stableContractString(SHARE_HANDLE_CONTRACT);
if (actual !== SHARE_HANDLE_FINGERPRINT) {
  console.error('\n  SHARE CONTRACT NOT PUBLISHED\n');
  console.error('  The contract has changed and its fingerprint has not been updated, so the');
  console.error('  version may not have been bumped either. Publishing it would put an');
  console.error('  unreviewed promise at a public URL.\n');
  console.error(`  declared:  ${actual}`);
  console.error(`  recorded:  ${SHARE_HANDLE_FINGERPRINT}\n`);
  console.error('  Update SHARE_HANDLE_FINGERPRINT and bump SHARE_HANDLE_VERSION together.\n');
  process.exit(1);
}

const document = {
  ...SHARE_HANDLE_CONTRACT,
  /*
   * Stated so a reader is not left to infer it. The handle is attached by the
   * globe view, so an agent that fetched this from a page without the globe up
   * would otherwise conclude the deployment was broken.
   */
  availableOn: 'any page rendering the 3D globe',
  note: 'Attached to window once the globe view mounts. Check `version` before calling. '
    + 'The provenance payload a card carries is versioned separately, as schemaVersion.',
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(document, null, 2)}\n`);

console.log('\n  SHARE CONTRACT PUBLISHED');
console.log(`  v${SHARE_HANDLE_CONTRACT.version} — ${Object.keys(SHARE_HANDLE_CONTRACT.methods).join(', ')}`);
console.log('  /.well-known/starcom-share-contract.json\n');
