/**
 * Writes docs/spec/kinds.md, the table of every Nostr event kind Starcom uses, from the kind registry
 * (src/services/nostr/kindRegistry.ts). With --check it writes nothing and fails when the published table differs
 * from what the registry says now, so the table in the specs cannot drift from the code (`npm run guards` runs it).
 *
 *   tsx --tsconfig tsconfig.app.json scripts/kinds-table.ts          rewrite docs/spec/kinds.md
 *   tsx --tsconfig tsconfig.app.json scripts/kinds-table.ts --check  fail when it is out of date
 */
import fs from 'node:fs';
import path from 'node:path';
import { KIND_USE, PROTOCOL_KINDS, APP_KINDS, BORROWED_KINDS, UNGOVERNED_KINDS, retentionOf } from '../src/services/nostr/kindRegistry';

const OUT = path.join(process.cwd(), 'docs', 'spec', 'kinds.md');

const groupOf = (kind: number): string => {
  if (Object.values(PROTOCOL_KINDS).includes(kind as never)) return 'Specified by Starcom';
  if (Object.values(APP_KINDS).includes(kind as never)) return 'Starcom app';
  if (Object.values(BORROWED_KINDS).includes(kind as never)) return 'From a NIP or another app';
  if (Object.values(UNGOVERNED_KINDS).includes(kind as never)) return 'From a NIP or another app';
  return 'From a NIP or another app';
};

const RETENTION: Record<string, string> = {
  regular: 'regular', replaceable: 'replaceable', ephemeral: 'ephemeral (relays keep none)', addressable: 'addressable', other: 'regular',
};

const cell = (text: string | undefined) => (text ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function table(): string {
  const rows = Object.entries(KIND_USE)
    .map(([k, use]) => ({ kind: Number(k), use }))
    .sort((a, b) => a.kind - b.kind);
  const lines = [
    '# Nostr event kinds Starcom uses',
    '',
    'Generated from `src/services/nostr/kindRegistry.ts` by `scripts/kinds-table.ts`; do not edit by hand.',
    '`npm run guards` fails when this table and the registry disagree.',
    '',
    'For the kinds Starcom specifies, the wire format is in [`starcom-navcom-interchange.spec.md`](starcom-navcom-interchange.spec.md)',
    'and [`nip-draft-attested-claims.md`](nip-draft-attested-claims.md). Retention follows NIP-01: kinds 0 and 3, and',
    '10000–19999, replaceable; 20000–29999 ephemeral; 30000–39999 addressable (replaced by kind, author and `d` tag);',
    'the rest regular.',
    '"Dormant" means the code holds it but no screen reaches it.',
    '',
    '| Kind | Name | Retention | Group | Starcom publishes | Starcom reads | Signed, never sent | Dormant |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map(({ kind, use }) => `| \`${kind}\` | ${cell(use.name)} | ${kind === 0 || kind === 3 ? 'replaceable' : RETENTION[retentionOf(kind)]} | ${groupOf(kind)} | ${cell(use.publishes)} | ${cell(use.reads)} | ${cell(use.signs && !use.publishes ? use.signs : '')} | ${cell(use.dormant)} |`),
    '',
  ];
  return lines.join('\n');
}

const wanted = table();
if (process.argv.includes('--check')) {
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (have !== wanted) {
    console.error('docs/spec/kinds.md is out of date with the kind registry. Run: tsx --tsconfig tsconfig.app.json scripts/kinds-table.ts');
    process.exit(1);
  }
  console.log(`Kinds table guard passed: docs/spec/kinds.md matches the registry (${Object.keys(KIND_USE).length} kinds).`);
} else {
  fs.writeFileSync(OUT, wanted);
  console.log(`Wrote docs/spec/kinds.md (${Object.keys(KIND_USE).length} kinds).`);
}
