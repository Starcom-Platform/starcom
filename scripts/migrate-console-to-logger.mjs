#!/usr/bin/env node
/**
 * Console-to-Logger Migration Script
 *
 * Mechanically converts raw `console.*` calls to use the centralized logger:
 *   console.log(...)   → log.debug(...)
 *   console.warn(...)  → log.warn(...)
 *   console.error(...) → log.error(...)
 *   console.info(...)  → log.info(...)
 *   console.debug(...) → log.debug(...)
 *
 * Adds the required import and logger instantiation at the top of each file.
 *
 * Usage:
 *   node scripts/migrate-console-to-logger.mjs             # dry-run
 *   node scripts/migrate-console-to-logger.mjs --apply      # apply changes
 *   node scripts/migrate-console-to-logger.mjs --apply --verbose
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '..', 'src');
const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

// Files/directories to skip
const SKIP_PATTERNS = [
  /\/(test|spec|__tests__|testing|examples?)\//i,
  /\.(test|spec)\.(ts|tsx)$/i,
  /\/logger\.ts$/,           // Don't modify the logger itself
  /\/debugLogger\.ts$/,
  /\/errorLogger\.ts$/,
  /\/SecureLogger\.ts$/,
  /\/NetRunnerLogger\.ts$/,
];

// Map console methods to logger methods
const METHOD_MAP = {
  'console.log':   'log.debug',
  'console.warn':  'log.warn',
  'console.error': 'log.error',
  'console.info':  'log.info',
  'console.debug': 'log.debug',
};

const stats = {
  filesScanned: 0,
  filesModified: 0,
  filesSkipped: 0,
  statementsConverted: 0,
  importAdded: 0,
  errors: [],
};

/**
 * Recursively collect all .ts and .tsx files under a directory.
 */
function collectFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      results.push(...collectFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Check if a file should be skipped.
 */
function shouldSkip(filePath) {
  const relative = path.relative(SRC_DIR, filePath);
  return SKIP_PATTERNS.some(pat => pat.test(relative) || pat.test(filePath));
}

/**
 * Extract a clean prefix from the filename (e.g., "IPFSService" from "IPFSService.ts").
 */
function prefixFromFile(filePath) {
  return path.basename(filePath).replace(/\.(ts|tsx)$/, '');
}

/**
 * Determine the correct import path based on file location.
 */
function resolveImportPath(filePath) {
  // Use the @utils alias which is configured in vite and tsconfig
  return '@utils/logger';
}

/**
 * Process a single file: replace console.* calls and add logger import.
 */
function processFile(filePath) {
  stats.filesScanned++;

  if (shouldSkip(filePath)) {
    stats.filesSkipped++;
    return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  // Check if file has any console.* calls
  const consoleRegex = /\bconsole\.(log|warn|error|info|debug)\s*\(/g;
  const matches = content.match(consoleRegex);
  if (!matches || matches.length === 0) return;

  // Check if file already imports from our logger
  const alreadyImportsLogger = /import\s+.*from\s+['"]@utils\/logger['"]/.test(content)
    || /import\s+.*from\s+['"]\.\.?\/.*logger['"]/.test(content);

  // Check if file already has a `const log = ` declaration (from previous run)
  const alreadyHasLogConst = /const\s+log\s*=\s*createLogger/.test(content);

  // Replace console.* calls
  let converted = 0;
  for (const [from, to] of Object.entries(METHOD_MAP)) {
    const pattern = new RegExp(from.replace('.', '\\.') + '\\s*\\(', 'g');
    const beforeCount = (content.match(pattern) || []).length;
    if (beforeCount > 0) {
      content = content.replace(pattern, to + '(');
      converted += beforeCount;
    }
  }

  if (converted === 0) return;

  // Add import and logger constant if not already present
  if (!alreadyImportsLogger) {
    const importPath = resolveImportPath(filePath);
    const importStatement = `import { createLogger } from '${importPath}';`;
    const prefix = prefixFromFile(filePath);
    const loggerConst = `const log = createLogger({ prefix: '${prefix}' });`;

    // Find the end of the last complete import block using a line-by-line scanner.
    // This correctly handles multi-line imports like:
    //   import {
    //     Foo,
    //     Bar,
    //   } from 'module';
    const lines = content.split('\n');
    let lastImportEndLine = -1;
    let inImport = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Detect start of an import
      if (trimmed.startsWith('import ') || trimmed.startsWith('import\t')) {
        inImport = true;
      }

      // If we're inside an import, check if this line completes it
      if (inImport) {
        // An import is complete when the line contains `from '...'` (with optional semicolon)
        // or is a simple side-effect import like `import './styles.css';`
        if (/from\s+['"]/.test(line) || /^import\s+['"]/.test(trimmed)) {
          lastImportEndLine = i;
          inImport = false;
        }
      }
    }

    if (lastImportEndLine >= 0) {
      // Insert after the last complete import line
      const insertLines = [importStatement, ...(alreadyHasLogConst ? [] : [loggerConst])];
      lines.splice(lastImportEndLine + 1, 0, ...insertLines);
      content = lines.join('\n');
    } else {
      // No imports found — insert at the top after any leading comment block
      const insertLines = [importStatement, ...(alreadyHasLogConst ? [] : [loggerConst]), ''];
      // Find first non-comment, non-empty line
      let insertIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('*/') || t === '') {
          insertIdx = i + 1;
        } else {
          break;
        }
      }
      lines.splice(insertIdx, 0, ...insertLines);
      content = lines.join('\n');
    }
    stats.importAdded++;
  } else if (!alreadyHasLogConst) {
    // Has import but no log const — add const after the import line
    const importLine = content.match(/import\s+.*from\s+['"]@utils\/logger['"].*\n/);
    if (importLine) {
      const insertPos = importLine.index + importLine[0].length;
      const prefix = prefixFromFile(filePath);
      const loggerConst = `const log = createLogger({ prefix: '${prefix}' });\n`;
      content = content.slice(0, insertPos) + loggerConst + content.slice(insertPos);
    }
  }

  stats.statementsConverted += converted;
  stats.filesModified++;

  if (VERBOSE) {
    const relative = path.relative(SRC_DIR, filePath);
    console.log(`  ${relative}: ${converted} statements converted`);
  }

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\n📋 Console-to-Logger Migration ${DRY_RUN ? '(DRY RUN)' : '(APPLYING CHANGES)'}`);
console.log(`   Source: ${SRC_DIR}\n`);

const files = collectFiles(SRC_DIR);
for (const file of files) {
  try {
    processFile(file);
  } catch (err) {
    stats.errors.push({ file, error: err.message });
  }
}

console.log(`\n📊 Results:`);
console.log(`   Files scanned:     ${stats.filesScanned}`);
console.log(`   Files skipped:     ${stats.filesSkipped} (test/spec/logger files)`);
console.log(`   Files modified:    ${stats.filesModified}`);
console.log(`   Imports added:     ${stats.importAdded}`);
console.log(`   Statements converted: ${stats.statementsConverted}`);

if (stats.errors.length > 0) {
  console.log(`\n❌ Errors (${stats.errors.length}):`);
  for (const { file, error } of stats.errors) {
    console.log(`   ${path.relative(SRC_DIR, file)}: ${error}`);
  }
}

if (DRY_RUN) {
  console.log(`\n💡 This was a dry run. Use --apply to write changes.`);
} else {
  console.log(`\n✅ Changes applied successfully.`);
}
