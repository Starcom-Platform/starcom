/**
 * The share handle's spec page (decided 2026-10-05): hand-written prose, and a
 * reference built from the handle's own type (ShareHandle in
 * useGlobeShareCard.ts) and the published contract, so the page cannot
 * describe a different build. publish-share-spec.mjs writes it at build time;
 * guard-share-spec.mjs holds the prose and the code together.
 *
 * Plain JavaScript on purpose: the guards run under node, and the contract is
 * read as the JSON the build already publishes.
 */
import ts from 'typescript';

const MARKER = '<!-- reference -->';

/** Each method on ShareHandle: its doc comment, and every signature it is declared with. */
export function methodDocs(source) {
  const file = ts.createSourceFile('useGlobeShareCard.ts', source, ts.ScriptTarget.Latest, true);
  let handle;
  file.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'ShareHandle') handle = node;
  });
  if (!handle) throw new Error('ShareHandle is not declared in this source.');
  const docs = {};
  for (const member of handle.members) {
    if (!ts.isMethodSignature(member)) continue;
    const name = member.name.getText(file);
    const doc = ts.getJSDocCommentsAndTags(member)
      .filter((d) => ts.isJSDoc(d))
      .map((d) => (typeof d.comment === 'string' ? d.comment : ts.getTextOfJSDocComment(d.comment) ?? ''))
      .join('\n\n')
      .trim();
    docs[name] ??= { doc: '', signatures: [] };
    if (doc) docs[name].doc = docs[name].doc ? `${docs[name].doc}\n\n${doc}` : doc;
    docs[name].signatures.push(member.getText(file).replace(/\s+/g, ' ').replace(/;$/, ''));
  }
  return docs;
}

/** The versions the prose's history names, in order. */
export function versionsListed(prose) {
  const start = prose.indexOf('\n## Versions');
  if (start < 0) return [];
  const end = prose.indexOf('\n## ', start + 4);
  const section = prose.slice(start, end < 0 ? undefined : end);
  return [...new Set([...section.matchAll(/^- \*\*v(\d+)\*\*/gm)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

const code = (items) => items.map((i) => `\`${i}\``).join(', ');
const human = (key) => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const SKIP = new Set(['name', 'version', 'properties', 'methods', 'returns', 'note', 'availableOn']);

const isScalar = (v) => v === null || typeof v !== 'object';
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** A value in a line or a cell: a word, a list, or a size (a pair of numbers). */
const inline = (v) => {
  if (isScalar(v)) return String(v);
  if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')) return `${v[0]} × ${v[1]}`;
  if (Array.isArray(v) && v.every(isScalar)) return code(v);
  return `\`${JSON.stringify(v)}\``;
};
/** Records as a table: a column for every field any of them has. */
const table = (rows) => {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => (v === undefined ? '' : Array.isArray(v) && v.every(isScalar) ? v.join(', ') : inline(v).replace(/\|/g, '\\|'));
  return [`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`)].join('\n');
};

/** One vocabulary, as a person reads it: a list, a table, or lines; JSON only for what is none of those. */
function vocabulary(value) {
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return code(value);
    if (value.every(isRecord)) return table(value);
  }
  if (isRecord(value)) {
    if (Array.isArray(value.built)) {
      const lines = [];
      if (value.version !== undefined) lines.push(`Version ${value.version}.`);
      lines.push(`Built: ${code(value.built)}.`);
      if (Array.isArray(value.notBuilt) && value.notBuilt.length) lines.push(`Not built yet: ${code(value.notBuilt)}.`);
      return lines.join('\n\n');
    }
    return Object.entries(value).map(([k, v]) => (Array.isArray(v) && v.length && v.every(isRecord)
      ? `- \`${k}\`:\n\n${table(v)}\n`
      : `- \`${k}\`: ${inline(v)}`)).join('\n');
  }
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

/** The served page: the prose, with the reference where the prose marks it. */
export function renderShareSpec(prose, source, contract) {
  const docs = methodDocs(source);
  const methods = Object.keys(contract.methods).map((name) => {
    const d = docs[name] ?? { doc: '', signatures: [] };
    const { options = [] } = contract.methods[name];
    const returns = contract.returns?.[name];
    return [
      `### \`${name}\``,
      d.doc,
      `\`\`\`ts\n${d.signatures.join('\n')}\n\`\`\``,
      options.length ? `Options: ${code(options)}.` : 'No options.',
      returns ? `Returns: ${code(returns)}.` : '',
    ].filter(Boolean).join('\n\n');
  });
  const vocab = Object.keys(contract).filter((k) => !SKIP.has(k)).map((k) => `### ${human(k)}\n\n${vocabulary(contract[k])}`);
  const reference = [
    `## Reference: contract version ${contract.version}`,
    'Built from the handle’s own type and the contract when this deployment was built. The same contract, machine-readable, is at [`/.well-known/starcom-share-contract.json`](/.well-known/starcom-share-contract.json).',
    `${contract.note ?? ''} Available on ${contract.availableOn ?? 'the globe'}.`.trim(),
    ...methods,
    '## Vocabularies',
    'Every list the contract holds, as this build has it.',
    ...vocab,
  ].join('\n\n');
  return prose.replace(MARKER, reference);
}

/** What keeps the page from describing this build, in words; empty when it does. */
export function shareSpecProblems(prose, source, contract) {
  const problems = [];
  if (!prose.includes(MARKER)) problems.push(`The prose has no ${MARKER} line for the reference to go in.`);
  if (!versionsListed(prose).includes(contract.version)) problems.push(`The history has no entry for v${contract.version}, the version in force.`);
  const docs = methodDocs(source);
  for (const name of Object.keys(contract.methods)) {
    if (!docs[name]) problems.push(`${name} is in the contract and not on ShareHandle, so it has no description.`);
    else if (!docs[name].doc) problems.push(`${name} has no doc comment on ShareHandle.`);
  }
  for (const name of Object.keys(docs)) {
    if (!contract.methods[name]) problems.push(`${name} is on ShareHandle and not in the contract.`);
  }
  return problems;
}
