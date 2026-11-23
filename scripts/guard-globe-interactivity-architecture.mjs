#!/usr/bin/env node
// @asserts Only the canonical globe interactivity file exists; the retired legacy siblings have not come back.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, 'src');
const globeRoot = path.join(srcRoot, 'components', 'Globe');

const LEGACY_IMPORT_PATTERNS = [
  "./EnhancedGlobeInteractivity",
  "./EnhancedGlobeInteractivityV2",
  "../Globe/EnhancedGlobeInteractivity",
  "../Globe/EnhancedGlobeInteractivityV2"
];

// P6: Legacy siblings retired — only the canonical file is allowed
const ALLOWED_INTERACTIVITY_FILES = new Set([
  'Enhanced3DGlobeInteractivity.tsx'
]);

// P6: These files must NOT exist in the production Globe directory
const RETIRED_FILES = [
  'EnhancedGlobeInteractivity.tsx',
  'EnhancedGlobeInteractivityV2.tsx'
];

const isTestFile = (filePath) => {
  return (
    filePath.includes(`${path.sep}__tests__${path.sep}`)
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath)
  );
};

const walk = async (dirPath) => {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // Skip archived directories
      if (entry.name === '__archived__') continue;
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
};

const toRepoRelative = (absPath) => path.relative(repoRoot, absPath).split(path.sep).join('/');

const main = async () => {
  const errors = [];

  const globeEntries = await readdir(globeRoot, { withFileTypes: true });
  const productionInteractivityFiles = globeEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /Interactivity.*\.tsx$/.test(name));

  const disallowedInteractivityFiles = productionInteractivityFiles.filter(
    (name) => !ALLOWED_INTERACTIVITY_FILES.has(name)
  );

  if (disallowedInteractivityFiles.length > 0) {
    errors.push(
      `Disallowed Globe interactivity file(s) detected: ${disallowedInteractivityFiles.join(', ')}.`
      + ' Add new logic via canonical interactivity architecture, not new sibling files.'
    );
  }

  // P6: Verify retired legacy files are not present in the production Globe directory
  for (const retired of RETIRED_FILES) {
    if (productionInteractivityFiles.includes(retired)) {
      errors.push(
        `Retired legacy file "${retired}" still exists in Globe directory. It must remain in __archived__/.`
      );
    }
  }

  const srcFiles = (await walk(srcRoot)).filter((filePath) => /\.[jt]sx?$/.test(filePath));

  for (const filePath of srcFiles) {
    if (isTestFile(filePath)) {
      continue;
    }

    const relativePath = toRepoRelative(filePath);

    const content = await readFile(filePath, 'utf8');
    for (const pattern of LEGACY_IMPORT_PATTERNS) {
      if (content.includes(pattern)) {
        errors.push(`${relativePath} imports legacy interactivity component via "${pattern}".`);
      }
    }
  }

  const globeEntryPath = path.join(globeRoot, 'Globe.tsx');
  const globeContent = await readFile(globeEntryPath, 'utf8');
  if (!globeContent.includes("from './Enhanced3DGlobeInteractivity'")) {
    errors.push('Globe.tsx must import Enhanced3DGlobeInteractivity as canonical runtime interactivity path.');
  }

  if (errors.length > 0) {
    console.error('\n[guard:globe-architecture] FAILED');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('[guard:globe-architecture] PASS');
};

main().catch((error) => {
  console.error('[guard:globe-architecture] ERROR', error);
  process.exit(1);
});
